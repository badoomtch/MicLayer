// Tauri entry point.

mod app_state;
mod commands;
mod diagnostics;
mod hotkeys;
mod profile_commands;
mod profile_store;
mod recording_commands;
mod tray;
mod vbcable_install;
mod wizard;

use tauri::{Manager, WindowEvent};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let combo = format!("{shortcut}");
                    crate::hotkeys::handle_shortcut(app, &combo, event.state());
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            // engine
            commands::app_version,
            commands::engine_list_devices,
            commands::engine_select_input,
            commands::engine_start,
            commands::engine_stop,
            commands::engine_set_muted,
            commands::engine_set_raw,
            commands::engine_snapshot,
            commands::engine_apply_profile,
            commands::engine_current_profile,
            commands::engine_sink_status,
            // profiles
            profile_commands::profile_list,
            profile_commands::profile_get,
            profile_commands::profile_apply,
            profile_commands::profile_save,
            profile_commands::profile_duplicate,
            profile_commands::profile_delete,
            profile_commands::profile_rename,
            profile_commands::profile_set_default,
            profile_commands::profile_import_json,
            profile_commands::profile_export_json,
            profile_commands::profile_import_file,
            profile_commands::profile_export_file,
            // recording
            recording_commands::recording_start,
            recording_commands::recording_stop,
            recording_commands::recording_active,
            recording_commands::recording_save,
            recording_commands::recording_discard,
            // hotkeys
            hotkeys::hotkeys_get,
            hotkeys::hotkeys_set,
            // vb-cable bootstrap
            vbcable_install::vbcable_install,
            // auto-tune wizard
            wizard::wizard_analyze,
            wizard::wizard_synthesize,
            // diagnostics
            diagnostics::diagnostics_snapshot,
            diagnostics::diagnostics_export,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let state = app_state::AppState::new(app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(state);
            tray::build(app.handle())?;
            hotkeys::register_initial(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
