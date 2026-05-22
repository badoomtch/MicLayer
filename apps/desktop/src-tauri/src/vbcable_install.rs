//! VB-CABLE bootstrap installer.
//!
//! Why this exists: VB-Audio's licence restricts redistribution, so we
//! cannot bundle VB-CABLE files inside the MicLayer MSI. We can, however,
//! orchestrate the user's machine to download the *official* VB-CABLE
//! installer from VB-Audio's CDN and run it. That's what this module does.
//!
//! User flow:
//!   1. Click "Install VB-CABLE" in the app.
//!   2. We download the official ZIP to a temp dir.
//!   3. Extract `VBCABLE_Setup_x64.exe`.
//!   4. Run it with `-i` to install. (Note: VB-Audio's installer does
//!      require user confirmation in its UI; we elevate via Windows UAC
//!      automatically because the manifest requests admin.)
//!   5. On success, a reboot is typically required before the driver loads.
//!
//! Network failures, anti-virus blocks, and user cancellation all return
//! a structured error the UI surfaces in plain English.

use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri::State;

use crate::app_state::AppState;

/// Official VB-Audio download URL for the CABLE driver pack.
/// As of late-2025, version 1.0.3.8 is current. The URL is stable across
/// recent point releases; if VB-Audio ever changes their CDN scheme this
/// will need updating.
const VB_CABLE_ZIP_URL: &str =
    "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstallStage {
    Downloading,
    Extracting,
    Installing,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub stage: InstallStage,
    /// 0–100 for Downloading, ignored otherwise.
    pub percent: u32,
    pub message: String,
}

fn emit(app: &AppHandle, p: InstallProgress) {
    let _ = app.emit("vbcable:progress", &p);
}

/// Kick off the install. We hand the work off to a blocking task so the
/// IPC thread isn't held for download + installer-wait time.
#[tauri::command]
pub async fn vbcable_install(app: AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_blocking(app_clone))
        .await
        .map_err(|e| format!("join: {e}"))?
}

fn install_blocking(app: AppHandle) -> Result<(), String> {
    let tmp = std::env::temp_dir().join("miclayer-vbcable");
    if let Err(e) = std::fs::create_dir_all(&tmp) {
        let msg = format!("Could not create temp dir: {e}");
        emit(&app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }

    let zip_path = tmp.join("VBCABLE_Driver_Pack43.zip");

    // 1. Download
    emit(&app, InstallProgress {
        stage: InstallStage::Downloading,
        percent: 0,
        message: "Downloading VB-CABLE from VB-Audio…".into(),
    });
    if let Err(e) = download(VB_CABLE_ZIP_URL, &zip_path, &app) {
        let msg = format!("Download failed: {e}");
        emit(&app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }

    // 2. Extract
    emit(&app, InstallProgress {
        stage: InstallStage::Extracting,
        percent: 0,
        message: "Extracting installer…".into(),
    });
    let extract_dir = tmp.join("extracted");
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    if let Err(e) = std::fs::create_dir_all(&extract_dir) {
        let msg = format!("Could not create extract dir: {e}");
        emit(&app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }
    if let Err(e) = extract_zip(&zip_path, &extract_dir) {
        let msg = format!("Could not extract installer: {e}");
        emit(&app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }

    let installer_exe = extract_dir.join("VBCABLE_Setup_x64.exe");
    if !installer_exe.exists() {
        // Some zip releases nest one folder deep; try to find it.
        if let Some(found) = find_setup(&extract_dir) {
            return launch_installer(&found, &app);
        }
        let msg = "VBCABLE_Setup_x64.exe not found in the downloaded ZIP. The VB-Audio package layout may have changed.".to_string();
        emit(&app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }

    launch_installer(&installer_exe, &app)
}

fn launch_installer(exe: &std::path::Path, app: &AppHandle) -> Result<(), String> {
    emit(app, InstallProgress {
        stage: InstallStage::Installing,
        percent: 0,
        message: "Running VB-CABLE installer (Windows will ask for permission)…".into(),
    });

    // VB-CABLE_Setup_x64.exe requires admin. A plain `Command::spawn`
    // from our non-elevated process can't trigger UAC properly, so we
    // use ShellExecuteExW with the `runas` verb via the `runas` crate.
    // This pops the standard Windows UAC dialog and waits for the
    // installer to finish.
    let status = runas::Command::new(exe)
        .arg("-i")
        .status()
        .map_err(|e| {
            format!(
                "Could not launch the VB-CABLE installer with admin rights: {e}. \
                 You may need to install VB-CABLE manually."
            )
        })?;

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        let msg = format!(
            "The VB-CABLE installer exited with code {code}. \
             It may have been cancelled at the Windows UAC prompt, or you may need to retry."
        );
        emit(app, InstallProgress { stage: InstallStage::Failed, percent: 0, message: msg.clone() });
        return Err(msg);
    }

    emit(app, InstallProgress {
        stage: InstallStage::Done,
        percent: 100,
        message: "VB-CABLE installed. A Windows restart is usually required before the driver loads."
            .into(),
    });
    Ok(())
}

fn find_setup(dir: &std::path::Path) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_file()
            && path.file_name().and_then(|n| n.to_str())
                == Some("VBCABLE_Setup_x64.exe")
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_setup(&path) {
                return Some(found);
            }
        }
    }
    None
}

fn download(url: &str, dest: &std::path::Path, app: &AppHandle) -> Result<(), String> {
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(30))
        .call()
        .map_err(|e| e.to_string())?;

    let total_len: Option<u64> = response
        .header("content-length")
        .and_then(|s| s.parse().ok());

    let mut reader = response.into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut buf = vec![0u8; 64 * 1024];
    let mut written: u64 = 0;
    let mut last_emit_pct: i32 = -1;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        written += n as u64;
        if let Some(total) = total_len {
            let pct = ((written as f64 / total as f64) * 100.0) as i32;
            if pct != last_emit_pct {
                emit(app, InstallProgress {
                    stage: InstallStage::Downloading,
                    percent: pct.max(0) as u32,
                    message: format!("Downloading… {pct}%"),
                });
                last_emit_pct = pct;
            }
        }
    }
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_zip(zip_path: &std::path::Path, out_dir: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = file.enclosed_name() else { continue };
        let dest_path = out_dir.join(rel);
        if file.is_dir() {
            std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
