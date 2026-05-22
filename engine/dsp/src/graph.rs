//! DSP graph: holds every module in chain order and runs them.
//!
//! Two halves:
//!   - `Graph` lives in the audio callback (RT thread). Owns the read-side
//!     of each module's triple_buffer.
//!   - `GraphHandles` lives on the control thread (Tauri command handler).
//!     Owns the write-side; the controller writes new configs into it.
//!
//! Splitting like this means no locks ever sit between the UI and the
//! audio thread — only triple-buffered atomic snapshots.

use serde::{Deserialize, Serialize};

use crate::compressor::{Compressor, CompressorHandle};
use crate::de_esser::{DeEsser, DeEsserHandle};
use crate::eq::{Eq, EqHandle};
use crate::gate::{Gate, GateHandle};
use crate::high_pass::{HighPass, HighPassHandle};
use crate::input_gain::{InputGain, InputGainHandle};
use crate::limiter::{Limiter, LimiterHandle};
use crate::noise_suppression::{NoiseSuppression, NoiseSuppressionHandle};
use crate::output_gain::{OutputGain, OutputGainHandle};
use crate::params::{
    CompressorParams, DeEsserParams, EqParams, GateParams, HighPassParams, InputGainParams,
    LimiterParams, NoiseSuppressionParams, OutputGainParams,
};
use crate::ModuleConfig;

/// Real-time-side processing graph. Constructed once and lives inside
/// the audio callback for the lifetime of the engine session.
pub struct Graph {
    pub input_gain: InputGain,
    pub high_pass: HighPass,
    pub noise_suppression: NoiseSuppression,
    pub gate: Gate,
    pub eq: Eq,
    pub compressor: Compressor,
    pub de_esser: DeEsser,
    pub limiter: Limiter,
    pub output_gain: OutputGain,
}

impl Graph {
    /// Process a buffer in chain order, in place. Real-time safe.
    #[inline]
    pub fn process(&mut self, buf: &mut [f32], sample_rate: u32) {
        self.input_gain.process(buf, sample_rate);
        self.high_pass.process(buf, sample_rate);
        self.noise_suppression.process(buf, sample_rate);
        self.gate.process(buf, sample_rate);
        self.eq.process(buf, sample_rate);
        self.compressor.process(buf, sample_rate);
        self.de_esser.process(buf, sample_rate);
        self.limiter.process(buf, sample_rate);
        self.output_gain.process(buf, sample_rate);
    }

    /// Reset every module's internal state (filter memory, envelopes).
    pub fn reset(&mut self) {
        self.input_gain.reset();
        self.high_pass.reset();
        self.noise_suppression.reset();
        self.gate.reset();
        self.eq.reset();
        self.compressor.reset();
        self.de_esser.reset();
        self.limiter.reset();
        self.output_gain.reset();
    }
}

/// Control-side handles. Created paired with `Graph` and held by the
/// engine controller. Write a `ModuleConfig<Params>` into a handle and
/// the audio thread reads it on its next callback.
pub struct GraphHandles {
    pub input_gain: InputGainHandle,
    pub high_pass: HighPassHandle,
    pub noise_suppression: NoiseSuppressionHandle,
    pub gate: GateHandle,
    pub eq: EqHandle,
    pub compressor: CompressorHandle,
    pub de_esser: DeEsserHandle,
    pub limiter: LimiterHandle,
    pub output_gain: OutputGainHandle,
}

impl GraphHandles {
    /// Apply a full profile in one call: overwrites every module's config.
    pub fn apply_profile(&mut self, profile: &ProfileModules) {
        self.input_gain.write(profile.input_gain.clone());
        self.high_pass.write(profile.high_pass.clone());
        self.noise_suppression.write(profile.noise_suppression.clone());
        self.gate.write(profile.gate.clone());
        self.eq.write(profile.eq.clone());
        self.compressor.write(profile.compressor.clone());
        self.de_esser.write(profile.de_esser.clone());
        self.limiter.write(profile.limiter.clone());
        self.output_gain.write(profile.output_gain.clone());
    }
}

/// Build the graph + paired handles at session start.
pub fn build() -> (Graph, GraphHandles) {
    let (input_gain, input_gain_h) = InputGain::new();
    let (high_pass, high_pass_h) = HighPass::new();
    let (noise_suppression, noise_suppression_h) = NoiseSuppression::new();
    let (gate, gate_h) = Gate::new();
    let (eq, eq_h) = Eq::new();
    let (compressor, compressor_h) = Compressor::new();
    let (de_esser, de_esser_h) = DeEsser::new();
    let (limiter, limiter_h) = Limiter::new();
    let (output_gain, output_gain_h) = OutputGain::new();

    let graph = Graph {
        input_gain,
        high_pass,
        noise_suppression,
        gate,
        eq,
        compressor,
        de_esser,
        limiter,
        output_gain,
    };
    let handles = GraphHandles {
        input_gain: input_gain_h,
        high_pass: high_pass_h,
        noise_suppression: noise_suppression_h,
        gate: gate_h,
        eq: eq_h,
        compressor: compressor_h,
        de_esser: de_esser_h,
        limiter: limiter_h,
        output_gain: output_gain_h,
    };
    (graph, handles)
}

/// The full set of per-module configs that makes up a profile.
/// Matches the JSON profile schema `modules` object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileModules {
    pub input_gain: ModuleConfig<InputGainParams>,
    pub high_pass: ModuleConfig<HighPassParams>,
    pub noise_suppression: ModuleConfig<NoiseSuppressionParams>,
    pub gate: ModuleConfig<GateParams>,
    pub eq: ModuleConfig<EqParams>,
    pub compressor: ModuleConfig<CompressorParams>,
    pub de_esser: ModuleConfig<DeEsserParams>,
    pub limiter: ModuleConfig<LimiterParams>,
    pub output_gain: ModuleConfig<OutputGainParams>,
}

impl ProfileModules {
    pub fn neutral() -> Self {
        Self {
            input_gain: ModuleConfig::default(),
            high_pass: ModuleConfig::default(),
            noise_suppression: ModuleConfig { enabled: false, ..ModuleConfig::default() },
            gate: ModuleConfig { enabled: false, ..ModuleConfig::default() },
            eq: ModuleConfig { enabled: false, ..ModuleConfig::default() },
            compressor: ModuleConfig::default(),
            de_esser: ModuleConfig { enabled: false, ..ModuleConfig::default() },
            limiter: ModuleConfig::default(),
            output_gain: ModuleConfig::default(),
        }
    }
}
