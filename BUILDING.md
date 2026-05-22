# Building MicLayer (dev)

Status: the **full pipeline runs in dev mode**: capture, real DSP chain, profiles, test recorder, VB-CABLE sink, global hotkeys, autostart. Branded driver and installer arrive in later milestones — see [`docs/roadmap.md`](docs/roadmap.md).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Windows | 10 or 11, x64 | Win 11 23H2 is the primary target. |
| Node | ≥ 20 | `node --version`. Use `nvm-windows` if you juggle versions. |
| pnpm | ≥ 9 | `npm i -g pnpm`. |
| Rust | ≥ 1.78 stable | Install from https://rustup.rs/. |
| Microsoft C++ build tools | MSVC 2022 | Required by Rust on Windows. Grab "Desktop development with C++" from Visual Studio Installer. |
| WebView2 runtime | Pre-installed on Win 11; on Win 10 install from Microsoft | Tauri uses this for the WebView. |
| Tauri CLI | bundled — installed via `pnpm install` | No global install required. |

WiX 4 and an EV signing cert are **not** needed for `tauri dev` or `tauri build` to produce an unsigned MSI — only required when you ship Milestone 9.

## First-run

```powershell
# 1. Install JS dependencies for the whole workspace.
pnpm install

# 2. (Optional but recommended) Generate window/tray icons.
#    Drop a 1024x1024 source-icon.png at repo root, then:
pnpm --filter @miclayer/desktop tauri icon ../../source-icon.png

# 3. Run the dev shell.
pnpm tauri dev
```

`pnpm tauri dev` does three things in one:

1. Runs `pnpm dev` inside `apps/desktop`, starting Vite on `http://127.0.0.1:1420`.
2. Builds and runs the Rust backend (`miclayer-tauri`).
3. Opens the MicLayer window pointed at Vite.

Hot-reload for the React side works through Vite. Rust changes require a restart of `tauri dev`.

## What you should see

- A 1100×720 window titled **MicLayer**.
- A left sidebar with **Dashboard / Tune / Profiles / Settings** — clicking navigates.
- A top bar with a Profile picker (10 built-ins + any user profiles).
- A Dashboard with a real device picker, Start/Stop engine, live input + output meters, a Record-test button, and a Virtual microphone status card.
- A Tune page with module cards (gain, high-pass, gate, EQ, compressor, limiter, output gain). Sliders push to the engine on a ~80ms debounce.
- A Profiles page with built-in vs user lists, Apply/Duplicate/Rename/Delete/Export/Import.
- A Settings page with Theme, General (autostart), Virtual microphone status + install link, Hotkeys.
- A tray icon with Open / Profile submenu / Quit. Left-click toggles the window.
- Closing the window with × **hides to tray** — by design.
- Default hotkeys: `Ctrl+Shift+M` mute, `Ctrl+Shift+R` raw/tuned, `Ctrl+Shift+]` next profile, `Ctrl+Shift+[` prev profile, `Ctrl+Shift+L` show/hide.

## Hearing audio in other apps (VB-CABLE)

MicLayer ships with a VB-CABLE bridge in MVP. To actually get your tuned voice into Discord, OBS, Zoom, etc.:

1. Install **VB-CABLE** from <https://vb-audio.com/Cable/> (free, donationware, Windows-only).
2. Restart MicLayer. The Dashboard's Virtual microphone card will show "Audio is flowing to CABLE Output (VB-Audio Virtual Cable)".
3. In Discord (or wherever), set your mic to **CABLE Output (VB-Audio Virtual Cable)**.

If VB-CABLE is missing, MicLayer still captures + meters but no audio reaches other apps. The Dashboard surfaces that with a link to the download page.

## Building an MSI

```powershell
pnpm tauri build
```

Produces `apps/desktop/src-tauri/target/release/bundle/msi/MicLayer_<version>_x64_en-US.msi`. It's **unsigned**. To ship, sign with `signtool` and an EV cert before distribution (Milestone 9 task).

## Common failures

| Symptom | Cause / fix |
|---|---|
| `error: linker `link.exe` not found` | Install MSVC 2022 build tools. |
| `WebView2Loader.dll missing` | Install the Microsoft WebView2 runtime. Should be present on Win 11. |
| Tray icon doesn't appear | You haven't generated icons yet. See [`apps/desktop/src-tauri/icons/README.md`](apps/desktop/src-tauri/icons/README.md). |
| `pnpm tauri dev` rebuilds the Rust crate on every JS change | Restart only when Rust changes. Vite hot-reload is fine for JS/TS. |
| Window closes the whole app instead of hiding to tray | Bug — file an issue. The close-handler lives in `apps/desktop/src-tauri/src/lib.rs`. |

## Engine work (later milestones)

You do **not** need cpal, the DSP crates, or `nnnoiseless` to build the shell today. They will start compiling automatically when Milestone 2 lands and the audio engine is wired up. Until then the engine crates are scaffolding-only.

If your IDE complains about unused dependencies in `Cargo.toml` — it's correct, the deps are pre-declared so Milestone 2 doesn't churn the manifests.
