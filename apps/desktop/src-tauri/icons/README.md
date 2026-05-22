# Icons

This folder is intentionally empty in the scaffold. Before you can run
`pnpm tauri build` (or get a proper window/tray icon in `pnpm tauri dev`), you
need to generate the icon set from a source image.

## Generating from a source

Drop a 1024×1024 PNG of the MicLayer logo at the repository root as
`source-icon.png`, then run:

```powershell
pnpm --filter @miclayer/desktop tauri icon ../../source-icon.png
```

This writes the full Windows + macOS + Linux icon set into this folder:

```
32x32.png
128x128.png
128x128@2x.png
icon.ico
icon.icns
StoreLogo.png
Square*.png
```

`tauri.conf.json` already references the Windows-relevant ones.

## Until then

`pnpm tauri dev` still launches — the window and tray fall back to Tauri's
default icon. Don't ship a build without generating the real set.

## Logo

A finished logo is **not** in scope for this scaffold session. The icon design
is tracked alongside the v0.1 milestone in `docs/roadmap.md`.
