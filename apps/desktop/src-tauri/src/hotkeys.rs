//! Global hotkeys (M6).
//!
//! Defaults match docs/ui-plan.md §7.4. The user can rebind via the
//! Settings UI; rebind reregisters with `tauri-plugin-global-shortcut`.
//!
//! Push-to-mute (hold) is **not** implemented yet — the plugin gives a
//! fire-on-press signal, not a separate release. A proper hold-mode
//! would need a low-level keyboard hook; that's a follow-up.

use std::collections::HashMap;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::app_state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyMap {
    pub mute_toggle: Option<String>,
    pub raw_toggle: Option<String>,
    pub next_profile: Option<String>,
    pub prev_profile: Option<String>,
    pub show_hide: Option<String>,
}

impl Default for HotkeyMap {
    fn default() -> Self {
        Self {
            mute_toggle: Some("CmdOrCtrl+Shift+M".into()),
            raw_toggle: Some("CmdOrCtrl+Shift+R".into()),
            next_profile: Some("CmdOrCtrl+Shift+BracketRight".into()),
            prev_profile: Some("CmdOrCtrl+Shift+BracketLeft".into()),
            show_hide: Some("CmdOrCtrl+Shift+L".into()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Action {
    MuteToggle,
    RawToggle,
    NextProfile,
    PrevProfile,
    ShowHide,
}

#[derive(Default)]
pub struct HotkeyState {
    pub map: Mutex<HotkeyMap>,
    pub routes: Mutex<HashMap<String, Action>>,
}

pub fn register_initial<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    app.manage(HotkeyState::default());
    let initial = app.state::<HotkeyState>().map.lock().clone();
    apply(app, &initial);
    Ok(())
}

#[tauri::command]
pub fn hotkeys_get(app: AppHandle) -> HotkeyMap {
    app.state::<HotkeyState>().map.lock().clone()
}

#[tauri::command]
pub fn hotkeys_set(app: AppHandle, map: HotkeyMap) -> Result<(), String> {
    apply(&app, &map);
    *app.state::<HotkeyState>().map.lock() = map;
    Ok(())
}

fn apply<R: Runtime>(app: &AppHandle<R>, map: &HotkeyMap) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let mut routes: HashMap<String, Action> = HashMap::new();
    let entries: [(Option<&str>, Action); 5] = [
        (map.mute_toggle.as_deref(), Action::MuteToggle),
        (map.raw_toggle.as_deref(), Action::RawToggle),
        (map.next_profile.as_deref(), Action::NextProfile),
        (map.prev_profile.as_deref(), Action::PrevProfile),
        (map.show_hide.as_deref(), Action::ShowHide),
    ];

    for (combo, action) in entries {
        let Some(c) = combo else { continue };
        if c.trim().is_empty() {
            continue;
        }
        match gs.register(c) {
            Ok(()) => {
                routes.insert(c.to_string(), action);
            }
            Err(e) => tracing::warn!("hotkey register failed for {c}: {e}"),
        }
    }

    *app.state::<HotkeyState>().routes.lock() = routes;
}

/// Dispatched from the plugin's global handler (registered at plugin
/// init time). Looks up the action by accelerator string and invokes it.
pub fn handle_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    accelerator: &str,
    state: ShortcutState,
) {
    if state != ShortcutState::Pressed {
        return;
    }
    let action = {
        let state = app.state::<HotkeyState>();
        let routes = state.routes.lock();
        routes.get(accelerator).copied()
    };
    if let Some(a) = action {
        invoke_action(app, a);
    }
}

fn invoke_action<R: Runtime>(app: &AppHandle<R>, action: Action) {
    let state = app.state::<AppState>();
    match action {
        Action::MuteToggle => {
            let c = state.controller.lock();
            let now = !c.muted();
            c.set_muted(now);
            let _ = app.emit("hotkey:muted", now);
        }
        Action::RawToggle => {
            let c = state.controller.lock();
            let now = !c.raw();
            c.set_raw(now);
            let _ = app.emit("hotkey:raw", now);
        }
        Action::NextProfile => switch_profile(app, 1),
        Action::PrevProfile => switch_profile(app, -1),
        Action::ShowHide => {
            if let Some(win) = app.get_webview_window("main") {
                if win.is_visible().unwrap_or(false) {
                    let _ = win.hide();
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        }
    }
}

fn switch_profile<R: Runtime>(app: &AppHandle<R>, delta: i32) {
    let state = app.state::<AppState>();
    let mut profiles: Vec<miclayer_audio::Profile> = state.store.builtins().to_vec();
    profiles.extend(state.store.users_snapshot());
    if profiles.is_empty() {
        return;
    }

    let active = state.store.config_snapshot().active_profile_id;
    let current_idx = active
        .as_ref()
        .and_then(|id| profiles.iter().position(|p| &p.id == id))
        .unwrap_or(0) as i32;

    let n = profiles.len() as i32;
    let next_idx = ((current_idx + delta) % n + n) % n;
    let next = &profiles[next_idx as usize];

    state.controller.lock().apply_profile(next.modules.clone());
    let _ = state.store.set_active(Some(next.id.clone()));
    let _ = app.emit("profiles:applied", &next.id);
}
