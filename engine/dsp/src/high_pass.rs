//! High-pass filter. 2nd or 4th-order Butterworth via biquad cascade.
//! Algorithm + acceptance criteria in docs/dsp-chain.md §2.

use biquad::{
    Biquad as _, Coefficients, DirectForm2Transposed, ToHertz, Type as BiquadType,
};

use crate::params::{HighPassMode, HighPassParams};
use crate::ModuleConfig;

// Butterworth Q values:
//   2nd-order: 1/sqrt(2) ≈ 0.70710678
//   4th-order cascade: Q1 = 1/(2 cos(π/8))  ≈ 0.54119610
//                       Q2 = 1/(2 cos(3π/8)) ≈ 1.30656296
const Q_2: f32 = 0.707_106_78;
const Q_4_LOW: f32 = 0.541_196_1;
const Q_4_HIGH: f32 = 1.306_563_0;

pub struct HighPass {
    config: triple_buffer::Output<ModuleConfig<HighPassParams>>,
    stage1: DirectForm2Transposed<f32>,
    stage2: Option<DirectForm2Transposed<f32>>,
    last_signature: u64,
}

pub type HighPassHandle = triple_buffer::Input<ModuleConfig<HighPassParams>>;

impl HighPass {
    pub fn new() -> (Self, HighPassHandle) {
        let initial = ModuleConfig::<HighPassParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        let coeffs = coeffs_for(80.0, 48_000, Q_2);
        let stage1 = DirectForm2Transposed::<f32>::new(coeffs);
        (
            Self { config: output, stage1, stage2: None, last_signature: 0 },
            input,
        )
    }

    pub fn reset(&mut self) {
        self.stage1.reset_state();
        if let Some(s) = self.stage2.as_mut() {
            s.reset_state();
        }
    }

    pub fn process(&mut self, buf: &mut [f32], sample_rate: u32) {
        let cfg = self.config.read();
        if !cfg.enabled || matches!(cfg.params.mode, HighPassMode::Off) {
            return;
        }

        let (cutoff, order) = effective(cfg.params);
        let signature = signature_for(cutoff, order, sample_rate);
        if signature != self.last_signature {
            let c1 = coeffs_for(cutoff, sample_rate, if order == 4 { Q_4_LOW } else { Q_2 });
            self.stage1.update_coefficients(c1);
            if order == 4 {
                let c2 = coeffs_for(cutoff, sample_rate, Q_4_HIGH);
                match self.stage2.as_mut() {
                    Some(s) => s.update_coefficients(c2),
                    None => self.stage2 = Some(DirectForm2Transposed::<f32>::new(c2)),
                }
            } else {
                self.stage2 = None;
            }
            self.last_signature = signature;
        }

        for s in buf.iter_mut() {
            let mut y = self.stage1.run(*s);
            if let Some(stage2) = self.stage2.as_mut() {
                y = stage2.run(y);
            }
            *s = y;
        }
    }
}

fn effective(p: HighPassParams) -> (f32, u8) {
    match p.mode {
        HighPassMode::Off => (p.cutoff_hz, 2),
        HighPassMode::Low => (60.0, 2),
        HighPassMode::Medium => (80.0, 2),
        HighPassMode::Strong => (120.0, 4),
        HighPassMode::Custom => (p.cutoff_hz, p.order),
    }
}

fn coeffs_for(cutoff_hz: f32, sample_rate: u32, q: f32) -> Coefficients<f32> {
    // Clamp inputs to a safe range so a malformed param can't blow up
    // coefficient generation.
    let sr = sample_rate.max(8000) as f32;
    let nyquist = sr * 0.499; // stay just under Nyquist
    let f = cutoff_hz.clamp(10.0, nyquist);
    Coefficients::<f32>::from_params(BiquadType::HighPass, sr.hz(), f.hz(), q)
        .unwrap_or(Coefficients::<f32> {
            // Hand-rolled passthrough biquad: y[n] = x[n]. Used only if the
            // RBJ formula somehow rejected our clamped inputs, which should
            // be impossible — better than panicking on the audio thread.
            a1: 0.0,
            a2: 0.0,
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
        })
}

fn signature_for(cutoff: f32, order: u8, sr: u32) -> u64 {
    // Quantise the cutoff to 0.1 Hz so trivial param fluctuations don't
    // force coefficient recomputation.
    let q_cut = (cutoff * 10.0) as u64;
    (q_cut << 16) | ((order as u64) << 8) | (sr as u64 & 0xff)
}
