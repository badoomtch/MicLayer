//! Diagnostics snapshot + export.
//!
//! The snapshot collects: engine state, sink status, selected device, OS
//! info, app version, active profile name. Audio is never included.

use std::path::PathBuf;

use miclayer_audio::engine::EngineState;
use miclayer_audio::SinkStatus;
use miclayer_devices::AudioDevice;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsSnapshot {
    pub app_version: String,
    pub engine_state: EngineState,
    pub selected_device_id: Option<String>,
    pub muted: bool,
    pub raw: bool,
    pub sink: SinkStatus,
    pub input_devices: Vec<AudioDevice>,
    pub active_profile_id: Option<String>,
    pub default_profile_id: Option<String>,
    pub os: OsInfo,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OsInfo {
    pub family: &'static str,
    pub arch: &'static str,
}

#[tauri::command]
pub fn diagnostics_snapshot(state: State<AppState>) -> DiagnosticsSnapshot {
    let config = state.store.config_snapshot();
    let c = state.controller.lock();
    DiagnosticsSnapshot {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        engine_state: c.state(),
        selected_device_id: c.selected_device_id().map(|s| s.to_string()),
        muted: c.muted(),
        raw: c.raw(),
        sink: c.sink_status(),
        input_devices: c.list_devices(),
        active_profile_id: config.active_profile_id,
        default_profile_id: config.default_profile_id,
        os: OsInfo {
            family: std::env::consts::FAMILY,
            arch: std::env::consts::ARCH,
        },
        timestamp: miclayer_audio::profile::now_iso8601(),
    }
}

#[tauri::command]
pub fn diagnostics_export(state: State<AppState>, path: String) -> Result<(), String> {
    let snapshot = diagnostics_snapshot(state);
    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    std::fs::write(PathBuf::from(&path), json)
        .map_err(|e| format!("could not write {path}: {e}"))?;
    Ok(())
}
