//! Output gain — same shape as input_gain. docs/dsp-chain.md §9.

use crate::params::OutputGainParams;
use crate::util::{db_to_lin, OnePoleSmoother};
use crate::ModuleConfig;

const SMOOTH_TAU_MS: f32 = 20.0;

pub struct OutputGain {
    config: triple_buffer::Output<ModuleConfig<OutputGainParams>>,
    smoother: OnePoleSmoother,
}

pub type OutputGainHandle = triple_buffer::Input<ModuleConfig<OutputGainParams>>;

impl OutputGain {
    pub fn new() -> (Self, OutputGainHandle) {
        let initial = ModuleConfig::<OutputGainParams>::default();
        let buf = triple_buffer::TripleBuffer::new(&initial);
        let (input, output) = buf.split();
        let smoother = OnePoleSmoother::new(db_to_lin(initial.params.gain_db), SMOOTH_TAU_MS);
        (Self { config: output, smoother }, input)
    }

    pub fn reset(&mut self) {
        let cfg = self.config.read();
        self.smoother.reset(db_to_lin(cfg.params.gain_db));
    }

    pub fn process(&mut self, buf: &mut [f32], sample_rate: u32) {
        let cfg = self.config.read();
        if !cfg.enabled {
            return;
        }
        let target = db_to_lin(cfg.params.gain_db);
        self.smoother.set_target(target);
        for s in buf.iter_mut() {
            let g = self.smoother.next(sample_rate);
            *s *= g;
        }
    }
}
