//! Virtual microphone sink.
//!
//! M8 design: a sink opens a WASAPI render stream on a destination output
//! device (e.g. VB-CABLE's `CABLE Input`). The engine's input callback
//! pushes processed frames into a lock-free SPSC ring; the sink stream's
//! render callback pops them and writes them out. Other apps select the
//! corresponding capture endpoint (`CABLE Output`) and receive the audio.
//!
//! v1.0 will add a `MicLayerWdmSink` exposing a branded
//! `MicLayer Microphone` device, replacing VB-CABLE. The trait surface
//! is kept narrow so the audio engine stays unchanged when that lands.

#![forbid(unsafe_op_in_unsafe_fn)]

use serde::Serialize;

pub mod vb_cable;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct SinkFormat {
    pub sample_rate_hz: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct SinkStatus {
    /// Stable identifier for the backend, e.g. "vb-cable" or "miclayer-wdm".
    pub backend: &'static str,
    /// Whether the backend's underlying device is installed and openable.
    pub installed: bool,
    /// Whether the sink is currently active (audio flowing).
    pub active: bool,
    /// The friendly device name other apps will see, if known.
    pub windows_facing_name: Option<String>,
    /// Negotiated format if active.
    pub format: Option<SinkFormat>,
}

impl SinkStatus {
    pub const NONE: Self = Self {
        backend: "none",
        installed: false,
        active: false,
        windows_facing_name: None,
        format: None,
    };
}

#[derive(Debug, thiserror::Error)]
pub enum SinkError {
    #[error("backend not installed")]
    NotInstalled,
    #[error("could not open sink: {0}")]
    OpenFailed(String),
    #[error("format unsupported: {0}")]
    FormatUnsupported(String),
}
