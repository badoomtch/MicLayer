# MicLayer — Virtual Microphone Strategy

This is the most technically risky part of MicLayer. Read this whole document before opening a PR that touches `engine/virtual-mic/` or the installer driver flow.

## 1. What we need

A branded Windows input device named **`MicLayer Microphone`** that:

1. Appears in the Windows Sound Settings → Input list and in every app's microphone picker.
2. Accepts the processed audio stream MicLayer writes into it.
3. Hands that stream to whatever app the user has selected the device in (Discord, OBS, Zoom, Teams, browsers, games).
4. Survives reboots, sleep/wake, USB device hot-plug events on the *physical* mic.
5. Can be installed and uninstalled cleanly without breaking the user's audio stack.

## 2. How Windows audio devices work, briefly

Windows audio is layered:

- **Kernel mode**: Port Class (`portcls.sys`), AVStream, WaveCyclic / WaveRT, WDM/KS interfaces. These are kernel-mode drivers that present "audio endpoints" (an endpoint is the Windows term for what users call a microphone or a speaker).
- **Audio engine** (user-mode service `audiosrv`): mixes streams, applies APO effects, exposes WASAPI.
- **WASAPI / DirectSound / WaveOut**: user-mode APIs apps use.
- **Apps**: enumerate endpoints, pick one, capture or render.

To create a virtual mic, we need an endpoint that the audio engine treats like a real device. The only supported way is a **kernel-mode audio driver** that registers a capture endpoint. Anything else (user-mode hooks, COM aggregator tricks, fake APO chains) is either fragile, blocked by recent Windows hardening, or unsupported by some apps (notably exclusive-mode WASAPI apps like older Discord builds).

## 3. The two-stage approach

### Stage 1 (MVP — what 0.1 ships with): VB-CABLE bridge

[VB-CABLE](https://vb-audio.com/Cable/) by VB-Audio Software is a free virtual-audio-cable driver for Windows. Its installer adds two endpoints:

- `CABLE Input` — a render endpoint. Anything written to it surfaces as input on …
- `CABLE Output` — a capture endpoint that apps can pick as their mic.

This is exactly the data flow we need. MicLayer captures the user's physical mic, processes it, and writes processed audio to `CABLE Input`. Other apps select `CABLE Output` as their mic and receive the processed signal.

**Trade-offs:**

| Pro | Con |
|---|---|
| Already exists, mature, widely deployed | The Windows-facing device label is `CABLE Output`, not `MicLayer Microphone` |
| Free for personal use | Donationware licence — fine for personal use, but commercial redistribution is restricted; we can't bundle the installer |
| Stable across Windows 10/11 updates | Adds a dependency on a 3rd-party install step |
| Familiar to anyone who's tweaked Windows audio | The two extra unused-by-most devices clutter the user's audio settings |

**What MicLayer does about it:**

1. On first run, detect whether VB-CABLE is installed (enumerate audio endpoints; look for `CABLE Input (VB-Audio Virtual Cable)`).
2. If absent, show a one-time, clearly-labelled dialog:

   > "MicLayer needs a virtual audio cable to deliver your tuned mic to other apps. We use VB-CABLE — a free third-party driver. Click below to open the VB-Audio download page. Install it, then come back. We do not bundle their installer because of their licence."

   Open the official download URL in the user's browser. Do not download or relay binaries.

3. After install, MicLayer rechecks on relaunch.
4. In the UI we show: `Virtual Mic backend: VB-CABLE (bridge). Apps will see this as "CABLE Output (VB-Audio Virtual Cable)".` We don't lie and call it MicLayer Microphone in MVP.

**Why not bundle VB-CABLE?** Their licence (https://shop.vb-audio.com/en/content/9-eula) restricts commercial redistribution. MicLayer is free, so non-commercial use might be permitted, but we should not assume so — and the dependency is anyway less brittle if we let the user manage VB-CABLE themselves.

**Why not alternatives like VAC or Voicemeeter?** Voicemeeter is overkill (it *is* a mixer; we'd be inheriting the bloat we're trying to escape). VAC is commercial. Synchronous Audio Router is ASIO-only and a different use case.

### Stage 2 (v1.0): First-party `MicLayer Microphone` driver

We build, sign, and ship our own minimal WDM/AVStream virtual audio driver. It exposes one capture endpoint, friendly name `MicLayer Microphone`, that the MicLayer engine writes into via a kernel-user shared-memory ring or an IOCTL stream.

This is the right end state. It is also non-trivial. The rest of this document is about exactly how to get there.

## 4. Driver feasibility

### 4.1 Open-source starting points

| Project | Licence | Status | Useful for us? |
|---|---|---|---|
| **Microsoft VirtualAudioCable sample** (`Windows-driver-samples/audio/sysvad`) | MIT | Maintained as part of Windows-driver-samples | **Yes** — this is the closest thing to a starting point. SYSVAD is a WDM/AVStream sample driver with virtual capture and render endpoints. |
| **Scream** | Open-source (GPL3) | Used for streaming audio over network | No — GPL3 is incompatible with our MIT app shipping it. |
| **Synchronous Audio Router (SAR)** | GPL3 | Mature ASIO routing | No — wrong model (ASIO, not WASAPI), and GPL. |
| **VB-CABLE / Voicemeeter** | Proprietary | Mature | No, can't fork. |
| **VirtualHere USB / NDIs / WO Mic** | Proprietary | Different use case | No. |

The realistic path is: **start from Microsoft's SYSVAD sample**, strip it down to a single capture endpoint, replace the synthetic-data source with our shared-memory IPC, rebrand to `MicLayer Microphone`, sign, ship. SYSVAD is MIT-licensed under `Windows-driver-samples`.

### 4.2 What that involves

In rough order:

1. **Windows Driver Kit (WDK) setup.** Visual Studio + WDK 22000 (Windows 11) is the current toolchain. Build outputs are `.sys` (the driver) and `.inf` (install metadata).
2. **Cut down SYSVAD.** It ships render + capture + various effects. We want capture-only, one endpoint, no fancy effects. Remove the rest. Aim for a few thousand lines of driver code.
3. **Define the user-kernel data path.** Two reasonable choices:
   - **Shared memory + named event** — the cleanest, lowest-latency option. Driver and user-mode engine share a ring buffer via `ZwOpenSection`/`MapViewOfFile`. Engine writes; driver consumes on its capture pull.
   - **IOCTL streaming** — simpler to get right; engine `DeviceIoControl`s frames into the driver. Higher overhead per call.
   - We prefer shared memory; we accept IOCTL as a fallback if shared memory turns out to be brittle across signing/security contexts.
4. **Endpoint configuration.** Friendly name `MicLayer Microphone`, manufacturer `MicLayer`, default format 48 kHz / mono / s16le (with WASAPI conversion handling the rest).
5. **INF file.** Defines device class (`Media`), service, devnode strings.
6. **Driver signing.** This is the gate (§5).
7. **Install integration.** Installer uses `pnputil.exe /add-driver miclayer.inf /install` (Windows 10+). On uninstall, `pnputil /delete-driver oem##.inf /uninstall`.
8. **Lifecycle:** plug events, sleep/resume, default-device set/restore.
9. **HLK testing** for WHQL (if we pursue Microsoft WHQL signing).
10. **WHQL submission** (if pursued), or **attestation signing** as a faster alternative.

Effort estimate: **3-6 engineer-months** of dedicated work to ship a stable, signed, installer-integrated driver. Lower end if a contributor with WDM experience leads it.

### 4.3 Why this is hard

- WDM is C, kernel mode, no Rust toolchain support for kernel drivers on Windows (yet). The driver itself is a C codebase.
- Memory bugs in kernel mode = BSOD, not crash dialog. Audio drivers are especially sensitive to deadlocks (capture pulls happen at DPC level).
- Each Windows feature update (10 → 11 → 11 23H2 → 24H2 …) can change the audio engine subtly. Drivers need regression testing across builds.
- Signing requirements have tightened repeatedly since Windows 8. Today, ANY driver loaded on consumer Windows must be signed by Microsoft (via WHQL or attestation), or the system must be in Test Mode (which we cannot ask users to enable).

## 5. Driver signing

This is the single biggest non-engineering cost.

### 5.1 What's required

Since Windows 10 1607, kernel-mode drivers must be signed by Microsoft. Two paths:

1. **WHQL signing.** Driver passes Hardware Lab Kit (HLK) tests, is submitted to Microsoft Partner Center, gets cryptographically signed by Microsoft and published to Windows Update if desired. Annual renewal of the EV signing cert is required to keep submitting.
2. **Attestation signing.** Faster, lighter alternative: submit a signed-by-EV-cert driver package to Partner Center, Microsoft does basic attestation (no HLK), returns a Microsoft-signed package. Suitable for in-house / niche drivers. **This is the right choice for MicLayer.**

### 5.2 What you need to do attestation signing

| Item | Cost / effort |
|---|---|
| EV code-signing certificate (DigiCert, Sectigo, GlobalSign) | ~$300-600/year |
| Microsoft Partner Center account (Hardware Dev Program) | $0 to sign up; one-time EV cert verification |
| Signed driver package (`.cab`) submitted via Partner Center | Free; turnaround typically same day |
| EV cert renewal | Annual |

We document this cost honestly in the README. The project maintainer(s) will need to cover it, or we set up a small donation page solely for the cert renewal. **No subscription, no paid features**.

### 5.3 What if we don't sign?

Then the driver won't load on consumer Windows except with Test Mode, which is the wrong UX. We do not ship an unsigned driver.

## 6. Distribution and updates

The signed driver is bundled inside the MicLayer MSI. Installer flow:

1. Check if `MicLayer Microphone` driver is already installed and at the bundled version.
2. If absent or older, run `pnputil /add-driver miclayer.inf /install` with elevation.
3. Show a progress and a "Driver installed" confirmation.
4. If the install fails, surface a plain-English error with the underlying code, and a `Diagnose` button that opens a help page.

Driver updates ship with app updates. We never silently auto-update the driver; the user opts in.

## 7. Uninstall

The MSI uninstaller offers:

- Remove the app only (keep the driver and `%APPDATA%\MicLayer\`).
- Remove the app + the driver.
- Remove the app + the driver + user profiles and settings.

`pnputil /delete-driver` is used to remove the driver. We log the OEM-INF identifier at install time so we can find it again at uninstall.

## 8. Repair

The Settings → Virtual Microphone page has a "Repair" button that:

1. Stops the engine.
2. Removes and reinstalls the driver (`pnputil /delete-driver`, then `/add-driver /install`).
3. Restarts the engine.

This handles the common case where Windows updates put the driver in a bad state.

## 9. Honest staging today

Until v1.0 ships:

- The UI does not pretend `MicLayer Microphone` exists. It says "Virtual mic backend: VB-CABLE bridge" or similar.
- The architecture lets us swap implementations cleanly via the `VirtualMicSink` trait. No code outside `engine/virtual-mic/` needs to change when we go from VB-CABLE to MicLayer-WDM.
- The roadmap is honest about the gap.

## 10. Decision log

| Decision | Reasoning |
|---|---|
| MVP uses VB-CABLE | Lets us ship a working product immediately without driver work. Users tolerate it because it's free and documented. |
| We do not bundle VB-CABLE | Their licence forbids commercial redistribution; we'd rather be safe and direct users to the official download. |
| v1.0 ships a first-party signed driver | The branded device name is core to product positioning and users won't tolerate a `CABLE Output` UX forever. |
| We use attestation signing, not full WHQL | Saves months of HLK testing for negligible benefit to a tiny driver. |
| We start from SYSVAD, not from scratch | MIT-licensed, audited, exists. Building from zero is months wasted. |
| The driver is in C, not Rust | Windows kernel does not have a maintained Rust target. Hybrid would be more complex than a small C driver. |
| The user-kernel boundary uses shared memory | Lowest latency; cleanly separates the engine from the driver lifetime. IOCTL kept as fallback. |
| No reboot required if avoidable | `pnputil` driver-package install rarely needs a reboot for class drivers in `Media`; we surface clearly when it does. |

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Driver crashes / BSOD | Medium during dev, low at ship | HLK-style soak tests, narrow code surface (capture-only), only the engine talks to the driver |
| Signing cert revocation | Low | Renew on schedule; cache last signed build |
| Microsoft policy change requiring full WHQL | Low | If forced, fund the HLK testing run; until then attestation is supported policy |
| Audio engine behaviour changes between Windows builds | Medium | Regression matrix across the last 4 Windows builds, run by CI on Insider images if Microsoft makes them available, otherwise run by maintainers manually |
| User has Bluetooth mic with weird sample rates | High | Resampling on input; clearly surface the rate in Diagnostics |
| User runs MicLayer + an exclusive-mode WASAPI app on the same device | High | Honest error message: "Another app has your mic in exclusive mode" — we don't try to fight for it |
| User has aggressive antivirus that blocks new audio drivers | Medium | Document in troubleshooting; the EV cert + Microsoft signing makes this rare but not impossible |
