# MicLayer — Audio Engine

This document is the engineering contract for the real-time audio engine. If you're contributing to anything under `engine/`, read this in full.

## 1. Goals

1. Capture a single user-selected input device.
2. Apply a deterministic, modular DSP chain.
3. Hand processed frames to a `VirtualMicSink` for delivery to consumers.
4. Glitch-free, dropout-free operation under realistic Windows desktop load.
5. Decouple completely from the UI process — UI may be busy or unresponsive without affecting audio.

## 2. Engine state machine

```
                +-----------+
                |  Stopped  | <----------------------------+
                +-----------+                              |
                      |                                    |
              start() | open device                        |
                      v                                    |
                +-----------+    error    +------------+   |
                | Starting  |------------>|  Faulted   |---+
                +-----------+             +------------+
                      |                          ^
              started |                          | recoverable error
                      v                          |
                +-----------+                    |
                |  Running  |--------------------+
                +-----------+
                      |
              stop()  |
                      v
                +-----------+
                |  Stopping |
                +-----------+
                      |
                      v
                +-----------+
                |  Stopped  |
                +-----------+
```

State transitions emit `engine.status` events. The audio thread itself does not own the state — a separate `EngineController` does. The audio thread only knows "process the next buffer" or "the stream was closed."

## 3. Real-time rules

The following are **invariants in the audio callback** (input capture / processing / output write). They are enforced by code review, clippy lints where possible, and a soak test in CI.

1. **No allocation.** No `Vec::new`, no `Vec::push` that may reallocate, no `Box::new`, no `String` building, no `format!`. All buffers are pre-allocated with capacity at engine start.
2. **No locking.** No `Mutex::lock`, no `RwLock`, no `parking_lot` locks. Cross-thread state moves via `rtrb` (ring buffer) or `triple_buffer` (for params snapshots).
3. **No logging.** No `log::info!`, `log::error!`, `println!`, `eprintln!` etc. Logs are pushed into a ring drained by a non-real-time thread.
4. **No I/O.** No filesystem, no network, no Tauri commands.
5. **No panic.** No `unwrap()`, no `expect()`, no `assert!` that may be hit at runtime. Audio code uses `Result` and returns silence on unrecoverable error while raising a fault flag.
6. **No syscalls that may block.** No `thread::sleep`, no `wait`, no `recv` without `try_recv`.
7. **Bounded work per callback.** Each module must process a buffer in O(samples), no hidden quadratic costs, no SIMD that compiles to scalar fallbacks on supported targets.

The audio thread acquires real-time priority via Windows' MMCSS (`AvSetMmThreadCharacteristicsW(L"Pro Audio")`). cpal's WASAPI backend handles this for us when configured.

## 4. Module contract

Every DSP module in `engine/dsp/` implements:

```rust
pub trait Module: Send {
    type Params: Clone + Send;

    /// Construct, allocating all buffers needed for the worst-case
    /// (max block size, max channels, target sample rate).
    fn new(spec: ModuleSpec) -> Self where Self: Sized;

    /// Called from the control thread. The params are *staged*; the
    /// audio thread reads them on its next callback via triple_buffer.
    fn stage_params(&self, p: Self::Params);

    /// Called once per audio callback, in place, on `n` interleaved frames.
    /// MUST honour the real-time rules in §3.
    fn process(&mut self, buf: &mut [f32], channels: usize, sample_rate: u32);

    /// Optional cheap reset for state (e.g. compressor envelope) on
    /// engine start, device change, or "reset module" UI action.
    fn reset(&mut self) {}

    /// Bypass: when true, `process` must be effectively identity.
    fn set_bypass(&self, bypass: bool);
}
```

Each module is responsible for:
- Reading the *currently active* params via its `triple_buffer` reader on the audio thread.
- Reset behaviour on sample-rate / channel-count change (these are not expected mid-stream, but engine restart is).

## 5. Buffer flow

Pseudocode of the engine's input callback:

```rust
// On the audio capture thread, called by cpal/WASAPI ~every `block_size` samples.
fn on_input(frames_in: &[f32], channels: usize, sample_rate: u32) {
    let buf = &mut self.work_buf[..frames_in.len()];
    buf.copy_from_slice(frames_in);                       // bounded copy, no alloc

    if let Some(raw_view) = self.raw_tap.try_write_slice(buf) {
        // optional raw side-tap for "Raw" monitoring; may be dropped if full
    }

    if !self.raw_mode {
        self.input_gain.process(buf, channels, sample_rate);
        self.high_pass.process(buf, channels, sample_rate);
        self.noise_suppression.process(buf, channels, sample_rate);
        self.gate.process(buf, channels, sample_rate);
        self.eq.process(buf, channels, sample_rate);
        self.compressor.process(buf, channels, sample_rate);
        self.de_esser.process(buf, channels, sample_rate);
        self.limiter.process(buf, channels, sample_rate);
        self.output_gain.process(buf, channels, sample_rate);
    }

    self.meter_tap.observe(buf);                          // push level events into ring

    if self.muted {
        buf.fill(0.0);
    }

    if let Err(e) = self.sink.write(buf) {
        self.fault_ring.try_push(EngineFault::SinkWrite(e));
        // continue; do not panic
    }
}
```

Things that are **not** in this callback:
- Building a "Vec\<f32\>" — `work_buf` is preallocated.
- A lock for `self.muted` — it's an `AtomicBool` written by the control thread.
- A lock for the params — each module has its own `triple_buffer::Output<Params>` it reads at top of `process`.

## 6. Cross-thread state

| State | Type | Writer | Reader |
|---|---|---|---|
| `muted` | `AtomicBool` | UI/control | Audio cb |
| `raw_mode` | `AtomicBool` | UI/control | Audio cb |
| `bypass[module]` | `AtomicBool` per module | UI/control | Audio cb |
| Module params | `triple_buffer::Input<Params>` → `Output<Params>` | UI/control | Audio cb |
| Meter samples | `rtrb::Producer<MeterSample>` | Audio cb | Drain thread |
| Engine faults | `rtrb::Producer<EngineFault>` | Audio cb | Drain thread |
| Engine state | `parking_lot::RwLock<EngineState>` | EngineController | UI |

Only the bottom row uses a lock, and never from the audio thread.

## 7. Soak test (CI)

A binary `engine-soak` is built and run on Windows GitHub runners:

- Generates 60 minutes of synthetic mic input (sine + white noise + speech-shaped noise).
- Feeds it through the engine with the `Streaming` starter profile applied.
- Counts dropouts (any input callback where processing time > 90% of the buffer period).
- Verifies sink writes are continuous (no gaps or duplicates).
- Asserts allocations on the audio thread = 0, via a custom global allocator that panics on alloc from threads tagged `audio`.

Run locally with `cargo run -p engine-soak --release -- --minutes 5`.

## 8. Sample-rate and format handling

- Internal pipeline: **48 kHz**, **f32**, **mono** (most mics are mono; we discard stereo channel 1 from devices that report stereo with one dead channel). Stereo mics are handled separately as a flag in the input config — they are processed as mono with downmix unless the user explicitly opts into stereo (advanced setting; not in v1 UI).
- Input: cpal opens the device at the user-chosen rate (default 48 kHz). If the device only supports 44.1, we resample with `rubato` (linear-phase polyphase, runs on audio thread with preallocated state).
- Output: the sink writes at its native rate; if it differs from 48 kHz, we resample on egress.
- Block size: cpal-decided, typically 480 frames at 48 kHz (10 ms). The DSP modules accept any block size up to a compile-time `MAX_BLOCK = 4096`.

## 9. Test-recording capture

When the UI calls `engine_start_test_recording`, a side-tap is enabled:

- Captures `raw` and `processed` frames into two separate ring buffers, each ≤ 30 s.
- A non-real-time writer thread drains both rings into two WAV files in `%APPDATA%\MicLayer\recordings\`.
- On `engine_stop_test_recording`, returns both file paths.
- Files are deleted on app quit unless the user clicks "Save".

The recording feature does **not** alter the live signal. Side-tap, not insertion.

## 10. Auto-tune wizard pipeline

When the wizard runs, it disables the DSP chain, drives input gain to a known reference, and analyses three captured passes:

1. **Silence (5 s):** measure noise floor (RMS, spectrum centroid, peak). Decide:
   - Suggested high-pass cutoff if low-end rumble dominates.
   - Suggested noise-suppression level.
2. **Normal speech (5-10 s):** measure typical peak and RMS. Decide:
   - Input gain target (so normal speech sits around -18 dBFS RMS).
   - Compressor threshold (a few dB above RMS).
   - Gate threshold (between noise floor and speech low end).
3. **Loud speech (3-5 s):** measure max peak. Decide:
   - Whether a limiter ceiling is needed below 0 dBFS.
   - Whether de-esser is needed (compare 5-8 kHz band energy vs 1-3 kHz).

Each decision produces both a parameter value and a plain-English explanation, which the UI displays as a list. The user clicks "Apply" to create a new profile or "Adjust" to tweak.

## 11. Engine error taxonomy

| Variant | Severity | Recovery |
|---|---|---|
| `InputDeviceMissing` | User-fixable | Show device picker; user selects new input |
| `InputDeviceBusy` (exclusive) | User-fixable | Show "another app is using your mic"; offer retry |
| `SinkUnavailable` (no VB-CABLE / driver) | User-fixable | Show install/repair backend dialog |
| `SinkWrite` (transient) | Transient | Auto-retry up to N consecutive callbacks, then fault |
| `FormatMismatch` | User-fixable | Offer to change sample rate or buffer size |
| `DspPanic` (caught at boundary) | Engine-fatal | Stop engine, surface to UI, write log, await restart |
| `Unknown` | Engine-fatal | As above |

Boundary catching: each module's `process` is called from a thin wrapper that uses `catch_unwind` (under a `cfg(feature = "panic-catch")` so it can be disabled in tests) to convert unexpected panics into a logged `DspPanic` without taking the audio thread down.

## 12. Latency accounting

Latency budget at 48 kHz, shared-mode WASAPI, 10 ms block:

| Stage | Latency contribution |
|---|---|
| Input capture buffer | ~10 ms |
| DSP processing | < 1 ms (target) |
| Noise suppression lookahead (RNNoise) | ~10 ms |
| Limiter lookahead | ~2 ms (if enabled, otherwise 0) |
| Output sink buffer | ~5-10 ms |
| **Total** | **~25-30 ms with all on, ~15-20 ms with NS off** |

Honest about this in Diagnostics: the latency number shown is measured, not estimated.

## 13. Module file layout

```
engine/
  audio/         -- capture, sink coordination, engine controller, soak test
    src/
      lib.rs
      engine.rs
      capture.rs
      controller.rs
      meters.rs
      faults.rs
  dsp/           -- DSP modules
    src/
      lib.rs
      gain.rs
      high_pass.rs
      noise_suppression.rs
      gate.rs
      eq.rs
      compressor.rs
      de_esser.rs
      limiter.rs
      meters.rs
      params.rs
  devices/       -- Windows device enumeration
    src/
      lib.rs
      enumerate.rs
      monitor.rs
  virtual-mic/   -- VirtualMicSink trait and backends
    src/
      lib.rs
      sink.rs
      vb_cable.rs
      miclayer_wdm.rs       (post v1.0)
```

## 14. Out of scope for the engine

- UI rendering.
- Profile parsing (lives in `packages/shared` / Tauri command layer).
- Auto-update.
- Anything not on the mic-to-virtual-mic data path.

If you find yourself adding "convenience" features into the engine that aren't about audio capture, processing, or sink delivery, stop and put them in the controller or UI instead.
