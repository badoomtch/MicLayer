//! Feed-forward compressor with soft knee + optional auto-makeup.
//! Algorithm + acceptance criteria in docs/dsp-chain.md §6.

use crate::params::CompressorParams;
use crate::util::{db_to_lin, env_coeff, flush_denormal};
use crate::ModuleConfig;

pub struct Compressor {
    config: triple_buffer::Output<ModuleConfig<CompressorParams>>,
    /// running mean-square detector state
    env: f32,
    /// smoothed gain-reduction state, in dB (negative = reducing)
    gr_db: f32,
    last_sr: u32,
    last_params_sig: u64,
    coeff_det: f32,
    coeff_atk: f32,
    coeff_rel: f32,
    threshold_db: f32,
    ratio: f32,
    inv_ratio: f32,
    half_knee_db: f32,
    knee_db: f32,
    makeup_lin: f32,
}

pub type CompressorHandle = triple_buffer::Input<ModuleConfig<CompressorParams>>;

impl Compressor {
    pub fn new() -> (Self, CompressorHandle) {
        let initial = ModuleConfig::<CompressorParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        (
            Self {
                config: output,
                env: 0.0,
                gr_db: 0.0,
                last_sr: 0,
                last_params_sig: 0,
                coeff_det: 0.0,
                coeff_atk: 0.0,
                coeff_rel: 0.0,
                threshold_db: -22.0,
                ratio: 3.0,
                inv_ratio: 1.0 / 3.0,
                half_knee_db: 3.0,
                knee_db: 6.0,
                makeup_lin: 1.0,
            },
            input,
        )
    }

    pub fn reset(&mut self) {
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
            // Running mean square.
            self.env = flush_denormal(self.env + (x * x - self.env) * self.coeff_det);
            // Convert to dB. Use a hard floor instead of -inf for tiny env.
            let env_db = if self.env <= 1.0e-12 {
                -120.0
            } else {
                10.0 * self.env.log10()
            };

            // Static curve with soft knee.
            let over = env_db - self.threshold_db;
            let target_gr_db = if over <= -self.half_knee_db {
                0.0
            } else if over >= self.half_knee_db {
                -over * (1.0 - self.inv_ratio)
            } else {
                let t = over + self.half_knee_db;
                let smooth = t * t / (2.0 * self.knee_db.max(1.0e-3));
                -smooth * (1.0 - self.inv_ratio)
            };

            // Smooth GR. Attack when reducing more (gr_db getting more negative),
            // release when recovering.
            let coeff = if target_gr_db < self.gr_db {
                self.coeff_atk
            } else {
                self.coeff_rel
            };
            self.gr_db = flush_denormal(target_gr_db + (self.gr_db - target_gr_db) * coeff);

            // Apply gain reduction + makeup.
            let gain = db_to_lin(self.gr_db) * self.makeup_lin;
            *s = x * gain;
        }
    }

    fn recompute_if_changed(&mut self, p: CompressorParams, sample_rate: u32) {
        let sig = signature_for(&p);
        if sig == self.last_params_sig && sample_rate == self.last_sr {
            return;
        }
        self.last_params_sig = sig;
        self.last_sr = sample_rate;

        let ratio = p.ratio.max(1.0);
        self.threshold_db = p.threshold_db;
        self.ratio = ratio;
        self.inv_ratio = 1.0 / ratio;
        self.knee_db = p.knee_db.max(0.0);
        self.half_knee_db = self.knee_db * 0.5;

        self.coeff_det = 1.0 - env_coeff(p.detector_ms.max(1.0), sample_rate);
        self.coeff_atk = env_coeff(p.attack_ms, sample_rate);
        self.coeff_rel = env_coeff(p.release_ms, sample_rate);

        // Auto-makeup: half-compensate the gain reduction at threshold-level input.
        let makeup_db = if p.auto_makeup {
            // Estimated average GR at typical speech ≈ (1 - 1/ratio) * 6 dB,
            // since speech RMS typically sits ~6 dB above threshold for our
            // default settings. Half-compensate. Capped at 12 dB.
            let est = (1.0 - self.inv_ratio) * 6.0 * 0.5;
            est.clamp(0.0, 12.0)
        } else {
            p.makeup_db
        };
        self.makeup_lin = db_to_lin(makeup_db);
    }
}

fn signature_for(p: &CompressorParams) -> u64 {
    let mut h = 0u64;
    h ^= (p.threshold_db.to_bits() as u64).rotate_left(1);
    h ^= (p.ratio.to_bits() as u64).rotate_left(7);
    h ^= (p.attack_ms.to_bits() as u64).rotate_left(13);
    h ^= (p.release_ms.to_bits() as u64).rotate_left(19);
    h ^= (p.knee_db.to_bits() as u64).rotate_left(23);
    h ^= (p.makeup_db.to_bits() as u64).rotate_left(29);
    h ^= (p.detector_ms.to_bits() as u64).rotate_left(31);
    h ^= (p.auto_makeup as u64) << 41;
    h
}
