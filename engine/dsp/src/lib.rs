//! MicLayer real-time DSP.
//!
//! Each module owns a `triple_buffer::Output<ModuleConfig<P>>` for params.
//! The controller side holds the matching `Input` and writes new configs
//! atomically; the audio thread reads the most recent snapshot per callback.
//!
//! Real-time rules in docs/audio-engine.md §3 apply to every `process` impl.

#![forbid(unsafe_op_in_unsafe_fn)]

pub mod params;
pub mod util;

pub mod input_gain;
pub mod high_pass;
pub mod noise_suppression;
pub mod gate;
pub mod eq;
pub mod compressor;
pub mod de_esser;
pub mod limiter;
pub mod output_gain;

pub mod graph;

pub use graph::{Graph, GraphHandles};

use serde::{Deserialize, Serialize};

/// Per-module enable + parameter wrapper. Matches the JSON profile shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleConfig<P> {
    pub enabled: bool,
    pub params: P,
}

impl<P: Default> Default for ModuleConfig<P> {
    fn default() -> Self {
        Self { enabled: true, params: P::default() }
    }
}

/// Specification passed to a module's constructor.
#[derive(Debug, Clone, Copy)]
pub struct ModuleSpec {
    pub max_block: usize,
    pub max_channels: usize,
    pub sample_rate: u32,
}

impl ModuleSpec {
    pub const DEFAULT: Self = Self {
        max_block: 4096,
        max_channels: 1,
        sample_rate: 48_000,
    };
}
