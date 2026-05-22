//! MicLayer audio engine — capture, process, sink coordination.
//!
//! Milestone 2 reality:
//!   - device enumeration (in `miclayer-devices`)
//!   - cpal capture stream, real-time meter compute
//!   - non-RT drain thread emits aggregated meter events
//!   - controller exposes start/stop/select/mute/raw
//!
//! Real-time rules (audio-engine.md §3) are enforced inside `capture::callback`.

#![forbid(unsafe_op_in_unsafe_fn)]

pub mod capture;
pub mod controller;
pub mod drain;
pub mod engine;
pub mod events;
pub mod faults;
pub mod meters;
pub mod profile;
pub mod recorder;

pub use controller::EngineController;
pub use events::EngineEvent;
pub use faults::EngineFault;
pub use meters::{MeterAggregate, MeterSample};
pub use miclayer_dsp::graph::ProfileModules;
pub use miclayer_dsp::params as dsp_params;
pub use miclayer_virtual_mic::SinkStatus;
pub use profile::{Profile, ProfileError, ProfileKind};
pub use recorder::RecordingHandle;

/// Stable engine version. Bumped when IPC surface changes incompatibly.
pub const ENGINE_API_VERSION: u32 = 1;

/// Working sample rate of the internal pipeline.
/// Devices that don't deliver this will get a resampler later (Milestone 2.5+).
pub const PIPELINE_SAMPLE_RATE_HZ: u32 = 48_000;
