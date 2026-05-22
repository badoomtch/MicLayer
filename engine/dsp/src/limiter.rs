//! Safety limiter with true lookahead.
//!
//! Design: a delay line of `lookahead_samples` holds the output stream. The
//! peak detector sees the input samples *ahead* of the output by exactly
//! the lookahead window, so when a peak appears at the detector the gain
//! envelope has `lookahead_samples` to ramp down before the peak emerges
//! at the output. The peak hold uses a "max-with-aging" tracker that's
//! O(1) amortised, with an O(N) rescan only when the held maximum ages
//! out of the window.
//!
//! Algorithm + acceptance criteria in docs/dsp-chain.md §8.

use crate::params::LimiterParams;
use crate::util::{db_to_lin, env_coeff, flush_denormal};
use crate::ModuleConfig;

/// Worst-case lookahead in samples = 10 ms × 48 kHz = 480. We allocate a
/// bit more for headroom in case sample rate is ever higher.
const MAX_LOOKAHEAD_SAMPLES: usize = 1024;

pub struct Limiter {
    config: triple_buffer::Output<ModuleConfig<LimiterParams>>,
    /// Delay line of output samples.
    delay: Box<[f32; MAX_LOOKAHEAD_SAMPLES]>,
    delay_idx: usize,
    /// Lookahead window — circular buffer of |x| values used for peak detection.
    peak_window: Box<[f32; MAX_LOOKAHEAD_SAMPLES]>,
    peak_idx: usize,
    /// Current max-over-window with aging (Hinnant trick).
    cur_max: f32,
    cur_max_age: usize,
    /// Smoothed gain envelope, in linear units (1.0 = no reduction).
    gain: f32,
    last_sr: u32,
    last_params_sig: u64,
    coeff_rel: f32,
    ceiling_lin: f32,
    lookahead_samples: usize,
}

pub type LimiterHandle = triple_buffer::Input<ModuleConfig<LimiterParams>>;

impl Limiter {
    pub fn new() -> (Self, LimiterHandle) {
        let initial = ModuleConfig::<LimiterParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        (
            Self {
                config: output,
                delay: Box::new([0.0; MAX_LOOKAHEAD_SAMPLES]),
                delay_idx: 0,
                peak_window: Box::new([0.0; MAX_LOOKAHEAD_SAMPLES]),
                peak_idx: 0,
                cur_max: 0.0,
                cur_max_age: 0,
                gain: 1.0,
                last_sr: 0,
                last_params_sig: 0,
                coeff_rel: 0.0,
                ceiling_lin: 1.0,
                lookahead_samples: 0,
            },
            input,
        )
    }

    pub fn reset(&mut self) {
        for s in self.delay.iter_mut() {
            *s = 0.0;
        }
        for s in self.peak_window.iter_mut() {
            *s = 0.0;
        }
        self.delay_idx = 0;
        self.peak_idx = 0;
        self.cur_max = 0.0;
        self.cur_max_age = 0;
        self.gain = 1.0;
    }

    pub fn process(&mut self, buf: &mut [f32], sample_rate: u32) {
        let (enabled, params) = {
            let cfg = self.config.read();
            (cfg.enabled, cfg.params)
        };
        if !enabled {
            return;
        }
        self.recompute_if_changed(params, sample_rate);

        if self.lookahead_samples == 0 {
            // Lookahead = 0 means feed-forward (instant attack) peak limiter.
            for s in buf.iter_mut() {
                let mag = s.abs();
                self.cur_max = self.cur_max.max(mag);
                let target_gain = if self.cur_max > self.ceiling_lin {
                    self.ceiling_lin / self.cur_max
                } else {
                    1.0
                };
                if target_gain < self.gain {
                    self.gain = target_gain;
                } else {
                    self.gain = flush_denormal(
                        self.gain * self.coeff_rel + target_gain * (1.0 - self.coeff_rel),
                    );
                }
                self.cur_max = flush_denormal(self.cur_max * self.coeff_rel);
                *s *= self.gain;
            }
            return;
        }

        let lookahead = self.lookahead_samples;
        for s in buf.iter_mut() {
            let x = *s;
            let mag = x.abs();

            // 1. Evict the oldest sample from the peak window before
            //    writing the new one.
            let oldest = self.peak_window[self.peak_idx];

            // 2. Track the maximum over the lookahead window with aging.
            if mag >= self.cur_max {
                self.cur_max = mag;
                self.cur_max_age = 0;
            } else {
                self.cur_max_age += 1;
                // If the held max is exactly the sample we're evicting,
                // or aged past the window, rescan.
                if oldest >= self.cur_max || self.cur_max_age >= lookahead {
                    let mut m = 0.0_f32;
                    for i in 0..lookahead {
                        let v = self.peak_window[i];
                        if v > m {
                            m = v;
                        }
                    }
                    // Include the new sample we're about to write.
                    if mag > m {
                        m = mag;
                    }
                    self.cur_max = m;
                    self.cur_max_age = 0;
                }
            }

            // 3. Write the new sample into the peak window AND the delay line.
            self.peak_window[self.peak_idx] = mag;
            let delayed = self.delay[self.delay_idx];
            self.delay[self.delay_idx] = x;

            // 4. Compute target gain from the windowed peak.
            let target_gain = if self.cur_max > self.ceiling_lin {
                self.ceiling_lin / self.cur_max
            } else {
                1.0
            };

            // 5. Smooth toward target: instant attack on reduction, exponential release.
            if target_gain < self.gain {
                self.gain = target_gain;
            } else {
                self.gain = flush_denormal(
                    self.gain * self.coeff_rel + target_gain * (1.0 - self.coeff_rel),
                );
            }

            // 6. Output the delayed sample with the current gain applied.
            *s = delayed * self.gain;

            // 7. Advance ring indices.
            self.peak_idx = (self.peak_idx + 1) % lookahead;
            self.delay_idx = (self.delay_idx + 1) % lookahead;
        }
    }

    fn recompute_if_changed(&mut self, p: LimiterParams, sample_rate: u32) {
        let sig = signature_for(p);
        if sig == self.last_params_sig && sample_rate == self.last_sr {
            return;
        }
        self.last_params_sig = sig;
        self.last_sr = sample_rate;
        self.coeff_rel = env_coeff(p.release_ms, sample_rate);
        self.ceiling_lin = db_to_lin(p.ceiling_db).clamp(0.0, 1.0);

        let new_lookahead = ((p.lookahead_ms.max(0.0) * 0.001) * sample_rate as f32) as usize;
        let new_lookahead = new_lookahead.min(MAX_LOOKAHEAD_SAMPLES);
        if new_lookahead != self.lookahead_samples {
            // Window resize: clear delay + window to avoid stale data popping
            // through at a different timing.
            for s in self.delay.iter_mut() {
                *s = 0.0;
            }
            for s in self.peak_window.iter_mut() {
                *s = 0.0;
            }
            self.delay_idx = 0;
            self.peak_idx = 0;
            self.cur_max = 0.0;
            self.cur_max_age = 0;
            self.lookahead_samples = new_lookahead;
        }
    }
}

fn signature_for(p: LimiterParams) -> u64 {
    let mut h = 0u64;
    h ^= (p.ceiling_db.to_bits() as u64).rotate_left(1);
    h ^= (p.release_ms.to_bits() as u64).rotate_left(13);
    h ^= (p.lookahead_ms.to_bits() as u64).rotate_left(23);
    h
}
