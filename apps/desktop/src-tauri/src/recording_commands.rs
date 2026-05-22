//! Tauri commands for the test recorder.

use std::path::PathBuf;

use miclayer_audio::RecordingHandle;
use tauri::State;

use crate::app_state::AppState;

#[tauri::command]
pub fn recording_start(state: State<AppState>) -> Result<RecordingHandle, String> {
    state
        .controller
        .lock()
        .recording_start()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recording_stop(state: State<AppState>) -> Option<RecordingHandle> {
    state.controller.lock().recording_stop()
}

#[tauri::command]
pub fn recording_active(state: State<AppState>) -> bool {
    state.controller.lock().recording_active()
}

#[tauri::command]
pub fn recording_save(
    state: State<AppState>,
    raw_path: String,
    dest_dir: String,
    name: String,
) -> Result<RecordingSavePaths, String> {
    let raw_path_buf = PathBuf::from(&raw_path);
    let processed_path_buf = derive_processed_path(&raw_path_buf)?;
    let dest = PathBuf::from(&dest_dir);
    std::fs::create_dir_all(&dest).map_err(|e| format!("create dest dir: {e}"))?;

    let safe_name = sanitize(&name);
    let dest_raw = dest.join(format!("{safe_name}-raw.wav"));
    let dest_processed = dest.join(format!("{safe_name}-tuned.wav"));

    std::fs::copy(&raw_path_buf, &dest_raw).map_err(|e| format!("copy raw: {e}"))?;
    std::fs::copy(&processed_path_buf, &dest_processed)
        .map_err(|e| format!("copy processed: {e}"))?;

    state.controller.lock().recording_save(&raw_path_buf);

    Ok(RecordingSavePaths {
        raw: dest_raw.to_string_lossy().into_owned(),
        processed: dest_processed.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn recording_discard(state: State<AppState>, raw_path: String) -> bool {
    let p = PathBuf::from(&raw_path);
    state.controller.lock().recording_discard(&p)
}

#[derive(serde::Serialize)]
pub struct RecordingSavePaths {
    pub raw: String,
    pub processed: String,
}

fn derive_processed_path(raw_path: &std::path::Path) -> Result<PathBuf, String> {
    let s = raw_path
        .to_str()
        .ok_or_else(|| format!("non-utf8 path: {raw_path:?}"))?;
    let alt = s.replace("-raw.wav", "-processed.wav");
    if alt == s {
        return Err(format!("expected -raw.wav suffix: {s}"));
    }
    Ok(PathBuf::from(alt))
}

fn sanitize(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => out.push(ch),
            ' ' => out.push('-'),
            _ => out.push('_'),
        }
    }
    if out.is_empty() {
        out.push_str("recording");
    }
    out
}
