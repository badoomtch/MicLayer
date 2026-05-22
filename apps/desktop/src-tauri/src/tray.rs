// Tray icon + menu.
//
// Items today (M4):
//   - Open MicLayer
//   - Profiles submenu (built once at startup from the profile store;
//     dynamic rebuild after add/delete lands later — known limitation,
//     restart to refresh)
//   - Quit
//
// Future: raw/tuned toggle, mute toggle, engine status indicator (M6).

use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::app_state::AppState;

const APPLY_PREFIX: &str = "apply:";
pub const TRAY_ID: &str = "miclayer-tray";

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open MicLayer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit MicLayer", true, None::<&str>)?;

    let profiles_sub = Submenu::new(app, "Profile", true)?;
    let state = app.state::<AppState>();
    for p in state.store.builtins().iter() {
        let item = MenuItem::with_id(
            app,
            format!("{APPLY_PREFIX}{}", p.id),
            p.name.clone(),
            true,
            None::<&str>,
        )?;
        profiles_sub.append(&item)?;
    }
    for p in state.store.users_snapshot().iter() {
        let item = MenuItem::with_id(
            app,
            format!("{APPLY_PREFIX}{}", p.id),
            p.name.clone(),
            true,
            None::<&str>,
        )?;
        profiles_sub.append(&item)?;
    }
    drop(state);

    let menu = Menu::new(app)?;
    menu.append(&open)?;
    menu.append(&profiles_sub)?;
    menu.append(&quit)?;
    Ok(menu)
}

/// Rebuild the tray menu from the current profile store. Called from
/// profile mutation commands so additions/deletions appear without restart.
pub fn refresh_profile_menu(app: &AppHandle) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(()); // tray not built yet (early startup)
    };
    let menu = build_menu(app)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("MicLayer")
        // If `tauri icon` hasn't been run yet, default_window_icon may be
        // None — fall through with no explicit icon and let Tauri use its
        // built-in fallback.
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
            // Empty 1x1 transparent image as a last resort.
            tauri::image::Image::new_owned(vec![0, 0, 0, 0], 1, 1)
        }))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "open" => show_main_window(app),
                "quit" => {
                    app.exit(0);
                }
                other if other.starts_with(APPLY_PREFIX) => {
                    let profile_id = other[APPLY_PREFIX.len()..].to_string();
                    apply_profile_from_tray(app, profile_id);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let visible = win.is_visible().unwrap_or(false);
                    if visible {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn apply_profile_from_tray(app: &AppHandle, profile_id: String) {
    let state = app.state::<AppState>();
    let Some(profile) = state.store.find(&profile_id) else {
        tracing::warn!("tray apply: profile {profile_id} not found");
        return;
    };
    state.controller.lock().apply_profile(profile.modules.clone());
    if let Err(e) = state.store.set_active(Some(profile.id.clone())) {
        tracing::warn!("tray apply: could not persist active profile: {e}");
    }
    if let Err(e) = app.emit("profiles:applied", &profile_id) {
        tracing::warn!("tray apply: emit failed: {e}");
    }
}
