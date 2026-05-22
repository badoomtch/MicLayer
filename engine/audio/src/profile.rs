//! Profile data type. Wraps `ProfileModules` (DSP-relevant settings) with
//! metadata: id, name, author, kind, notes, timestamps.
//!
//! Schema: `packages/shared/schemas/profile.schema.json`.
//! Documentation: `docs/profile-format.md`.

use serde::{Deserialize, Serialize};

use miclayer_dsp::graph::ProfileModules;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProfileKind {
    Builtin,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub kind: ProfileKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    pub modules: ProfileModules,
}

#[derive(Debug, thiserror::Error)]
pub enum ProfileError {
    #[error("schema version {0} is not supported (this build supports {1})")]
    UnsupportedSchemaVersion(u32, u32),
    #[error("profile name is empty")]
    EmptyName,
    #[error("profile id is not a valid UUID")]
    InvalidId,
    #[error("json parse: {0}")]
    Parse(String),
}

impl Profile {
    /// Strict validation beyond what serde already does. Called on every
    /// import and after every load from disk.
    pub fn validate(&self) -> Result<(), ProfileError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(ProfileError::UnsupportedSchemaVersion(
                self.schema_version,
                SCHEMA_VERSION,
            ));
        }
        if self.name.trim().is_empty() {
            return Err(ProfileError::EmptyName);
        }
        if !is_uuid(&self.id) {
            return Err(ProfileError::InvalidId);
        }
        Ok(())
    }

    /// Force the profile to user-kind. Used on import — imported profiles
    /// become user profiles regardless of the on-disk `kind` field, so they
    /// can be edited and deleted.
    pub fn become_user(mut self) -> Self {
        self.kind = ProfileKind::User;
        self
    }

    /// Create a duplicate suitable for a "Duplicate" action: new UUID, new
    /// name, kind = user. Caller passes the new name.
    pub fn duplicate(&self, new_name: String) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            id: new_uuid(),
            name: new_name,
            author: self.author.clone(),
            kind: ProfileKind::User,
            notes: self.notes.clone(),
            created_at: Some(now_iso8601()),
            updated_at: Some(now_iso8601()),
            modules: self.modules.clone(),
        }
    }
}

/// Cheap UUID-v4 shape check. We don't pull the `uuid` crate just for this
/// since the controller already does. Format: 8-4-4-4-12 hex chars.
fn is_uuid(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    for (i, &c) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if c != b'-' {
                    return false;
                }
            }
            _ => {
                if !c.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

pub fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn now_iso8601() -> String {
    // Lightweight — std doesn't ship a formatter, so use a constant-zero
    // offset and a quick manual format. Good enough for cosmetic metadata.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month, day, hh, mm, ss) = decompose(secs as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hh, mm, ss
    )
}

/// Decompose a UTC unix timestamp into Y/M/D h:m:s. Days-since-epoch
/// algorithm from Howard Hinnant.
fn decompose(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86400);
    let time = secs.rem_euclid(86400) as u32;
    let hh = time / 3600;
    let mm = (time % 3600) / 60;
    let ss = time % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32; // [0, 146_096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + (era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    (y, m, d, hh, mm, ss)
}
