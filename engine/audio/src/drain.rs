//! Drain thread.
//!
//! Reads the meter and fault rings at ~30 Hz and emits aggregated Tauri
//! events. Runs at normal priority — non-realtime, allowed to log and
//! allocate (allocates only at startup; the loop itself is allocation-free
//! aside from the JSON serialisation that happens inside `emit`).

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::engine::EngineFlags;
use crate::events::{Emit, EngineEvent};
use crate::faults::EngineFault;
use crate::meters::{MeterAccumulator, MeterSample};

const TICK_INTERVAL: Duration = Duration::from_millis(33);
const LOOP_SLEEP: Duration = Duration::from_millis(8);
/// If we go this long without a meter sample, assume the capture stream
/// has silently died (Windows audio session reset, USB hiccup, format
/// change). cpal's error callback isn't reliable on WASAPI — it often
/// stops delivering data without firing the error path. The watchdog
/// fires a fault so the Tauri layer can stop+start the engine.
const STREAM_WATCHDOG: Duration = Duration::from_millis(3_000);

/// Spawn the drain thread. Returns a handle that can be joined when the
/// drain is told to stop via `flags.drain_should_stop`.
pub fn spawn(
    flags: Arc<EngineFlags>,
    emit: Emit,
    mut meter_rx: rtrb::Consumer<MeterSample>,
    mut fault_rx: rtrb::Consumer<EngineFault>,
) -> JoinHandle<()> {
    thread::Builder::new()
        .name("miclayer-drain".into())
        .spawn(move || {
            let mut last_emit = Instant::now();
            let mut last_sample = Instant::now();
            // One-shot per dead-stream incident. Resets when a new sample
            // arrives — the engine has been (re)started and audio is back.
            let mut watchdog_fired = false;
            let mut accumulator = MeterAccumulator::default();

            while !flags.drain_should_stop.load(Ordering::Relaxed) {
                // Drain all available meter samples since last tick.
                let mut got_sample = false;
                while let Ok(sample) = meter_rx.pop() {
                    accumulator.merge(sample);
                    got_sample = true;
                }
                if got_sample {
                    last_sample = Instant::now();
                    watchdog_fired = false;
                }

                // Drain faults — each one becomes an engine.error event.
                while let Ok(fault) = fault_rx.pop() {
                    tracing::warn!(?fault, "engine fault");
                    emit(EngineEvent::Error { fault });
                }

                // Watchdog: if no meter samples for STREAM_WATCHDOG, the
                // capture stream is probably dead. Emit a fault once so
                // the Tauri layer can recover. Don't keep emitting.
                if !watchdog_fired && last_sample.elapsed() >= STREAM_WATCHDOG {
                    let fault = EngineFault::InputStreamError {
                        detail: format!(
                            "no audio data for {}ms — capture stream appears dead",
                            STREAM_WATCHDOG.as_millis(),
                        ),
                    };
                    tracing::warn!(?fault, "drain watchdog fired");
                    emit(EngineEvent::Error { fault });
                    watchdog_fired = true;
                }

                if last_emit.elapsed() >= TICK_INTERVAL {
                    let prev = std::mem::take(&mut accumulator);
                    if let Some(agg) = prev.finalize() {
                        if agg.clipping {
                            emit(EngineEvent::Clip);
                        }
                        emit(EngineEvent::Meters(agg));
                    }
                    last_emit = Instant::now();
                }

                thread::sleep(LOOP_SLEEP);
            }

            tracing::info!("drain thread exiting");
        })
        .expect("failed to spawn drain thread")
}
