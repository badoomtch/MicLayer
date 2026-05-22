//! Engine state machine and shared atomics.
//!
//! Atomics are the audio-thread-safe channel for muted / raw flags. State
//! enum lives behind an RwLock — only the controller writes it; the UI
//! reads it via the controller method.

use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// Engine lifecycle. See docs/audio-engine.md §2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Faulted,
}

/// Atomics shared between the controller, audio callback, and drain thread.
#[derive(Debug, Default)]
pub struct EngineFlags {
    pub muted: AtomicBool,
    pub raw_mode: AtomicBool,
    pub drain_should_stop: AtomicBool,
}

impl EngineFlags {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
}
