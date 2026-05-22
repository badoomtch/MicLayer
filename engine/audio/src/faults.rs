//! Engine error taxonomy. Maps 1:1 to docs/error-handling.md §3.

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error, Serialize)]
#[serde(tag = "id", content = "detail")]
pub enum EngineFault {
    #[error("no input device selected")]
    #[serde(rename = "engine.input.no_device")]
    InputNoDevice,

    #[error("selected input device is missing: {name}")]
    #[serde(rename = "engine.input.device_missing")]
    InputDeviceMissing { name: String },

    #[error("input device is busy in exclusive mode")]
    #[serde(rename = "engine.input.device_busy_exclusive")]
    InputDeviceBusyExclusive,

    #[error("microphone permission denied by Windows")]
    #[serde(rename = "engine.input.permission_denied")]
    InputPermissionDenied,

    #[error("device sample rate {device_rate} required resampling")]
    #[serde(rename = "engine.input.sample_rate_mismatch")]
    InputSampleRateMismatch { device_rate: u32 },

    #[error("could not open input stream: {detail}")]
    #[serde(rename = "engine.input.open_failed")]
    InputOpenFailed { detail: String },

    #[error("input stream error: {detail}")]
    #[serde(rename = "engine.input.stream_error")]
    InputStreamError { detail: String },

    #[error("virtual mic backend is not installed")]
    #[serde(rename = "engine.sink.missing")]
    SinkMissing,

    #[error("could not write to virtual mic backend: {detail}")]
    #[serde(rename = "engine.sink.write_failure")]
    SinkWriteFailure { detail: String },

    #[error("virtual mic backend opened at an unsupported format: {detail}")]
    #[serde(rename = "engine.sink.format_unsupported")]
    SinkFormatUnsupported { detail: String },

    #[error("DSP module {module} panicked")]
    #[serde(rename = "engine.dsp.panic")]
    DspPanic { module: String },
}

impl EngineFault {
    /// Stable string identifier used in logs and the UI catalogue.
    pub fn id(&self) -> &'static str {
        match self {
            Self::InputNoDevice => "engine.input.no_device",
            Self::InputDeviceMissing { .. } => "engine.input.device_missing",
            Self::InputDeviceBusyExclusive => "engine.input.device_busy_exclusive",
            Self::InputPermissionDenied => "engine.input.permission_denied",
            Self::InputSampleRateMismatch { .. } => "engine.input.sample_rate_mismatch",
            Self::InputOpenFailed { .. } => "engine.input.open_failed",
            Self::InputStreamError { .. } => "engine.input.stream_error",
            Self::SinkMissing => "engine.sink.missing",
            Self::SinkWriteFailure { .. } => "engine.sink.write_failure",
            Self::SinkFormatUnsupported { .. } => "engine.sink.format_unsupported",
            Self::DspPanic { .. } => "engine.dsp.panic",
        }
    }
}
