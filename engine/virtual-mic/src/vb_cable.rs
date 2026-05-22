//! VB-CABLE sink backend (M8).
//!
//! Looks for an output device whose name contains "CABLE Input" — the
//! render endpoint VB-Audio creates. Opens a cpal output stream on it,
//! exposes the matching producer side of an SPSC ring for the audio
//! engine to push processed mono samples into. Mono input is duplicated
//! to all output channels in the render callback.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, StreamError};

use crate::{SinkError, SinkFormat, SinkStatus};

const TARGET_NAME_SUBSTR: &str = "CABLE Input";
const RING_CAPACITY_SAMPLES: usize = 48_000; // ~1 s at 48 kHz

pub const BACKEND_ID: &str = "vb-cable";

/// Thin Send+Sync wrapper around `cpal::Stream`. Same rationale as
/// `miclayer_audio::capture::SendableStream` — cpal doesn't add the
/// auto-traits and we never call Stream methods concurrently.
pub struct SendableStream(pub Stream);
unsafe impl Send for SendableStream {}
unsafe impl Sync for SendableStream {}

pub struct VbCableSink {
    pub stream: SendableStream,
    pub config: StreamConfig,
    pub sample_format: SampleFormat,
}

/// Producer side of the sink ring — moved into the audio capture callback
/// so it can push processed frames.
pub type SinkProducer = rtrb::Producer<f32>;

/// Check if VB-CABLE is installed and visible. Returns the device's
/// friendly name (e.g. "CABLE Input (VB-Audio Virtual Cable)") if found.
pub fn detect() -> Option<String> {
    let host = cpal::default_host();
    host.output_devices()
        .ok()?
        .filter_map(|d| d.name().ok())
        .find(|name| name.contains(TARGET_NAME_SUBSTR))
}

/// Inspect status without opening the stream.
pub fn status() -> SinkStatus {
    let installed_name = detect();
    let installed = installed_name.is_some();
    let windows_facing_name = installed_name
        .as_ref()
        .map(|n| n.replace("CABLE Input", "CABLE Output"));
    SinkStatus {
        backend: BACKEND_ID,
        installed,
        active: false,
        windows_facing_name,
        format: None,
    }
}

/// Open the VB-CABLE render stream. Returns the live stream + the
/// producer side of the ring that the audio engine should push into.
pub fn open<F>(mut on_stream_error: F) -> Result<(VbCableSink, SinkProducer, SinkFormat), SinkError>
where
    F: FnMut(String) + Send + 'static,
{
    let host = cpal::default_host();
    let device = host
        .output_devices()
        .map_err(|e| SinkError::OpenFailed(e.to_string()))?
        .filter(|d| d.name().ok().is_some_and(|n| n.contains(TARGET_NAME_SUBSTR)))
        .next()
        .ok_or(SinkError::NotInstalled)?;

    let supported = device
        .default_output_config()
        .map_err(|e| SinkError::OpenFailed(e.to_string()))?;

    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    let channels = config.channels as usize;
    let sample_rate_hz = config.sample_rate.0;

    let (producer, mut consumer) = rtrb::RingBuffer::<f32>::new(RING_CAPACITY_SAMPLES);

    let stream = match sample_format {
        SampleFormat::F32 => device.build_output_stream::<f32, _, _>(
            &config,
            move |data: &mut [f32], _info| {
                fill_output(data, &mut consumer, channels);
            },
            move |err: StreamError| {
                tracing::error!("sink output stream error: {err}");
                on_stream_error(err.to_string());
            },
            None,
        ),
        SampleFormat::I16 => device.build_output_stream::<i16, _, _>(
            &config,
            move |data: &mut [i16], _info| {
                fill_output_i16(data, &mut consumer, channels);
            },
            move |err: StreamError| {
                tracing::error!("sink output stream error: {err}");
                on_stream_error(err.to_string());
            },
            None,
        ),
        other => return Err(SinkError::FormatUnsupported(format!("{other:?}"))),
    }
    .map_err(|e| SinkError::OpenFailed(e.to_string()))?;

    stream
        .play()
        .map_err(|e| SinkError::OpenFailed(e.to_string()))?;

    let format = SinkFormat {
        sample_rate_hz,
        channels: config.channels,
    };

    Ok((
        VbCableSink { stream: SendableStream(stream), config, sample_format },
        producer,
        format,
    ))
}

#[inline]
fn fill_output(data: &mut [f32], consumer: &mut rtrb::Consumer<f32>, channels: usize) {
    if channels == 0 {
        return;
    }
    let frames = data.len() / channels;
    for i in 0..frames {
        let s = consumer.pop().unwrap_or(0.0);
        for c in 0..channels {
            data[i * channels + c] = s;
        }
    }
}

#[inline]
fn fill_output_i16(data: &mut [i16], consumer: &mut rtrb::Consumer<f32>, channels: usize) {
    if channels == 0 {
        return;
    }
    let frames = data.len() / channels;
    for i in 0..frames {
        let s = consumer.pop().unwrap_or(0.0);
        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        for c in 0..channels {
            data[i * channels + c] = v;
        }
    }
}
