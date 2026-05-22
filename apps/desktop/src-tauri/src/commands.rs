//! Tauri command handlers.

use miclayer_audio::engine::EngineState;
use miclayer_audio::{ProfileModules, SinkStatus};
use miclayer_devices::AudioDevice;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub fn engine_list_devices(state: State<AppState>) -> Vec<AudioDevice> {
    state.controller.lock().list_devices()
}

#[tauri::command]
pub fn engine_select_input(state: State<AppState>, device_id: String) {
    state.controller.lock().select_input(device_id);
}

#[tauri::command]
pub fn engine_start(state: State<AppState>) -> Result<(), String> {
    state
        .controller
        .lock()
        .start()
        .map_err(|f| f.to_string())
}

#[tauri::command]
pub fn engine_stop(state: State<AppState>) {
    state.controller.lock().stop();
}

#[tauri::command]
pub fn engine_set_muted(state: State<AppState>, muted: bool) {
    state.controller.lock().set_muted(muted);
}

#[tauri::command]
pub fn engine_set_raw(state: State<AppState>, raw: bool) {
    state.controller.lock().set_raw(raw);
}

#[derive(Debug, Serialize)]
pub struct EngineSnapshot {
    pub state: EngineState,
    #[serde(rename = "selectedDeviceId")]
    pub selected_device_id: Option<String>,
    pub muted: bool,
    pub raw: bool,
}

#[tauri::command]
pub fn engine_snapshot(state: State<AppState>) -> EngineSnapshot {
    let c = state.controller.lock();
    EngineSnapshot {
        state: c.state(),
        selected_device_id: c.selected_device_id().map(|s| s.to_string()),
        muted: c.muted(),
        raw: c.raw(),
    }
}

/// Apply a full profile (every module's enabled flag + params). Hot-applies
/// to the running engine if any; otherwise cached for next start.
#[tauri::command]
pub fn engine_apply_profile(state: State<AppState>, modules: ProfileModules) {
    state.controller.lock().apply_profile(modules);
}

/// Return the controller's current profile snapshot. Useful for the UI
/// to load defaults on first run.
#[tauri::command]
pub fn engine_current_profile(state: State<AppState>) -> ProfileModules {
    state.controller.lock().current_profile().clone()
}

/// Snapshot of the virtual-mic sink backend status (e.g. VB-CABLE detection,
/// currently-active flag, format the sink negotiated).
#[tauri::command]
pub fn engine_sink_status(state: State<AppState>) -> SinkStatus {
    state.controller.lock().sink_status()
}
