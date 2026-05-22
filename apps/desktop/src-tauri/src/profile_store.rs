//! Profile and config persistence.
//!
//! Layout under `%APPDATA%\MicLayer\`:
//!   config.json              -- app preferences (default profile id, ...)
//!   profiles\<id>.json       -- user profiles (built-ins are embedded in the binary)
//!
//! Built-ins are loaded from compiled-in bytes via `include_str!`. Users
//! cannot edit them in place — only duplicate to a user profile.

use std::fs;
use std::path::{Path, PathBuf};

use miclayer_audio::{Profile, ProfileError, ProfileKind};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

const BUILTIN_SOURCES: &[(&str, &str)] = &[
    ("natural", include_str!("../../../../profiles/natural.json")),
    ("streaming", include_str!("../../../../profiles/streaming.json")),
    ("podcast", include_str!("../../../../profiles/podcast.json")),
    ("voiceover", include_str!("../../../../profiles/voiceover.json")),
    ("discord", include_str!("../../../../profiles/discord.json")),
    ("noisy-room", include_str!("../../../../profiles/noisy-room.json")),
    ("late-night", include_str!("../../../../profiles/late-night.json")),
    ("headset-rescue", include_str!("../../../../profiles/headset-rescue.json")),
    ("laptop-mic-rescue", include_str!("../../../../profiles/laptop-mic-rescue.json")),
    ("radio-style", include_str!("../../../../profiles/radio-style.json")),
];

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("profile: {0}")]
    Profile(#[from] ProfileError),
    #[error("built-in profile cannot be modified")]
    BuiltinReadOnly,
    #[error("profile not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub default_profile_id: Option<String>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
}

pub struct ProfileStore {
    data_dir: PathBuf,
    builtins: Vec<Profile>,
    /// Cached user profiles, refreshed on `reload_users()`.
    users: Mutex<Vec<Profile>>,
    config: Mutex<AppConfig>,
}

impl ProfileStore {
    /// Build the store and ensure `data_dir` and its `profiles\` subdirectory exist.
    /// `data_dir` is typically `%APPDATA%\MicLayer`.
    pub fn open(data_dir: PathBuf) -> Result<Self, StoreError> {
        fs::create_dir_all(&data_dir)?;
        fs::create_dir_all(data_dir.join("profiles"))?;

        let builtins = parse_builtins();

        let config = load_config(&data_dir).unwrap_or_default();

        let store = Self {
            data_dir,
            builtins,
            users: Mutex::new(Vec::new()),
            config: Mutex::new(config),
        };
        store.reload_users()?;
        Ok(store)
    }

    pub fn builtins(&self) -> &[Profile] {
        &self.builtins
    }

    pub fn users_snapshot(&self) -> Vec<Profile> {
        self.users.lock().clone()
    }

    pub fn config_snapshot(&self) -> AppConfig {
        self.config.lock().clone()
    }

    pub fn list_all(&self) -> Vec<Profile> {
        let mut out = Vec::with_capacity(self.builtins.len() + self.users.lock().len());
        out.extend(self.builtins.iter().cloned());
        out.extend(self.users.lock().iter().cloned());
        out
    }

    pub fn find(&self, id: &str) -> Option<Profile> {
        self.builtins
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .or_else(|| self.users.lock().iter().find(|p| p.id == id).cloned())
    }

    /// Save a user profile to disk, replacing any existing file with the
    /// same id. Built-in IDs are rejected.
    pub fn save_user(&self, mut profile: Profile) -> Result<Profile, StoreError> {
        if self.builtins.iter().any(|b| b.id == profile.id) {
            return Err(StoreError::BuiltinReadOnly);
        }
        profile.kind = ProfileKind::User;
        profile.updated_at = Some(miclayer_audio::profile::now_iso8601());
        profile.validate()?;

        let path = self.user_path(&profile.id);
        let json = serde_json::to_string_pretty(&profile)?;
        fs::write(&path, json)?;

        self.reload_users()?;
        Ok(profile)
    }

    pub fn delete_user(&self, id: &str) -> Result<(), StoreError> {
        if self.builtins.iter().any(|b| b.id == id) {
            return Err(StoreError::BuiltinReadOnly);
        }
        let path = self.user_path(id);
        if !path.exists() {
            return Err(StoreError::NotFound(id.to_string()));
        }
        fs::remove_file(&path)?;
        self.reload_users()?;

        // If the deleted profile was the default or active, clear those.
        let mut config = self.config.lock();
        let mut changed = false;
        if config.default_profile_id.as_deref() == Some(id) {
            config.default_profile_id = None;
            changed = true;
        }
        if config.active_profile_id.as_deref() == Some(id) {
            config.active_profile_id = None;
            changed = true;
        }
        if changed {
            let snapshot = config.clone();
            drop(config);
            save_config(&self.data_dir, &snapshot)?;
        }
        Ok(())
    }

    pub fn set_default(&self, id: Option<String>) -> Result<(), StoreError> {
        if let Some(ref real_id) = id {
            if self.find(real_id).is_none() {
                return Err(StoreError::NotFound(real_id.clone()));
            }
        }
        let mut config = self.config.lock();
        config.default_profile_id = id;
        let snapshot = config.clone();
        drop(config);
        save_config(&self.data_dir, &snapshot)?;
        Ok(())
    }

    pub fn set_active(&self, id: Option<String>) -> Result<(), StoreError> {
        if let Some(ref real_id) = id {
            if self.find(real_id).is_none() {
                return Err(StoreError::NotFound(real_id.clone()));
            }
        }
        let mut config = self.config.lock();
        config.active_profile_id = id;
        let snapshot = config.clone();
        drop(config);
        save_config(&self.data_dir, &snapshot)?;
        Ok(())
    }

    fn user_path(&self, id: &str) -> PathBuf {
        self.data_dir.join("profiles").join(format!("{id}.json"))
    }

    fn reload_users(&self) -> Result<(), StoreError> {
        let dir = self.data_dir.join("profiles");
        let mut loaded = Vec::new();
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            match load_profile_from(&path) {
                Ok(p) => {
                    // On-disk profiles are always user-kind regardless of
                    // what their JSON says.
                    let p = p.become_user();
                    loaded.push(p);
                }
                Err(e) => {
                    tracing::warn!("skipping invalid profile {:?}: {}", path, e);
                }
            }
        }
        loaded.sort_by(|a, b| a.name.cmp(&b.name));
        *self.users.lock() = loaded;
        Ok(())
    }
}

fn parse_builtins() -> Vec<Profile> {
    BUILTIN_SOURCES
        .iter()
        .filter_map(|(slug, src)| match serde_json::from_str::<Profile>(src) {
            Ok(mut p) => {
                p.kind = ProfileKind::Builtin;
                Some(p)
            }
            Err(e) => {
                tracing::error!("built-in profile {slug} failed to parse: {e}");
                None
            }
        })
        .collect()
}

fn load_profile_from(path: &Path) -> Result<Profile, StoreError> {
    let bytes = fs::read(path)?;
    let p: Profile = serde_json::from_slice(&bytes)?;
    p.validate()?;
    Ok(p)
}

fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("config.json")
}

fn load_config(data_dir: &Path) -> Option<AppConfig> {
    let bytes = fs::read(config_path(data_dir)).ok()?;
    serde_json::from_slice::<AppConfig>(&bytes).ok()
}

fn save_config(data_dir: &Path, config: &AppConfig) -> Result<(), StoreError> {
    let json = serde_json::to_string_pretty(config)?;
    fs::write(config_path(data_dir), json)?;
    Ok(())
}
