# MicLayer — DSP Chain

Detailed spec for each DSP module: the signal-processing algorithm, the simple-mode mapping, the advanced parameters, and acceptance criteria.

The chain order is fixed:

```
input gain → high-pass → noise suppression → gate → EQ → compressor → de-esser → limiter → output gain
```

Re-ordering modules is not exposed to the user. Reordering exists as a debate among audio engineers; we chose this order because it's defensible (subtractive cleanup before tonal shaping before dynamics control before final ceiling) and consistent — and consistency lets profiles travel between users.

---

## 1. Input gain

**Purpose:** Set the working level of the chain before any nonlinear processing.

**Algorithm:** Multiply each sample by 10^(gain_db / 20).

**Params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `gain_db` | -24 to +24 dB | 0 dB | Smoothed over ~20 ms to avoid zipper noise on slider drag |

**Meters tap:** Post-gain peak + RMS feed the input meters.

**Acceptance:**
- Setting `+6 dB` doubles the linear amplitude.
- Sweeping the slider in real time produces no clicks.
- Negative infinity (mute) is **not** exposed here; muting is a separate atomic flag.

---

## 2. High-pass filter

**Purpose:** Remove low-frequency rumble (HVAC, desk thumps, plosives partial removal, microphone-stand vibration).

**Algorithm:** 2nd-order Butterworth high-pass biquad in transposed direct form II. In advanced mode, optionally cascade two biquads for 4th-order slope.

**Simple-mode mapping:**

| Slider position | Mode | Cutoff | Order |
|---|---|---|---|
| Off | bypass | — | — |
| Low | enabled | 60 Hz | 2nd-order |
| Medium | enabled | 80 Hz | 2nd-order |
| Strong | enabled | 120 Hz | 4th-order |

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `cutoff_hz` | 20 - 300 Hz | 80 | |
| `order` | `2nd` or `4th` | `2nd` | 4th adds latency negligibly |

**Acceptance:**
- At 80 Hz cutoff, attenuation at 40 Hz is approximately -12 dB (2nd-order) or -24 dB (4th-order).
- Filter is stable: no DC offset after 60 s of audio.

---

## 3. Noise suppression

**Purpose:** Reduce constant background noise (fans, AC hum, traffic, keyboard typing in the gaps) while preserving voice clarity.

**Algorithm:** `nnnoiseless` (pure-Rust port of Xiph RNNoise). It is a small recurrent neural net trained on noisy speech; runs frame-by-frame on 10 ms windows at 48 kHz. **Local. CPU-only. No GPU. No cloud.**

**Latency:** ~10 ms inherent lookahead.

**Simple-mode mapping:**

| Slider | Mix |
|---|---|
| Off | bypass |
| Low | 0.3 wet (mix 30% denoised with dry) |
| Medium | 0.65 wet |
| High | 1.0 wet (full RNNoise output) |

The wet/dry mix at lower settings preserves more voice naturalness at the cost of less aggressive cleanup. This is intentional — full RNNoise on a clean voice can introduce subtle artefacts.

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `amount` | 0.0 - 1.0 | 0.65 | Wet/dry mix |
| `voice_floor_db` | -60 to -20 dB | -45 | Below this, output is muted to suppress trailing noise tails (separate from gate; this just hard-clamps below the voice floor) |

**Honesty note:** We do **not** call this "AI noise cancellation" in the UI. RNNoise is a neural net, so technically it qualifies, but the term is overloaded in marketing and we'd rather under-promise. The UI calls it "Noise Suppression" and the tooltip says "local neural-net cleanup, runs on your CPU".

**Acceptance:**
- A 60 dB SNR speech-in-fan-noise sample, at `amount = 1.0`, reduces noise floor by ≥ 15 dB without introducing musical-noise artefacts above the level perceivable in a casual listen.
- On a 4-core CPU, NS at `amount = 1.0` consumes ≤ 3% CPU at 48 kHz mono.

**Fallback (if nnnoiseless ever becomes unmaintained or licence-incompatible):** a classic Wiener-filter spectral-subtraction module with a noise-profile-from-silence-pass calibration. The abstraction `NoiseSuppression` trait allows swapping.

---

## 4. Gate / expander

**Purpose:** Silence the signal when only background remains, without chopping word endings.

**Algorithm:** Downward expander with hysteresis. Looks at smoothed RMS over a configurable window; below threshold, attenuates by `range` dB with `attack` / `hold` / `release` envelopes. Hysteresis prevents flapping near the threshold.

**Simple-mode mapping ("Background Cut"):**

| Slider | Threshold | Range | Attack | Hold | Release |
|---|---|---|---|---|---|
| Off | bypass | — | — | — | — |
| 25% | -55 dB | -20 dB | 5 ms | 100 ms | 200 ms |
| 50% | -50 dB | -30 dB | 5 ms | 150 ms | 250 ms |
| 75% | -45 dB | -40 dB | 3 ms | 200 ms | 300 ms |
| 100% | -40 dB | -60 dB | 2 ms | 250 ms | 400 ms |

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `threshold_db` | -80 to -20 dB | -50 | |
| `range_db` | -60 to 0 dB | -30 | 0 = no gating |
| `attack_ms` | 0.1 - 50 | 5 | |
| `hold_ms` | 0 - 1000 | 150 | |
| `release_ms` | 10 - 1000 | 250 | |
| `hysteresis_db` | 0 - 10 dB | 3 | |

**Acceptance:**
- Word endings (low-energy tails of fricatives) at -40 dBFS are not cut off at the default threshold of -50 dB.
- Below threshold, audio is fully attenuated to `range_db`, not muted with a click.

---

## 5. EQ — Parametric, 5 bands

**Purpose:** Shape the tone of the voice. Reduce muddiness, boost intelligibility, add air or warmth.

**Algorithm:** Cascade of 5 biquad filters. Each band is one of `low_shelf`, `peak`, `high_shelf`. RBJ cookbook formulas.

**Simple-mode mapping:**

| Slider | Bands affected |
|---|---|
| `warmth` | band 1: low_shelf @ 200 Hz, gain = +`warmth/100 × 4 dB` |
| `clarity` | band 3: peak @ 3 kHz, Q = 1.0, gain = +`clarity/100 × 4 dB` |
| `presence` | band 4: peak @ 5 kHz, Q = 1.2, gain = +`presence/100 × 3 dB` |
| `air` | band 5: high_shelf @ 10 kHz, gain = +`air/100 × 4 dB` |
| `reduce_boom` | band 2: peak @ 250 Hz, Q = 1.0, gain = -`reduce_boom/100 × 6 dB` |

Simple-mode sliders override the corresponding band parameters; toggling to Advanced exposes all 5 bands directly.

**Advanced params per band:**

```jsonc
{
  "type": "peak" | "low_shelf" | "high_shelf" | "high_pass" | "low_pass",
  "frequency_hz": 250,
  "gain_db": 0,
  "q": 1.0,
  "enabled": true
}
```

**Visual feedback:** The UI draws the magnitude response of the active bands so the user can see the shape they're applying.

**Acceptance:**
- A unity-gain peak (gain_db = 0) is bit-exact identity (within 1 LSB at 24-bit).
- Solo-band ABX shows expected ~3 dB peak at the configured frequency.

---

## 6. Compressor

**Purpose:** Smooth out volume differences so quiet syllables come up and loud bursts come down, without crushing the voice.

**Algorithm:** Feed-forward compressor with smoothed RMS detection, soft knee, optional auto-makeup gain. Stereo-linked (irrelevant — we run mono).

**Detector:** RMS over a 5-30 ms window (param: `detector_ms`).

**Simple-mode mapping ("Loudness/Smoothness"):**

| Slider | Threshold | Ratio | Attack | Release | Knee | Makeup |
|---|---|---|---|---|---|---|
| 0% | bypass | — | — | — | — | — |
| 25% | -20 dB | 2:1 | 20 ms | 200 ms | 6 dB | auto |
| 50% | -22 dB | 3:1 | 12 ms | 150 ms | 6 dB | auto |
| 75% | -24 dB | 4:1 | 8 ms | 120 ms | 4 dB | auto |
| 100% | -26 dB | 6:1 | 5 ms | 100 ms | 4 dB | auto |

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `threshold_db` | -60 to 0 | -22 | |
| `ratio` | 1 to 20 | 3 | |
| `attack_ms` | 0.1 - 200 | 12 | |
| `release_ms` | 10 - 2000 | 150 | |
| `knee_db` | 0 - 24 | 6 | Soft knee width |
| `makeup_db` | -12 to +24 | 0 | Applied after compression |
| `auto_makeup` | bool | true | Auto-computes makeup to undo average gain reduction |
| `detector_ms` | 1 - 50 | 10 | RMS window |

**Acceptance:**
- 0 dB input at threshold = no compression.
- 10 dB above threshold at 4:1 yields ~10 - (10/4) = 7.5 dB above threshold output (plus makeup).
- Pumping artefacts inaudible at default release ≥ 100 ms with typical speech.

---

## 7. De-esser

**Purpose:** Tame harsh sibilance ("s", "sh", "f" sounds) without making the voice lispy.

**Algorithm:** Split-band: a high-shelf-tap detector around 5-9 kHz drives a band-limited compressor that only attenuates the sibilance band. Equivalent to a sidechain-EQ'd compressor restricted to the sibilance band.

**Simple-mode mapping ("Sibilance"):**

| Slider | Target | Threshold | Reduction |
|---|---|---|---|
| 0% | bypass | — | — |
| 25% | 7 kHz | -22 dB | up to 4 dB |
| 50% | 7 kHz | -26 dB | up to 6 dB |
| 75% | 6.5 kHz | -28 dB | up to 8 dB |
| 100% | 6 kHz | -30 dB | up to 10 dB |

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `target_hz` | 4000 - 10000 | 7000 | Centre of sibilance band |
| `threshold_db` | -50 to -10 | -26 | |
| `amount_db` | 0 - 18 | 6 | Max reduction |
| `q` | 0.5 - 4 | 1.5 | Detector bandwidth |

**Acceptance:**
- A pure sine at the target frequency at -10 dB triggers reduction ≈ amount_db.
- Voice without sibilance is not affected (detector reading stays below threshold).

---

## 8. Limiter

**Purpose:** Final brick wall — guarantee the signal never exceeds the configured ceiling, no matter what.

**Algorithm:** Lookahead peak limiter. A small lookahead buffer (~2 ms = 96 samples @ 48 kHz) lets us detect upcoming peaks and ramp gain down smoothly rather than clipping. True-peak detection is **not** implemented in v1 (inter-sample peaks may sneak through; we set a conservative ceiling to compensate).

**Simple-mode mapping ("Safety Limiter"):**

| Toggle | Ceiling | Release | Lookahead |
|---|---|---|---|
| Off | bypass | — | — |
| On | -1.0 dBFS | 50 ms | 2 ms |

**Advanced params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `ceiling_db` | -6 to 0 | -1 | dBFS |
| `release_ms` | 10 - 500 | 50 | |
| `lookahead_ms` | 0 - 10 | 2 | 0 disables lookahead (becomes clipper) |

**Acceptance:**
- No sample exceeds `ceiling_db` linear value at limiter output.
- Pumping at default settings is inaudible on typical speech.

---

## 9. Output gain

**Purpose:** Final trim into the sink. Most users won't touch this; auto-tune sets it.

**Algorithm:** Same as input gain — smoothed multiplier.

**Params:**
| Param | Range | Default | Notes |
|---|---|---|---|
| `gain_db` | -24 to +12 dB | 0 | |

**Meters tap:** Output meters and clipping detector tap here.

---

## 10. Meter design

Three meters are tapped:

1. **Input** — post-input-gain, pre-everything-else. Tells the user if their gain stage is hot.
2. **Pre-limiter** — pre-limiter, post-compressor. Tells the user how hard the chain is working.
3. **Output** — post-output-gain. Tells the user what apps will receive.

Meter values displayed:
- **Peak** — max abs sample over the last 50 ms window. Held for ~1 s with a slow decay.
- **RMS** — sliding RMS over 300 ms.

A "clip" warning fires if any sample at the output meets or exceeds 0 dBFS. The light stays on for 1 s after the most recent clip.

**Noise floor indicator** is the median RMS of the input over the last 5 s of below-gate audio (or just the last 5 s if the gate is off). Useful for the wizard and Diagnostics.

---

## 11. Cross-module concerns

### 11.1 Parameter smoothing

All gain-like params (input/output gain, makeup, EQ gain, ceiling) use a one-pole smoother with a 20-30 ms time constant to avoid zipper noise on slider drag.

### 11.2 Denormals

All filters that hold IIR state must flush denormals to zero each callback. Use `flush_denormals_to_zero!` macro (or set the FPU mode at thread init via `_MM_SET_FLUSH_ZERO_MODE`).

### 11.3 Reset

Engine restart, device change, and the "Reset" UI button call `reset()` on every module to clear filter state, envelope state, etc. This prevents weird transients after a config change.

### 11.4 Bypass

`set_bypass(true)` short-circuits a module. The state inside (filter memory, envelopes) continues to update on the sidelined dry signal so that on un-bypass, the resumed processing doesn't impulse-pop. (Optional optimisation: stop updating state to save CPU; profile later to decide.)

---

## 12. Future modules (not in v1)

Deliberately not built:

- Reverb / room emulation
- Pitch correction
- Saturation / harmonic exciter
- Multi-band compressor
- Stereo widener

Each of these is a real audio tool — but they push MicLayer toward DAW-plugin territory, which is not the product. If a user wants them, they should use OBS or a DAW.

---

## 13. Parameter serialisation

Each module exposes a `Params` struct that serialises to/from JSON. The profile format embeds these structs verbatim, so adding a new param means: (a) add to the Rust struct with `serde(default = ...)` for backwards compat, (b) bump the profile schema version, (c) write a migration.

See [`profile-format.md`](profile-format.md) and [`/packages/shared/schemas/profile.schema.json`](../packages/shared/schemas/profile.schema.json).
