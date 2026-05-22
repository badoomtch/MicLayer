# MicLayer — Diagnostics

The Diagnostics page exists for two audiences: a curious user verifying their setup, and a maintainer triaging a bug report. It should serve both without leaking anything users wouldn't expect.

## 1. Diagnostics page layout

Inside Settings → Diagnostics:

```
┌─ Engine ───────────────────────────────────────────────────┐
│  State:           Running                                  │
│  Active profile:  Streaming                                │
│  Uptime:          0h 12m 33s                               │
│  CPU (engine):    1.4%                                     │
│  Allocations on audio thread: 0 (verified)                 │
│  Last error:      none                                     │
└────────────────────────────────────────────────────────────┘
┌─ Input device ─────────────────────────────────────────────┐
│  Name:            USB Microphone (Logitech)                │
│  ID:              {0.0.1.00000000}.{...}                   │
│  Sample rate:     48000 Hz                                 │
│  Channels:        1                                        │
│  Buffer:          480 frames (10.0 ms)                     │
│  Mode:            Shared                                   │
│  Exclusive avail: Yes                                      │
│  Format support:  48k mono s16, 48k mono f32, 44.1k mono s16│
└────────────────────────────────────────────────────────────┘
┌─ Virtual mic backend ──────────────────────────────────────┐
│  Backend:         VB-CABLE                                 │
│  Backend status:  Healthy                                  │
│  Output device:   CABLE Input (VB-Audio Virtual Cable)     │
│  Apps will see:   CABLE Output (VB-Audio Virtual Cable)    │
│  Driver version:  1.0.3.8                                  │
└────────────────────────────────────────────────────────────┘
┌─ Latency estimate ─────────────────────────────────────────┐
│  Input buffer:           10.0 ms                           │
│  DSP processing:          0.7 ms                           │
│  RNNoise lookahead:      10.0 ms                           │
│  Limiter lookahead:       2.0 ms                           │
│  Sink buffer:            10.0 ms (VB-CABLE)                │
│  Total (measured):       30 - 35 ms                        │
└────────────────────────────────────────────────────────────┘
┌─ Performance ──────────────────────────────────────────────┐
│  Dropouts (last 60 min): 0                                 │
│  Worst callback time:    2.1 ms / 10.0 ms budget           │
│  Average callback time:  0.7 ms                            │
└────────────────────────────────────────────────────────────┘
┌─ System ───────────────────────────────────────────────────┐
│  OS:              Windows 11 Pro 26200                     │
│  CPU:             AMD Ryzen 5 5600X                        │
│  RAM:             32 GB                                    │
│  Audio drivers:   Realtek 6.0.9568.1 / VB-CABLE 1.0.3.8    │
└────────────────────────────────────────────────────────────┘

[ Export diagnostic bundle ]   [ View log folder ]
```

## 2. Live data sources

- `engine.diagnostics` event, emitted every 2 s while the page is visible. Aggregates state + last-window stats.
- Static system info (OS, CPU, RAM) read once on app start.
- Device info read on device select + on `engine.device` events.

## 3. Export bundle contents

When the user clicks **Export diagnostic bundle**:

1. A ZIP is created in `%APPDATA%\MicLayer\diagnostics\bundle-<YYYYMMDD-HHMMSS>.zip`.
2. Contents:

```
bundle-<ts>.zip
├── README.txt              -- one-pager: what this is, what's in it, how to share it
├── meta.json               -- timestamps, MicLayer version, OS build
├── config.json             -- redacted copy (no audio paths)
├── profiles/
│   └── <active>.json       -- only the active profile
├── logs/
│   ├── miclayer-YYYY-MM-DD.log
│   └── ...                 -- up to last 7 days
├── devices.json            -- enumeration of audio devices and their formats
├── engine-stats.json       -- last 5 minutes of dropout / callback stats
└── recording.wav           -- ONLY if user ticked "Include last test recording"
```

3. The Explorer window opens with the file selected. We do not upload it.

## 4. Redaction

The bundle is intended to be safe-by-default to attach to a public issue. Redactions:

- `recordings/` are excluded unless explicitly included.
- Path values in logs are normalised to start with `%APPDATA%\` rather than the full user-home path (i.e. `C:\Users\<username>\AppData\...` becomes `%APPDATA%\...`).
- Windows username is not logged. Logged file paths are normalised. The bundle's `meta.json` records the username only as a hash if needed for support correlation (not yet implemented; keep simple).

## 5. Why this page is more than "log dump"

A bare log dump is hostile to users. The Diagnostics page is also a *self-service troubleshooter*: a user can read it and conclude "my mic is at 44.1k, so the resampler is on, that's why latency is 5 ms higher than expected" without filing an issue at all.

The page should match the cleanliness of the rest of the UI: cards, generous spacing, no monospace dumps of raw structs.

## 6. Failure modes the page must show clearly

- Engine is not running → state shows "Stopped", reason ("user stopped", "no device", "fault"), and a primary action ("Start engine").
- Virtual mic backend unhealthy → backend card turns amber, status names the cause ("VB-CABLE not installed"), action is "Repair backend".
- Input device gone → input card turns amber, action is "Choose another mic".

## 7. CPU and dropout measurement

Inside the engine's drain thread (not the audio thread):

- Each audio callback records `(callback_time_ns, work_time_ns, dropout_bool)` into a fixed-size ring.
- Drain thread aggregates last-N samples for the page.
- "Dropout" = work_time_ns > 0.9 × budget for the buffer size.

These numbers are honest. The CPU percentage is the engine's threads only — not the UI.

## 8. Things the page deliberately does **not** show

- Per-DSP-module CPU breakdown — interesting but pushes us toward "audio nerd app". Maybe v2.
- Frequency-domain analysers of the live signal — same.
- Live spectrogram of the mic — same.

The page is operational, not analytical.
