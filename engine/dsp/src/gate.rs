//! Downward expander / noise gate with hysteresis.
//! Algorithm + acceptance criteria in docs/dsp-chain.md §4.

use crate::params::GateParams;
use crate::util::{db_to_lin, env_coeff, flush_denormal};
use crate::ModuleConfig;

const DETECTOR_TAU_MS: f32 = 8.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GateState {
    Open,
    Holding,
    Closed,
}

pub struct Gate {
    config: triple_buffer::Output<ModuleConfig<GateParams>>,
    state: GateState,
    /// running mean square (RMS²) detector state
    env: f32,
    /// current applied gain (linear)
    gain: f32,
    /// remaining hold samples while in `Holding`
    hold_left: u32,
    /// cached coeffs derived from params (recomputed when sr or params change)
    last_sr: u32,
    last_params_sig: u64,
    coeff_det: f32,
    coeff_atk: f32,
    coeff_rel: f32,
    hold_samples: u32,
    open_thresh_lin_sq: f32,
    close_thresh_lin_sq: f32,
    closed_gain_lin: f32,
}

pub type GateHandle = triple_buffer::Input<ModuleConfig<GateParams>>;

impl Gate {
    pub fn new() -> (Self, GateHandle) {
        let initial = ModuleConfig::<GateParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        (
            Self {
                config: output,
                state: GateState::Open,
                env: 0.0,
                gain: 1.0,
                hold_left: 0,
                last_sr: 0,
                last_params_sig: 0,
                coeff_det: 0.0,
                coeff_atk: 0.0,
                coeff_rel: 0.0,
                hold_samples: 0,
                open_thresh_lin_sq: 0.0,
                close_thresh_lin_sq: 0.0,
                closed_gain_lin: 1.0,
            },
            input,
        )
    }

    pub fn reset(&mut self) {
        self.state = GateState::Open;
        self.env = 0.0;
        self.gain = 1.0;
        self.hold_left = 0;
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
            // Running mean-square detector.
            let x = *s;
            self.env = flush_denormal(self.env + (x * x - self.env) * self.coeff_det);
            let env_sq = self.env;

            // State transitions on hysteresis comparisons (squared, to avoid sqrt).
            match self.state {
                GateState::Open => {
                    if env_sq < self.close_thresh_lin_sq {
                        self.state = GateState::Holding;
                        self.hold_left = self.hold_samples;
                    }
                }
                GateState::Holding => {
                    if env_sq > self.open_thresh_lin_sq {
                        self.state = GateState::Open;
                    } else if self.hold_left == 0 {
                        self.state = GateState::Closed;
                    } else {
                        self.hold_left -= 1;
                    }
                }
                GateState::Closed => {
                    if env_sq > self.open_thresh_lin_sq {
                        self.state = GateState::Open;
                    }
                }
            }

            // Target gain by state. Holding still passes audio at unity so
            // word tails don't clip.
            let target = match self.state {
                GateState::Open | GateState::Holding => 1.0,
                GateState::Closed => self.closed_gain_lin,
            };

            // Smooth toward target. Attack when target > gain, release otherwise.
            let coeff = if target > self.gain { self.coeff_atk } else { self.coeff_rel };
            self.gain = flush_denormal(target + (self.gain - target) * coeff);

            *s = x * self.gain;
        }
    }

    fn recompute_if_changed(&mut self, p: GateParams, sample_rate: u32) {
        let sig = signature_for(p);
        if sig == self.last_params_sig && sample_rate == self.last_sr {
            return;
        }
        self.last_params_sig = sig;
        self.last_sr = sample_rate;
        self.coeff_det = 1.0 - env_coeff(DETECTOR_TAU_MS, sample_rate);
        self.coeff_atk = env_coeff(p.attack_ms, sample_rate);
        self.coeff_rel = env_coeff(p.release_ms, sample_rate);
        self.hold_samples = (p.hold_ms * 0.001 * sample_rate as f32) as u32;
        let open_lin = db_to_lin(p.threshold_db);
        let close_lin = db_to_lin(p.threshold_db - p.hysteresis_db);
        self.open_thresh_lin_sq = open_lin * open_lin;
        self.close_thresh_lin_sq = close_lin * close_lin;
        self.closed_gain_lin = db_to_lin(p.range_db);
    }
}

fn signature_for(p: GateParams) -> u64 {
    let mut h = 0u64;
    h ^= (p.threshold_db.to_bits() as u64).rotate_left(1);
    h ^= (p.range_db.to_bits() as u64).rotate_left(13);
    h ^= (p.attack_ms.to_bits() as u64).rotate_left(23);
    h ^= (p.hold_ms.to_bits() as u64).rotate_left(31);
    h ^= (p.release_ms.to_bits() as u64).rotate_left(41);
    h ^= (p.hysteresis_db.to_bits() as u64).rotate_left(53);
    h
}
