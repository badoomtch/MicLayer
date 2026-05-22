# installer/

WiX 4 MSI scripts for MicLayer.

**Status:** SCAFFOLD — Milestone 9.

When implemented, this directory contains:

- `MicLayer.wxs` — top-level MSI definition.
- `Driver.wxs` — driver install/repair/uninstall fragment (v1.0+, after the branded WDM driver is built).
- `Vars.wxi` — version + GUID variables shared with Tauri's MSI build.
- `build.ps1` — wrapper around `tauri build` + WiX harvest.

See [`../docs/architecture.md`](../docs/architecture.md) §9 and [`../docs/roadmap.md`](../docs/roadmap.md) Milestone 9.
