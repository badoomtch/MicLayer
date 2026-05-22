# MicLayer — UI / UX Plan

This document is the spec for the React app under `apps/desktop/src/`. Implementation tickets reference sections by number.

## 1. Design philosophy

- **Calm.** Slow animations, no jiggle, no shake. Meters tick at 30 Hz, not 60 Hz with motion blur.
- **Trustworthy.** Like a creator-studio utility, not a gamer dashboard. No RGB, no fake holograms, no chevrons that don't mean anything.
- **Generous spacing.** ~24 px gutters between sections, ~16 px between related controls, ~8 px between label and input.
- **Two reading levels.** Beginner sees simple sliders; the same screen has an "Advanced" toggle that reveals real DSP parameters. Same screen — not a separate tab.
- **Honest.** Disabled controls explain *why* they're disabled. Errors say what to do.

## 2. Layout shell

```
+---------------------------------------------------------------+
|  ☰  MicLayer            Profile: Streaming ▼      [—] [×]     |  ← Window chrome (custom)
+--+------------------------------------------------------------+
|  | Dashboard                                                  |
|  +-----------------------------+                              |
|  |Tune                         |   <main content area>        |
|  +-----------------------------+                              |
|  |Profiles                     |                              |
|  +-----------------------------+                              |
|  |Settings                     |                              |
|  +-----------------------------+                              |
|  |                             |                              |
|  | [Raw / Tuned toggle]        |                              |
|  | [Mute]                      |                              |
|  | Status: ● Processing        |                              |
+--+-----------------------------+------------------------------+
```

- Left rail: four sections (Dashboard, Tune, Profiles, Settings) + a persistent footer with Raw/Tuned and Mute.
- Top bar: profile picker (also lets you switch profiles), window-chrome controls. Tray icon mirrors this profile picker.
- Content area: scrolls if needed.

Window minimum: 1024 × 640. Maximum: none.

## 3. Themes

Three themes plus "match system":

| Theme | Background | Surface | Text | Accent |
|---|---|---|---|---|
| Dark | `#101113` | `#181a1d` | `#e6e8eb` | `#7aa2f7` |
| Medium | `#1e2127` | `#272a31` | `#dfe2e7` | `#7aa2f7` |
| Light | `#f7f8fa` | `#ffffff` | `#1c1f24` | `#3b6bd1` |

Accent is intentionally restrained — a single muted blue. Meters use muted greens (in-range), amber (loud), red (clipping). No neon.

Tokens live in `apps/desktop/src/theme/tokens.ts`. Tailwind config picks them up via CSS variables.

## 4. Section: Dashboard

Default landing screen. Designed so a non-audio person sees "things are happening, here are the simple controls".

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Input: USB Microphone (Logitech)    ▼     │  Virtual mic:  │
│                                            │  ● Connected   │
│  ┌─ Input level ──────────────────────┐    │                │
│  │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮·······   peak hold │    │  Profile:      │
│  │  noise floor: -52 dB              │    │  Streaming ▼   │
│  └────────────────────────────────────┘    │                │
│                                            │  [Setup wizard]│
│  ┌─ Output level ─────────────────────┐    │                │
│  │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮·······             │    │                │
│  └────────────────────────────────────┘    │                │
│                                            │                │
│  Quick controls                                              │
│  Clean Up      ──────●────────  35%                          │
│  Warmth        ────●──────────  20%                          │
│  Clarity       ──────────●────  60%                          │
│  Noise Cut     ────────●──────  50%                          │
│  Loudness      ──────●────────  30%                          │
│  Sibilance     ──●────────────  10%                          │
│  Output Level  ────────●──────  50%                          │
│                                                              │
│  [ Record test ]   [ Open Tune → ]                           │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Components

| Component | Notes |
|---|---|
| `DeviceSelector` | Dropdown of input devices. Shows current Windows default with a star. Refreshes on hotplug events from the engine. |
| `LevelMeter` | Peak bar with optional RMS overlay. Colour zones: green to -12 dB, amber to -3 dB, red above. Peak hold for ~1 s. |
| `NoiseFloorIndicator` | Numerical dB value, derived from engine `meters.noise_floor_db`. |
| `VirtualMicStatus` | Pill that says `Connected` / `Backend missing` / `Repair required`. Click → opens Settings → Virtual Microphone. |
| `ProfilePicker` | Same component used in the top bar. Single source of truth. |
| `QuickSliders` | Seven sliders, each maps to one or more DSP params. Behind the scenes, dragging "Warmth" updates the EQ band 1 gain. Marked clearly: changing a quick slider is **the same as** changing the underlying advanced control. |
| `RecordTestButton` | Records 5-15 s and opens the A/B compare modal. |
| `SetupWizardButton` | Opens the wizard. |

### 4.3 Data flow

- `engine.meters` events update level meters.
- `engine.device` events refresh device selector.
- `engine.status` events update virtual mic pill.
- Slider drag → debounced (50 ms) → `engine_set_module_params` command for the relevant module.

## 5. Section: Tune

Power-user view of the chain. Shows the modules as a vertical stack of cards, each with a simple-mode summary at top and an "Advanced" expander below.

### 5.1 Layout

```
┌─ Input gain ──────────────────────────── [●] enabled ────────┐
│  Gain        ──●──────────────  +2 dB                        │
└──────────────────────────────────────────────────────────────┘
┌─ High-pass ─────────────────────────────── [●] enabled ──────┐
│  Mode    [ Off ][ Low ][●Med][ Strong ]                      │
│  ▾ Advanced                                                  │
│      Cutoff       80 Hz   ──●─────────                       │
│      Order        2nd  ▼                                     │
└──────────────────────────────────────────────────────────────┘
┌─ Noise suppression ─────────────────────── [○] disabled ─────┐
│  Amount  [ Off ][●Low ][ Med ][ High ]                       │
└──────────────────────────────────────────────────────────────┘
... gate, EQ (with curve viz), compressor, de-esser, limiter, output gain
```

### 5.2 Components

| Component | Notes |
|---|---|
| `ModuleCard` | Generic card with header (enable toggle, name), simple-mode controls, advanced expander. |
| `SegmentedToggle` | "Off / Low / Med / High" style. Touch-friendly. |
| `EqCurveView` | Drawn with `<canvas>`; renders the magnitude response of the active bands. Click a band → it becomes selected; drag in the curve area → adjust freq/gain of selected band. |
| `BandList` | Below the curve, a table of bands with type / freq / gain / Q. |
| `CompressorVisualizer` | Optional small reduction-meter (post-MVP). |

### 5.3 "Advanced" disclosure

Each module's `▾ Advanced` toggle is per-card and remembered in local state (not persisted — every session starts collapsed unless the user has set a "Show advanced by default" setting).

## 6. Section: Profiles

```
┌─ Profiles ───────────────────────────────────────────────────┐
│ Built-in                              [Import] [+ New profile]│
│  ● Streaming           (active)                              │
│  ○ Natural                                                    │
│  ○ Podcast                                                    │
│  ○ Voiceover                                                  │
│  ○ Discord                                                    │
│  ○ Noisy Room                                                 │
│  ○ Late Night                                                 │
│  ○ Headset Rescue                                             │
│  ○ Laptop Mic Rescue                                          │
│  ○ Radio Style                                                │
│                                                              │
│ Your profiles                                                │
│  ○ Coffee Shop      ★ default                                │
│                                                              │
│ Selected: Streaming                                          │
│   Author: MicLayer                                           │
│   Notes: For Twitch / YouTube live with a condenser mic.    │
│                                                              │
│   [Use this profile]  [Duplicate]  [Export]                  │
└──────────────────────────────────────────────────────────────┘
```

| Component | Notes |
|---|---|
| `ProfileList` | Built-in vs user-created sections. Star marks default. Right-click for rename/delete (user only). |
| `ProfileDetails` | Right-side panel showing metadata and actions. |
| `ProfileEditorForm` | Inline rename, set as default, edit notes. |
| `ImportDialog` | File picker → validate against schema → preview → confirm import. |
| `ExportDialog` | Default to `Downloads/<profile-name>.miclayer.json`. |

Built-in profiles are read-only; the UI lets users "Duplicate" them to edit.

## 7. Section: Settings

Single scrollable page with grouped sections:

### 7.1 General
- Theme picker (Dark / Medium / Light / System)
- Start with Windows (toggle)
- Start minimised to tray (toggle)
- Keep processing when window closed (toggle, default on)
- Show advanced controls by default (toggle, default off)

### 7.2 Audio
- Default input device (picker)
- Buffer size / latency mode: `Stable (20 ms)`, `Balanced (10 ms)`, `Low-latency exclusive (5 ms)`. The last shows a warning that exclusive mode locks the device.
- Sample rate (auto by default, override for advanced)

### 7.3 Virtual microphone
- Status pill (Connected / Missing / Wrong version)
- Active backend (VB-CABLE / MicLayer driver)
- "Install / Repair backend" button
- "Set MicLayer Microphone as Windows default communications input" button (writes to Sound Settings via documented API)

### 7.4 Hotkeys
- Each hotkey row: label, current binding, "Record new" button, conflict warning.
- Defaults:
  - Mute toggle: `Ctrl+Shift+M`
  - Push-to-mute (hold): `Ctrl+Shift+,`
  - Raw/Tuned toggle: `Ctrl+Shift+R`
  - Next profile: `Ctrl+Shift+]`
  - Prev profile: `Ctrl+Shift+[`
  - Show/hide MicLayer: `Ctrl+Shift+L`

### 7.5 Updates
- Check for updates on startup (toggle, default off)
- "Check now" button
- Channel: Stable only in v1.

### 7.6 Diagnostics
- Live engine status (collapsible technical details)
- "Export diagnostic bundle" button
  - Checkbox "Include last test recording (audio)" — default off
- "View log folder" link

### 7.7 About
- Version
- Open-source licences (a button that lists all third-party packages with their licences)
- Privacy statement (excerpt + link to in-app full page)
- GitHub link

## 8. First-run onboarding

A modal flow (full-screen overlay, not a wizard sidebar) shown the first time MicLayer launches:

1. **Welcome.** "MicLayer makes your microphone sound better in every app you use. It runs locally — your voice never leaves your computer."
2. **Pick your mic.** Device picker; "Use Windows default" is preselected.
3. **Virtual mic check.** If VB-CABLE is missing, explain why we need it and link to the official VB-Audio page. If present, show a green check.
4. **Optional: setup wizard.** "Want us to listen to your mic and suggest a starting point?"
   - Or "Skip and use the Natural profile"
5. **Done.** "MicLayer is running in your system tray. To use it, select **MicLayer Microphone** (or **CABLE Output** in MVP) in Discord, OBS, Zoom, etc."

Each step has Back / Skip / Next. User can quit out and finish later — the relevant pieces of state are persisted so they don't re-see steps already done.

## 9. Auto-tune wizard

Triggered from Dashboard or first-run. Three or four sample-capture steps, then a "Suggestion" review.

### 9.1 Flow

1. **Intro.** "We'll listen for ~30 seconds. Your audio doesn't leave your computer."
2. **Silence (5 s).** "Stay quiet." Countdown bar + level meter.
3. **Normal speech (8 s).** "Speak as you normally would. Try a normal sentence."
4. **Loud speech (4 s).** "Speak loudly, as if excited."
5. **Optional: read this** (10 s). A short paragraph for spectral analysis. User can skip.
6. **Review.** Plain-English list of recommendations:
   - "Your room is fairly quiet. We'll only do light noise cleanup."
   - "Your voice peaks loudly. We've added a safety limiter at -1 dB."
   - "Some low-end rumble was present. We've enabled a high-pass filter at 80 Hz."
   - Each item is checkable — user can untick suggestions they don't want.
7. **Save as a new profile.** Name it (default "My Wizard Tune").

### 9.2 Implementation

The wizard UI does **not** itself analyse audio. The engine has a `engine_run_autotune` API that takes a phase name, records the samples, runs analysis, and returns a structured suggestion. The UI just shows phases and displays the result. See `audio-engine.md` §10.

## 10. Tray menu

Right-click MicLayer tray icon:

```
Open MicLayer
─────────────
Profile: Streaming ▶
  ● Streaming
  ○ Natural
  ○ Podcast
  ○ ...
─────────────
[ ] Muted
[●] Tuned (vs Raw)
─────────────
Engine: ● Processing
Input: USB Microphone (Logitech)
─────────────
Quit MicLayer
```

Left-click = toggle window visibility.

## 11. Accessibility

- All controls reachable via Tab, Shift-Tab.
- Focus rings always visible in keyboard mode (custom: 2 px accent outline + 2 px background offset).
- Slider arrow-key step = 1% of range; Shift+arrow = 5%.
- Meters have a text-equivalent live region so screen readers can announce clip events.
- Colour-blind safe meter colours (don't rely solely on red/green — also use position and a small icon).
- Minimum contrast 4.5:1 for all text.

## 12. State shape (Zustand)

```ts
type AppState = {
  ui: {
    theme: 'dark' | 'medium' | 'light' | 'system';
    section: 'dashboard' | 'tune' | 'profiles' | 'settings';
    advancedDefault: boolean;
  };
  engine: {
    status: 'stopped' | 'starting' | 'running' | 'stopping' | 'faulted';
    input?: AudioDevice;
    sinkBackend: 'vb-cable' | 'miclayer-wdm' | null;
    meters: { inputPeakDb: number; inputRmsDb: number; outputPeakDb: number; clipping: boolean; noiseFloorDb: number };
    raw: boolean;
    muted: boolean;
    activeProfileId: string;
  };
  profiles: {
    byId: Record<string, Profile>;
    builtInIds: string[];
    userIds: string[];
    defaultId: string;
  };
  hotkeys: Record<HotkeyAction, string | null>;
  // ...
};
```

Tauri events update `engine`. User actions dispatch through Tauri commands which then return events.

## 13. Component / file layout

```
apps/desktop/src/
  main.tsx
  App.tsx
  router.tsx
  theme/
    tokens.ts
    ThemeProvider.tsx
  ipc/
    commands.ts          -- thin typed wrappers around Tauri invoke()
    events.ts            -- typed wrappers around Tauri listen()
  state/
    useAppStore.ts
  shared/
    LevelMeter.tsx
    SegmentedToggle.tsx
    Slider.tsx
    NumberField.tsx
    ProfilePicker.tsx
    DeviceSelector.tsx
    SectionCard.tsx
  features/
    dashboard/
      Dashboard.tsx
      QuickSliders.tsx
      NoiseFloorIndicator.tsx
      VirtualMicStatus.tsx
    tune/
      Tune.tsx
      ModuleCard.tsx
      modules/
        InputGainCard.tsx
        HighPassCard.tsx
        NoiseSuppressionCard.tsx
        GateCard.tsx
        EqCard.tsx
        EqCurveView.tsx
        CompressorCard.tsx
        DeEsserCard.tsx
        LimiterCard.tsx
        OutputGainCard.tsx
    profiles/
      Profiles.tsx
      ProfileList.tsx
      ProfileDetails.tsx
      ImportDialog.tsx
    settings/
      Settings.tsx
      sections/
        GeneralSection.tsx
        AudioSection.tsx
        VirtualMicSection.tsx
        HotkeysSection.tsx
        UpdatesSection.tsx
        DiagnosticsSection.tsx
        AboutSection.tsx
    onboarding/
      FirstRunFlow.tsx
      steps/...
    wizard/
      AutoTuneWizard.tsx
      steps/...
    recorder/
      RecordTestModal.tsx
      AbCompareView.tsx
    tray/
      (tray menu rendered native; this dir holds the React handlers it dispatches into)
```
