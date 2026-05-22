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
            let mut accumulator = MeterAccumulator::default();

            while !flags.drain_should_stop.load(Ordering::Relaxed) {
                // Drain all available meter samples since last tick.
                while let Ok(sample) = meter_rx.pop() {
                    accumulator.merge(sample);
                }

                // Drain faults — each one becomes an engine.error event.
                while let Ok(fault) = fault_rx.pop() {
                    tracing::warn!(?fault, "engine fault");
                    emit(EngineEvent::Error { fault });
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
