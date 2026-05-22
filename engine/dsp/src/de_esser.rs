//! De-esser. Band-split sidechain compression on the sibilance band.
//!
//! Algorithm:
//!   1. Tap a band-pass copy of the input around `target_hz`.
//!   2. Track its envelope (RMS-ish, one-pole on x²).
//!   3. When envelope > threshold, attenuate the band-pass copy.
//!   4. Output = input + (compressed_band - band) — i.e. subtract any
//!      attenuation we applied to the band from the full-band input.
//!
//! See docs/dsp-chain.md §7 for acceptance criteria.

use biquad::{Biquad as _, Coefficients, DirectForm2Transposed, ToHertz, Type as BiquadType};

use crate::params::DeEsserParams;
use crate::util::{db_to_lin, env_coeff, flush_denormal};
use crate::ModuleConfig;

const DETECTOR_TAU_MS: f32 = 3.0;
const ATTACK_MS: f32 = 1.0;
const RELEASE_MS: f32 = 40.0;

pub struct DeEsser {
    config: triple_buffer::Output<ModuleConfig<DeEsserParams>>,
    bandpass: DirectForm2Transposed<f32>,
    /// Smoothed |x|² of the band-pass output.
    env: f32,
    /// Smoothed gain reduction (dB), driven toward target_gr_db each sample.
    gr_db: f32,
    last_sr: u32,
    last_params_sig: u64,
    coeff_det: f32,
    coeff_atk: f32,
    coeff_rel: f32,
    threshold_db: f32,
    amount_db: f32,
}

pub type DeEsserHandle = triple_buffer::Input<ModuleConfig<DeEsserParams>>;

impl DeEsser {
    pub fn new() -> (Self, DeEsserHandle) {
        let initial = ModuleConfig::<DeEsserParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        let neutral = Coefficients::<f32> {
            a1: 0.0, a2: 0.0, b0: 1.0, b1: 0.0, b2: 0.0,
        };
        (
            Self {
                config: output,
                bandpass: DirectForm2Transposed::<f32>::new(neutral),
                env: 0.0,
                gr_db: 0.0,
                last_sr: 0,
                last_params_sig: 0,
                coeff_det: 0.0,
                coeff_atk: 0.0,
                coeff_rel: 0.0,
                threshold_db: -26.0,
                amount_db: 6.0,
            },
            input,
        )
    }

    pub fn reset(&mut self) {
        self.bandpass.reset_state();
        self.env = 0.0;
        self.gr_db = 0.0;
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

        for s in buf.iter_mut() {
            let x = *s;

            // Side-chain detector: filter to sibilance band, square, smooth.
            let band = self.bandpass.run(x);
            self.env = flush_denormal(self.env + (band * band - self.env) * self.coeff_det);
            let env_db = if self.env <= 1.0e-12 {
                -120.0
            } else {
                10.0 * self.env.log10()
            };

            // Compute target GR (negative dB).
            let over = env_db - self.threshold_db;
            let target_gr_db = if over <= 0.0 {
                0.0
            } else {
                // Scale linearly to the max amount_db over a 10 dB span,
                // saturating at amount_db. This is gentler than a hard knee.
                (-over.min(10.0) / 10.0 * self.amount_db).max(-self.amount_db)
            };

            // Smooth GR with fast attack, slow release.
            let coeff = if target_gr_db < self.gr_db {
                self.coeff_atk
            } else {
                self.coeff_rel
            };
            self.gr_db = flush_denormal(target_gr_db + (self.gr_db - target_gr_db) * coeff);

            // Apply: subtract (band * (1 - gain)) from the full-band signal,
            // which leaves the rest of the spectrum untouched.
            let band_gain = db_to_lin(self.gr_db);
            let band_attenuated = band * band_gain;
            *s = x + (band_attenuated - band);
        }
    }

    fn recompute_if_changed(&mut self, p: DeEsserParams, sample_rate: u32) {
        let sig = signature_for(&p);
        if sig == self.last_params_sig && sample_rate == self.last_sr {
            return;
        }
        self.last_params_sig = sig;
        self.last_sr = sample_rate;

        let sr = sample_rate.max(8_000) as f32;
        let nyq = sr * 0.499;
        let f = p.target_hz.clamp(2_000.0, nyq);
        let q = p.q.clamp(0.5, 4.0);
        if let Ok(c) = Coefficients::<f32>::from_params(BiquadType::BandPass, sr.hz(), f.hz(), q)
        {
            self.bandpass.update_coefficients(c);
        }

        self.threshold_db = p.threshold_db;
        self.amount_db = p.amount_db.max(0.0);
        self.coeff_det = 1.0 - env_coeff(DETECTOR_TAU_MS, sample_rate);
        self.coeff_atk = env_coeff(ATTACK_MS, sample_rate);
        self.coeff_rel = env_coeff(RELEASE_MS, sample_rate);
    }
}

fn signature_for(p: &DeEsserParams) -> u64 {
    let mut h = 0u64;
    h ^= (p.target_hz.to_bits() as u64).rotate_left(1);
    h ^= (p.threshold_db.to_bits() as u64).rotate_left(13);
    h ^= (p.amount_db.to_bits() as u64).rotate_left(23);
    h ^= (p.q.to_bits() as u64).rotate_left(31);
    h
}
