//! Test recorder: capture raw + processed audio to two WAV files.
//!
//! Design:
//!   - At every engine session start, two SPSC rings are allocated (one
//!     for raw, one for processed). Producers go into the audio callback;
//!     consumers stay with the controller-owned writer thread.
//!   - The audio thread only pushes to the rings when `active` is set.
//!     Atomic check first — when not recording, the side-tap is a no-op.
//!   - The writer thread runs for the engine session's lifetime, drains
//!     the rings while a session is active, and writes them out as
//!     16-bit PCM WAV via `hound`.
//!   - Max 30 s per recording. Auto-stops at the limit.
//!   - WAV files live in `<data_dir>/recordings/<uuid>.wav`. They are
//!     deleted on engine shutdown unless explicitly saved (the controller
//!     tracks saved status).

use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use parking_lot::Mutex;
use rtrb::{Consumer, Producer, RingBuffer};
use serde::Serialize;

use crate::faults::EngineFault;

pub const SAMPLE_RATE_HZ: u32 = 48_000;
pub const MAX_RECORDING_MS: u32 = 30_000;
pub const RING_CAPACITY_SAMPLES: usize = 48_000; // ~1 s buffer at 48 kHz

/// 0 = idle, 1 = recording, 2 = stopping (drain remaining samples + close).
pub const STATE_IDLE: u8 = 0;
pub const STATE_RECORDING: u8 = 1;
pub const STATE_STOPPING: u8 = 2;

#[derive(Debug, Clone, Serialize)]
pub struct RecordingHandle {
    pub raw_path: PathBuf,
    pub processed_path: PathBuf,
    pub saved: bool,
}

struct ActiveSession {
    raw_writer: hound::WavWriter<std::io::BufWriter<std::fs::File>>,
    processed_writer: hound::WavWriter<std::io::BufWriter<std::fs::File>>,
    raw_path: PathBuf,
    processed_path: PathBuf,
    samples_written: u64,
    samples_max: u64,
}

pub struct RecorderControl {
    state: Arc<AtomicU8>,
    stop_writer: Arc<std::sync::atomic::AtomicBool>,
    session: Arc<Mutex<Option<ActiveSession>>>,
    writer_handle: Mutex<Option<JoinHandle<()>>>,
    /// Output directory for new recordings.
    recordings_dir: PathBuf,
    /// Set of unsaved recordings to delete on shutdown.
    pending_unsaved: Mutex<Vec<RecordingHandle>>,
}

/// Producer side of the side-tap. Lives in the audio callback.
pub struct RecorderTaps {
    pub raw: Producer<f32>,
    pub processed: Producer<f32>,
    pub state: Arc<AtomicU8>,
}

impl RecorderTaps {
    /// Push input + processed buffers if recording is active.
    /// Returns immediately when idle — the atomic load is the only cost.
    #[inline]
    pub fn push_if_active(&mut self, input: &[f32], processed: &[f32]) {
        if self.state.load(Ordering::Relaxed) != STATE_RECORDING {
            return;
        }
        // Ring full = drop excess. Writer thread should keep up; if it
        // can't, recording quality degrades gracefully (silent gaps) but
        // the audio thread is never blocked.
        for &s in input {
            let _ = self.raw.push(s);
        }
        for &s in processed {
            let _ = self.processed.push(s);
        }
    }
}

impl RecorderControl {
    pub fn new(recordings_dir: PathBuf) -> (Self, RecorderTaps) {
        std::fs::create_dir_all(&recordings_dir).ok();

        let state = Arc::new(AtomicU8::new(STATE_IDLE));
        let stop_writer = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let session: Arc<Mutex<Option<ActiveSession>>> = Arc::new(Mutex::new(None));

        let (raw_tx, raw_rx) = RingBuffer::<f32>::new(RING_CAPACITY_SAMPLES);
        let (proc_tx, proc_rx) = RingBuffer::<f32>::new(RING_CAPACITY_SAMPLES);

        let writer_handle = spawn_writer_thread(
            state.clone(),
            stop_writer.clone(),
            session.clone(),
            raw_rx,
            proc_rx,
        );

        let ctrl = Self {
            state: state.clone(),
            stop_writer,
            session,
            writer_handle: Mutex::new(Some(writer_handle)),
            recordings_dir,
            pending_unsaved: Mutex::new(Vec::new()),
        };

        let taps = RecorderTaps {
            raw: raw_tx,
            processed: proc_tx,
            state,
        };

        (ctrl, taps)
    }

    pub fn is_active(&self) -> bool {
        self.state.load(Ordering::Relaxed) != STATE_IDLE
    }

    /// Begin a recording. If one is already active, returns the existing
    /// handle without restarting.
    pub fn start(&self) -> Result<RecordingHandle, EngineFault> {
        if self.state.load(Ordering::Relaxed) != STATE_IDLE {
            // Existing session — return current paths if any.
            if let Some(s) = self.session.lock().as_ref() {
                return Ok(RecordingHandle {
                    raw_path: s.raw_path.clone(),
                    processed_path: s.processed_path.clone(),
                    saved: false,
                });
            }
        }

        let uuid = crate::profile::new_uuid();
        let raw_path = self.recordings_dir.join(format!("test-{uuid}-raw.wav"));
        let processed_path = self.recordings_dir.join(format!("test-{uuid}-processed.wav"));

        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE_HZ,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let raw_writer = hound::WavWriter::create(&raw_path, spec)
            .map_err(|e| EngineFault::InputOpenFailed { detail: format!("open raw wav: {e}") })?;
        let processed_writer = hound::WavWriter::create(&processed_path, spec)
            .map_err(|e| EngineFault::InputOpenFailed { detail: format!("open processed wav: {e}") })?;

        let samples_max = (SAMPLE_RATE_HZ as u64) * (MAX_RECORDING_MS as u64) / 1000;

        *self.session.lock() = Some(ActiveSession {
            raw_writer,
            processed_writer,
            raw_path: raw_path.clone(),
            processed_path: processed_path.clone(),
            samples_written: 0,
            samples_max,
        });

        self.state.store(STATE_RECORDING, Ordering::Relaxed);

        let handle = RecordingHandle {
            raw_path,
            processed_path,
            saved: false,
        };
        self.pending_unsaved.lock().push(handle.clone());
        Ok(handle)
    }

    /// Signal stop and wait for the writer thread to finalize the files.
    /// Returns the finalized handle.
    pub fn stop(&self) -> Option<RecordingHandle> {
        let prev = self.state.swap(STATE_STOPPING, Ordering::Relaxed);
        if prev == STATE_IDLE {
            return None;
        }
        // Wait up to 2 s for the writer thread to drain and finalize.
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while self.state.load(Ordering::Relaxed) != STATE_IDLE
            && std::time::Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(15));
        }
        // The writer thread cleared the session; the paths were recorded
        // in pending_unsaved when start() was called.
        self.pending_unsaved.lock().last().cloned()
    }

    /// Mark a recording as user-saved so we don't delete it on shutdown.
    /// Returns true if the recording was found and marked.
    pub fn mark_saved(&self, raw_path: &std::path::Path) -> bool {
        let mut pending = self.pending_unsaved.lock();
        if let Some(r) = pending.iter_mut().find(|r| r.raw_path == raw_path) {
            r.saved = true;
            true
        } else {
            false
        }
    }

    /// Delete the recording's WAV files immediately (e.g., user clicks Discard).
    pub fn discard(&self, raw_path: &std::path::Path) -> bool {
        let mut pending = self.pending_unsaved.lock();
        if let Some(pos) = pending.iter().position(|r| r.raw_path == raw_path) {
            let r = pending.remove(pos);
            let _ = std::fs::remove_file(&r.raw_path);
            let _ = std::fs::remove_file(&r.processed_path);
            true
        } else {
            false
        }
    }
}

impl Drop for RecorderControl {
    fn drop(&mut self) {
        // Stop the writer thread.
        self.stop_writer.store(true, Ordering::Relaxed);
        if let Some(handle) = self.writer_handle.lock().take() {
            let _ = handle.join();
        }
        // Delete any unsaved recordings.
        let pending = std::mem::take(&mut *self.pending_unsaved.lock());
        for r in pending {
            if !r.saved {
                let _ = std::fs::remove_file(&r.raw_path);
                let _ = std::fs::remove_file(&r.processed_path);
            }
        }
    }
}

fn spawn_writer_thread(
    state: Arc<AtomicU8>,
    stop_writer: Arc<std::sync::atomic::AtomicBool>,
    session: Arc<Mutex<Option<ActiveSession>>>,
    mut raw_rx: Consumer<f32>,
    mut proc_rx: Consumer<f32>,
) -> JoinHandle<()> {
    std::thread::Builder::new()
        .name("miclayer-recorder".into())
        .spawn(move || {
            loop {
                if stop_writer.load(Ordering::Relaxed) {
                    break;
                }
                let s = state.load(Ordering::Relaxed);
                if s == STATE_IDLE {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }

                let mut session_lock = session.lock();
                let Some(active) = session_lock.as_mut() else {
                    drop(session_lock);
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                };

                // Drain whichever stream has fewer queued samples this tick,
                // so we keep them roughly synced. In practice both rings
                // receive the same number of samples per audio callback.
                let mut wrote_this_tick = 0u32;
                while let (Ok(r), Ok(p)) = (raw_rx.pop(), proc_rx.pop()) {
                    let _ = active.raw_writer.write_sample(f32_to_i16(r));
                    let _ = active.processed_writer.write_sample(f32_to_i16(p));
                    active.samples_written += 1;
                    wrote_this_tick += 1;
                    if active.samples_written >= active.samples_max {
                        break;
                    }
                }

                let auto_stop = active.samples_written >= active.samples_max;
                let user_stop = s == STATE_STOPPING;

                if (auto_stop || user_stop) && wrote_this_tick == 0 {
                    // Finalize: take the writers out of the session and
                    // finalize them.
                    let taken = session_lock.take();
                    drop(session_lock);
                    if let Some(s) = taken {
                        if let Err(e) = s.raw_writer.finalize() {
                            tracing::warn!("raw wav finalize: {e}");
                        }
                        if let Err(e) = s.processed_writer.finalize() {
                            tracing::warn!("processed wav finalize: {e}");
                        }
                    }
                    state.store(STATE_IDLE, Ordering::Relaxed);
                    continue;
                }

                drop(session_lock);
                std::thread::sleep(Duration::from_millis(10));
            }
        })
        .expect("failed to spawn recorder writer thread")
}

#[inline]
fn f32_to_i16(s: f32) -> i16 {
    let clamped = s.clamp(-1.0, 1.0);
    (clamped * i16::MAX as f32) as i16
}
