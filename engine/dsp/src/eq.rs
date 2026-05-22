//! 5-band parametric EQ. Five cascaded biquads (RBJ cookbook formulas).
//! Algorithm + acceptance criteria in docs/dsp-chain.md §5.

use biquad::{
    Biquad as _, Coefficients, DirectForm2Transposed, ToHertz, Type as BiquadType,
};

use crate::params::{EqBand, EqBandType, EqParams};
use crate::ModuleConfig;

const N_BANDS: usize = 5;

pub struct Eq {
    config: triple_buffer::Output<ModuleConfig<EqParams>>,
    stages: [DirectForm2Transposed<f32>; N_BANDS],
    enabled: [bool; N_BANDS],
    last_signatures: [u64; N_BANDS],
    last_sr: u32,
}

pub type EqHandle = triple_buffer::Input<ModuleConfig<EqParams>>;

impl Eq {
    pub fn new() -> (Self, EqHandle) {
        let initial = ModuleConfig::<EqParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        let neutral = Coefficients::<f32> {
            a1: 0.0, a2: 0.0, b0: 1.0, b1: 0.0, b2: 0.0,
        };
        let stages = std::array::from_fn(|_| DirectForm2Transposed::<f32>::new(neutral));
        (
            Self {
                config: output,
                stages,
                enabled: [false; N_BANDS],
                last_signatures: [0; N_BANDS],
                last_sr: 0,
            },
            input,
        )
    }

    pub fn reset(&mut self) {
        for s in self.stages.iter_mut() {
            s.reset_state();
        }
    }

    pub fn process(&mut self, buf: &mut [f32], sample_rate: u32) {
        let cfg = self.config.read();
        if !cfg.enabled {
            return;
        }

        let sr_changed = sample_rate != self.last_sr;
        if sr_changed {
            self.last_sr = sample_rate;
        }

        for (i, band) in cfg.params.bands.iter().enumerate() {
            self.enabled[i] = band.enabled;
            if !band.enabled {
                continue;
            }
            let sig = signature_for(band);
            if sr_changed || sig != self.last_signatures[i] {
                if let Some(c) = coeffs_for(band, sample_rate) {
                    self.stages[i].update_coefficients(c);
                    self.last_signatures[i] = sig;
                }
            }
        }

        for s in buf.iter_mut() {
            let mut y = *s;
            for (i, stage) in self.stages.iter_mut().enumerate() {
                if self.enabled[i] {
                    y = stage.run(y);
                }
            }
            *s = y;
        }
    }
}

fn coeffs_for(band: &EqBand, sample_rate: u32) -> Option<Coefficients<f32>> {
    let sr = sample_rate.max(8000) as f32;
    let nyq = sr * 0.499;
    let f = band.frequency_hz.clamp(20.0, nyq);
    let q = band.q.clamp(0.1, 10.0);
    let ty = match band.kind {
        EqBandType::LowShelf => BiquadType::LowShelf(band.gain_db),
        EqBandType::Peak => BiquadType::PeakingEQ(band.gain_db),
        EqBandType::HighShelf => BiquadType::HighShelf(band.gain_db),
        EqBandType::HighPass => BiquadType::HighPass,
        EqBandType::LowPass => BiquadType::LowPass,
    };
    Coefficients::<f32>::from_params(ty, sr.hz(), f.hz(), q).ok()
}

fn signature_for(b: &EqBand) -> u64 {
    let mut h = 0u64;
    h ^= (b.frequency_hz.to_bits() as u64).rotate_left(1);
    h ^= (b.gain_db.to_bits() as u64).rotate_left(13);
    h ^= (b.q.to_bits() as u64).rotate_left(23);
    let kind_n: u64 = match b.kind {
        EqBandType::LowShelf => 1,
        EqBandType::Peak => 2,
        EqBandType::HighShelf => 3,
        EqBandType::HighPass => 4,
        EqBandType::LowPass => 5,
    };
    h ^= kind_n.wrapping_mul(0x9e3779b97f4a7c15);
    h ^= b.enabled as u64;
    h
}
