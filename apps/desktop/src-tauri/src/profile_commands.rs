//! Tauri commands for profile CRUD.

use miclayer_audio::{Profile, ProfileKind};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::app_state::AppState;
use crate::profile_store::AppConfig;
use crate::tray;

#[derive(Debug, Serialize)]
pub struct ProfileListing {
    pub builtins: Vec<Profile>,
    pub users: Vec<Profile>,
    pub config: AppConfig,
}

#[tauri::command]
pub fn profile_list(state: State<AppState>) -> ProfileListing {
    ProfileListing {
        builtins: state.store.builtins().to_vec(),
        users: state.store.users_snapshot(),
        config: state.store.config_snapshot(),
    }
}

#[tauri::command]
pub fn profile_get(state: State<AppState>, id: String) -> Result<Profile, String> {
    state
        .store
        .find(&id)
        .ok_or_else(|| format!("profile not found: {id}"))
}

/// Apply a profile's modules to the engine and mark it active. Does NOT
/// reset the user's in-memory editor state on the JS side — the UI is
/// responsible for resyncing its store.
#[tauri::command]
pub fn profile_apply(state: State<AppState>, id: String) -> Result<Profile, String> {
    let profile = state
        .store
        .find(&id)
        .ok_or_else(|| format!("profile not found: {id}"))?;
    state.controller.lock().apply_profile(profile.modules.clone());
    state
        .store
        .set_active(Some(profile.id.clone()))
        .map_err(|e| e.to_string())?;
    Ok(profile)
}

/// Save a user profile (create or update). Built-in IDs are rejected.
#[tauri::command]
pub fn profile_save(
    app: AppHandle,
    state: State<AppState>,
    profile: Profile,
) -> Result<Profile, String> {
    let saved = state
        .store
        .save_user(profile)
        .map_err(|e| e.to_string())?;
    let _ = tray::refresh_profile_menu(&app);
    Ok(saved)
}

/// Create a new user profile from an existing one, with a fresh id + name.
/// `from_id` may reference a built-in or user profile.
#[tauri::command]
pub fn profile_duplicate(
    app: AppHandle,
    state: State<AppState>,
    from_id: String,
    new_name: String,
) -> Result<Profile, String> {
    let src = state
        .store
        .find(&from_id)
        .ok_or_else(|| format!("profile not found: {from_id}"))?;
    let dup = src.duplicate(new_name);
    let saved = state.store.save_user(dup).map_err(|e| e.to_string())?;
    let _ = tray::refresh_profile_menu(&app);
    Ok(saved)
}

#[tauri::command]
pub fn profile_delete(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    state.store.delete_user(&id).map_err(|e| e.to_string())?;
    let _ = tray::refresh_profile_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn profile_rename(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    new_name: String,
) -> Result<Profile, String> {
    let mut profile = state
        .store
        .find(&id)
        .ok_or_else(|| format!("profile not found: {id}"))?;
    if profile.kind == ProfileKind::Builtin {
        return Err("built-in profiles cannot be renamed (duplicate first)".into());
    }
    profile.name = new_name;
    let saved = state
        .store
        .save_user(profile)
        .map_err(|e| e.to_string())?;
    let _ = tray::refresh_profile_menu(&app);
    Ok(saved)
}

#[tauri::command]
pub fn profile_set_default(
    state: State<AppState>,
    id: Option<String>,
) -> Result<(), String> {
    state.store.set_default(id).map_err(|e| e.to_string())
}

/// Import a profile from raw JSON text. Always becomes a user profile.
/// Returns the saved profile (with a freshly-allocated id if the original
/// id collided with an existing built-in or user profile).
#[tauri::command]
pub fn profile_import_json(
    app: AppHandle,
    state: State<AppState>,
    json: String,
) -> Result<Profile, String> {
    let mut profile: Profile =
        serde_json::from_str(&json).map_err(|e| format!("could not parse: {e}"))?;
    profile.validate().map_err(|e| e.to_string())?;
    profile.kind = ProfileKind::User;

    // Avoid id collisions with built-ins or existing user profiles.
    if state.store.find(&profile.id).is_some() {
        profile.id = miclayer_audio::profile::new_uuid();
    }

    let saved = state
        .store
        .save_user(profile)
        .map_err(|e| e.to_string())?;
    let _ = tray::refresh_profile_menu(&app);
    Ok(saved)
}

/// Export a profile to JSON text. The caller (frontend) can use this to
/// inspect or copy to clipboard.
#[tauri::command]
pub fn profile_export_json(
    state: State<AppState>,
    id: String,
) -> Result<String, String> {
    let profile = state
        .store
        .find(&id)
        .ok_or_else(|| format!("profile not found: {id}"))?;
    serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())
}

/// Read a JSON file from an absolute path (typically returned by the
/// dialog plugin) and import it.
#[tauri::command]
pub fn profile_import_file(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<Profile, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("could not read {path}: {e}"))?;
    let json = String::from_utf8(bytes).map_err(|e| format!("not utf-8: {e}"))?;
    profile_import_json(app, state, json)
}

/// Write a profile to an absolute path as JSON.
#[tauri::command]
pub fn profile_export_file(
    state: State<AppState>,
    id: String,
    path: String,
) -> Result<(), String> {
    let profile = state
        .store
        .find(&id)
        .ok_or_else(|| format!("profile not found: {id}"))?;
    let json = serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("could not write {path}: {e}"))?;
    Ok(())
}
