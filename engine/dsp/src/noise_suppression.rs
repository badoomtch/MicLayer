//! Noise suppression via nnnoiseless (pure-Rust RNNoise port).
//!
//! Algorithm: 480-sample (10 ms @ 48 kHz) frames through a small recurrent
//! neural net. Local, CPU-only. The audio thread sees the algorithmic
//! latency of one frame (~10 ms) as a brief silence at engine start, then
//! steady-state operation with no extra latency beyond that.
//!
//! Real-time rules (docs/audio-engine.md §3):
//!   - All buffers pre-allocated in `new()`. The hot path uses no `Vec` ops.
//!   - No allocation. No locking. No logging in the per-sample loop.
//!   - Boxed nnnoiseless state is heap-allocated once at construction and
//!     mutated in place from the audio thread (`DenoiseState` is Send).
//!
//! nnnoiseless takes f32 samples scaled to the i16 numeric range
//! (±32768), not to the [-1, 1] normalized range. We multiply on the way
//! in and divide on the way out.

use nnnoiseless::DenoiseState;

use crate::params::NoiseSuppressionParams;
use crate::ModuleConfig;

const FRAME: usize = nnnoiseless::DenoiseState::FRAME_SIZE; // 480
/// Worst-case audio block size we'll see from cpal. Larger blocks would
/// drop samples; matches `miclayer_audio::capture::MAX_BLOCK_SAMPLES`.
const MAX_BLOCK: usize = 4096;
/// Each ring holds enough for MAX_BLOCK input + one full frame of buffered work.
const RING_CAP: usize = MAX_BLOCK + FRAME + 16;
const I16_SCALE: f32 = 32_768.0;

/// Allocation-free single-thread circular buffer with explicit count.
struct CircBuf {
    buf: Box<[f32]>,
    head: usize,
    count: usize,
}

impl CircBuf {
    fn new(cap: usize) -> Self {
        Self {
            buf: vec![0.0; cap].into_boxed_slice(),
            head: 0,
            count: 0,
        }
    }

    #[inline]
    fn cap(&self) -> usize {
        self.buf.len()
    }

    #[inline]
    fn len(&self) -> usize {
        self.count
    }

    #[inline]
    fn push(&mut self, s: f32) {
        if self.count >= self.cap() {
            // Drop on overflow. Should not happen if MAX_BLOCK is honoured.
            return;
        }
        let idx = (self.head + self.count) % self.cap();
        self.buf[idx] = s;
        self.count += 1;
    }

    #[inline]
    fn pop(&mut self) -> Option<f32> {
        if self.count == 0 {
            return None;
        }
        let s = self.buf[self.head];
        self.head = (self.head + 1) % self.cap();
        self.count -= 1;
        Some(s)
    }

    fn clear(&mut self) {
        self.head = 0;
        self.count = 0;
    }
}

pub struct NoiseSuppression {
    config: triple_buffer::Output<ModuleConfig<NoiseSuppressionParams>>,
    denoise: Box<DenoiseState<'static>>,
    /// Raw input samples awaiting accumulation to one 480-frame.
    in_ring: CircBuf,
    /// Dry copy of the input, time-aligned with the wet output ring.
    dry_ring: CircBuf,
    /// Denoised output samples ready to deliver.
    wet_ring: CircBuf,
    /// Per-frame scratch buffers — owned to avoid touching the heap in `process`.
    frame_in: Box<[f32; FRAME]>,
    frame_out: Box<[f32; FRAME]>,
    /// Bypass tracking — when disabled we passthrough and reset state so
    /// re-enable doesn't pop with a 10-ms misalignment.
    was_enabled: bool,
}

pub type NoiseSuppressionHandle = triple_buffer::Input<ModuleConfig<NoiseSuppressionParams>>;

impl NoiseSuppression {
    pub fn new() -> (Self, NoiseSuppressionHandle) {
        let initial = ModuleConfig::<NoiseSuppressionParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        let me = Self {
            config: output,
            denoise: DenoiseState::new(),
            in_ring: CircBuf::new(RING_CAP),
            dry_ring: CircBuf::new(RING_CAP),
            wet_ring: CircBuf::new(RING_CAP),
            frame_in: Box::new([0.0; FRAME]),
            frame_out: Box::new([0.0; FRAME]),
            was_enabled: false,
        };
        (me, input)
    }

    pub fn reset(&mut self) {
        self.in_ring.clear();
        self.dry_ring.clear();
        self.wet_ring.clear();
        self.was_enabled = false;
        // Reset the denoiser by replacing it. Heap alloc, but called only
        // on session start / explicit reset — not on the audio thread's hot path.
        self.denoise = DenoiseState::new();
    }

    pub fn process(&mut self, buf: &mut [f32], _sample_rate: u32) {
        let (enabled, amount) = {
            let cfg = self.config.read();
            (cfg.enabled, cfg.params.amount.clamp(0.0, 1.0))
        };

        if !enabled {
            if self.was_enabled {
                // Clear state so a future re-enable starts fresh rather
                // than emitting stale buffered samples.
                self.in_ring.clear();
                self.dry_ring.clear();
                self.wet_ring.clear();
            }
            self.was_enabled = false;
            return; // passthrough
        }
        self.was_enabled = true;

        // 1. Push raw input into in_ring and dry_ring (in i16-scaled units).
        for &s in buf.iter() {
            let scaled = s * I16_SCALE;
            self.in_ring.push(scaled);
            self.dry_ring.push(scaled);
        }

        // 2. Drain in_ring in 480-sample frames; denoise; push to wet_ring.
        while self.in_ring.len() >= FRAME {
            for i in 0..FRAME {
                self.frame_in[i] = self.in_ring.pop().unwrap_or(0.0);
            }
            let _vad = self.denoise.process_frame(
                &mut self.frame_out[..],
                &self.frame_in[..],
            );
            for i in 0..FRAME {
                self.wet_ring.push(self.frame_out[i]);
            }
        }

        // 3. Write back into buf. During the first 480-sample warmup the
        //    wet ring is empty — output zeros (silence) so we don't emit
        //    a 10 ms unmuted glitch that would later go out of sync with wet.
        for s in buf.iter_mut() {
            if self.wet_ring.len() > 0 && self.dry_ring.len() > 0 {
                let dry = self.dry_ring.pop().unwrap_or(0.0) / I16_SCALE;
                let wet = self.wet_ring.pop().unwrap_or(0.0) / I16_SCALE;
                *s = dry * (1.0 - amount) + wet * amount;
            } else {
                *s = 0.0;
            }
        }
    }
}
