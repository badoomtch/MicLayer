//! Engine-emitted events. The controller is constructed with an emit
//! callback; the drain thread calls it for each event. The Tauri layer
//! turns the callback into `app_handle.emit("engine", payload)`.

use serde::Serialize;

use crate::{engine::EngineState, faults::EngineFault, meters::MeterAggregate};

/// All engine -> UI events. Discriminated by `kind`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum EngineEvent {
    #[serde(rename = "engine.status")]
    Status { status: EngineState, reason: Option<String> },

    #[serde(rename = "engine.meters")]
    Meters(MeterAggregate),

    #[serde(rename = "engine.clip")]
    Clip,

    #[serde(rename = "engine.error")]
    Error {
        #[serde(flatten)]
        fault: EngineFault,
    },

    #[serde(rename = "engine.device")]
    DeviceListChanged,
}

/// Boxed event emitter used by the controller and drain thread.
/// `Send + Sync + 'static` so it can be cloned into a thread.
pub type Emit = std::sync::Arc<dyn Fn(EngineEvent) + Send + Sync + 'static>;
