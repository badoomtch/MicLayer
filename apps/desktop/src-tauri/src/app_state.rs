//! Tauri-managed shared state.

use std::sync::Arc;

use miclayer_audio::{EngineController, EngineEvent};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::profile_store::ProfileStore;

pub struct AppState {
    pub controller: Mutex<EngineController>,
    pub store: Arc<ProfileStore>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("could not resolve app data dir: {e}"))?;

        let store = ProfileStore::open(data_dir.clone())
            .map_err(|e| format!("could not open profile store: {e}"))?;
        let store = Arc::new(store);

        let recordings_dir = data_dir.join("recordings");

        let app_for_emit = app.clone();
        let emit = Arc::new(move |event: EngineEvent| {
            if let Err(e) = app_for_emit.emit("engine", &event) {
                tracing::warn!("failed to emit engine event: {e}");
            }
        });

        let mut controller = EngineController::new(emit, recordings_dir);

        let config = store.config_snapshot();
        let initial_id = config
            .active_profile_id
            .clone()
            .or(config.default_profile_id.clone());
        if let Some(id) = initial_id {
            if let Some(profile) = store.find(&id) {
                controller.apply_profile(profile.modules.clone());
            }
        }

        Ok(Self {
            controller: Mutex::new(controller),
            store,
        })
    }
}
