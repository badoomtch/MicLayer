//! cpal capture stream wrapper.
//!
//! Real-time rules in docs/audio-engine.md §3:
//!   - no allocation, no locking, no logging, no panic in the data callback
//!   - cross-thread state moves via rtrb (lock-free SPSC) or atomics
//!
//! M5 addition: recorder side-tap.
//! M8 addition: virtual-mic sink push (Option<Producer<f32>>) — when the
//! sink backend is open, the processed-and-muted-if-applicable signal goes
//! into the sink ring on every callback.

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, StreamError};
use miclayer_dsp::Graph;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crate::engine::EngineFlags;
use crate::faults::EngineFault;
use crate::meters::{self, MeterSample};
use crate::recorder::RecorderTaps;

pub const MAX_BLOCK_SAMPLES: usize = 4096;

/// Thin Send+Sync wrapper around `cpal::Stream`. On Windows WASAPI the
/// underlying Stream is safe to move between threads (commands route to
/// the audio worker via a channel); upstream `cpal` does not provide the
/// auto-trait impls, so we add them here. We never call Stream methods
/// concurrently — the engine wraps the whole controller in a Mutex.
pub struct SendableStream(pub Stream);
unsafe impl Send for SendableStream {}
unsafe impl Sync for SendableStream {}

pub struct ActiveCapture {
    pub stream: SendableStream,
    pub config: StreamConfig,
    pub sample_format: SampleFormat,
}

#[allow(clippy::too_many_arguments)]
pub fn open(
    device: &cpal::Device,
    flags: Arc<EngineFlags>,
    mut graph: Graph,
    recorder_taps: RecorderTaps,
    sink_tx: Option<rtrb::Producer<f32>>,
    meter_tx: rtrb::Producer<MeterSample>,
    fault_tx: rtrb::Producer<EngineFault>,
) -> Result<ActiveCapture, EngineFault> {
    let supported = device
        .default_input_config()
        .map_err(|e| EngineFault::InputOpenFailed { detail: e.to_string() })?;

    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    let sample_rate = config.sample_rate.0;

    graph.reset();

    let stream = match sample_format {
        SampleFormat::F32 => build_f32_stream(
            device, &config, flags, graph, recorder_taps, sink_tx, sample_rate, meter_tx, fault_tx,
        ),
        SampleFormat::I16 => build_i16_stream(
            device, &config, flags, graph, recorder_taps, sink_tx, sample_rate, meter_tx, fault_tx,
        ),
        other => {
            return Err(EngineFault::InputOpenFailed {
                detail: format!("input sample format {other:?} not supported"),
            });
        }
    }?;

    stream
        .play()
        .map_err(|e| EngineFault::InputOpenFailed { detail: e.to_string() })?;

    Ok(ActiveCapture { stream: SendableStream(stream), config, sample_format })
}

#[allow(clippy::too_many_arguments)]
fn build_f32_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    flags: Arc<EngineFlags>,
    mut graph: Graph,
    mut recorder_taps: RecorderTaps,
    mut sink_tx: Option<rtrb::Producer<f32>>,
    sample_rate: u32,
    mut meter_tx: rtrb::Producer<MeterSample>,
    mut fault_tx: rtrb::Producer<EngineFault>,
) -> Result<Stream, EngineFault> {
    // The DSP graph and the sink both work in mono. cpal hands us interleaved
    // `[L0, R0, L1, R1, ...]` for multi-channel devices, so we downmix to
    // mono frames once at the top of the callback and operate on that.
    let mut work = vec![0.0_f32; MAX_BLOCK_SAMPLES];
    let mut dry = vec![0.0_f32; MAX_BLOCK_SAMPLES];
    let channels = config.channels.max(1) as usize;
    device
        .build_input_stream::<f32, _, _>(
            config,
            move |data, _info| {
                let frames = (data.len() / channels).min(work.len());
                let work_slice = &mut work[..frames];

                let inv_ch = 1.0_f32 / channels as f32;
                for f in 0..frames {
                    let base = f * channels;
                    let mut sum = 0.0_f32;
                    for c in 0..channels {
                        sum += data[base + c];
                    }
                    work_slice[f] = sum * inv_ch;
                }

                let (in_peak, in_rms, _) = meters::compute(work_slice);
                let raw = flags.raw_mode.load(Ordering::Relaxed);
                let muted = flags.muted.load(Ordering::Relaxed);

                // Snapshot the dry (downmixed) signal for the recorder side-tap.
                dry[..frames].copy_from_slice(work_slice);

                if !raw {
                    graph.process(work_slice, sample_rate);
                }
                if muted {
                    work_slice.fill(0.0);
                }

                let (out_peak, out_rms, out_clipped) = meters::compute(work_slice);

                recorder_taps.push_if_active(&dry[..frames], work_slice);

                if let Some(tx) = sink_tx.as_mut() {
                    for &s in work_slice.iter() {
                        let _ = tx.push(s);
                    }
                }

                let _ = meter_tx.push(MeterSample {
                    input_peak: in_peak,
                    input_rms: in_rms,
                    output_peak: out_peak,
                    output_rms: out_rms,
                    clipped: out_clipped,
                    gate_open: true,
                });
            },
            move |err: StreamError| {
                tracing::error!("input stream error: {err}");
                let _ = fault_tx.push(EngineFault::InputStreamError {
                    detail: err.to_string(),
                });
            },
            None,
        )
        .map_err(|e| EngineFault::InputOpenFailed { detail: e.to_string() })
}

#[allow(clippy::too_many_arguments)]
fn build_i16_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    flags: Arc<EngineFlags>,
    mut graph: Graph,
    mut recorder_taps: RecorderTaps,
    mut sink_tx: Option<rtrb::Producer<f32>>,
    sample_rate: u32,
    mut meter_tx: rtrb::Producer<MeterSample>,
    mut fault_tx: rtrb::Producer<EngineFault>,
) -> Result<Stream, EngineFault> {
    // Mono frame buffers: `work` is the live signal (pre + post DSP),
    // `dry` is the pre-DSP downmix snapshot used by the recorder side-tap.
    let mut work = vec![0.0_f32; MAX_BLOCK_SAMPLES];
    let mut dry = vec![0.0_f32; MAX_BLOCK_SAMPLES];
    let scale = 1.0_f32 / i16::MAX as f32;
    let channels = config.channels.max(1) as usize;
    device
        .build_input_stream::<i16, _, _>(
            config,
            move |data, _info| {
                let frames = (data.len() / channels).min(work.len());
                let work_slice = &mut work[..frames];

                // Downmix to mono in i16 first so the peak/RMS we report
                // matches what the DSP sees.
                let mut peak_i: i32 = 0;
                let mut sumsq: f64 = 0.0;
                let inv_ch = 1.0_f32 / channels as f32;
                for f in 0..frames {
                    let base = f * channels;
                    let mut sum_i: i32 = 0;
                    for c in 0..channels {
                        sum_i += data[base + c] as i32;
                    }
                    let mean_i = sum_i / channels as i32;
                    let a = mean_i.abs();
                    if a > peak_i {
                        peak_i = a;
                    }
                    let v = mean_i as f32 * scale * inv_ch * channels as f32;
                    // The two `inv_ch * channels` cancel — kept explicit so the
                    // intent (per-frame mean) is readable.
                    work_slice[f] = v;
                    let m = mean_i as f64;
                    sumsq += m * m;
                }
                let in_peak = (peak_i as f32) / i16::MAX as f32;
                let in_rms = ((sumsq / frames.max(1) as f64).sqrt() as f32) / i16::MAX as f32;

                let raw = flags.raw_mode.load(Ordering::Relaxed);
                let muted = flags.muted.load(Ordering::Relaxed);

                dry[..frames].copy_from_slice(work_slice);

                if !raw {
                    graph.process(work_slice, sample_rate);
                }
                if muted {
                    work_slice.fill(0.0);
                }

                let (out_peak, out_rms, out_clipped) = meters::compute(work_slice);

                recorder_taps.push_if_active(&dry[..frames], work_slice);

                if let Some(tx) = sink_tx.as_mut() {
                    for &s in work_slice.iter() {
                        let _ = tx.push(s);
                    }
                }

                let _ = meter_tx.push(MeterSample {
                    input_peak: in_peak,
                    input_rms: in_rms,
                    output_peak: out_peak,
                    output_rms: out_rms,
                    clipped: out_clipped,
                    gate_open: true,
                });
            },
            move |err: StreamError| {
                tracing::error!("input stream error: {err}");
                let _ = fault_tx.push(EngineFault::InputStreamError {
                    detail: err.to_string(),
                });
            },
            None,
        )
        .map_err(|e| EngineFault::InputOpenFailed { detail: e.to_string() })
}
