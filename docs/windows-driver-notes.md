# Windows Driver Notes

A more technical companion to [`virtual-microphone.md`](virtual-microphone.md). This is for the person actually writing the kernel driver. If you're contributing to anything else, you don't need to read it.

## 1. Target driver type

**WDM audio driver via Port Class library (`portcls.sys`), AVStream miniport, exposing one KS capture pin.** Class is `Media`, subclass is `MEDIA`. Friendly name `MicLayer Microphone`.

WDF/KMDF is the modern Windows driver framework but is not the right fit for KS/portcls audio drivers — AVStream/portcls is the path with examples and Microsoft documentation behind it.

## 2. Starting point: SYSVAD

**Repository:** https://github.com/microsoft/Windows-driver-samples/tree/main/audio/sysvad
**Licence:** MIT (same as our app — clean fit).

SYSVAD is Microsoft's "Sample Audio Driver" — a full WDM virtual audio driver demonstrating capture, render, multiple endpoints, hardware-acceleration paths, and effects. It's the closest thing to a working baseline.

**What to strip from SYSVAD:**

- All render endpoints. We're capture-only.
- Hardware-offload paths.
- The synthetic-data source on capture (sine generator). Replace with shared-memory ring drained by the engine.
- Volume/mute APO chains (Windows will still expose volume on the endpoint; we don't add custom processing).
- Multiple-endpoint factories. Just the one.

**Files of interest in SYSVAD:**
- `topo.cpp` / `topo.h` — topology miniport.
- `mintopocap.cpp` — capture topology.
- `minwavertcap.cpp` — capture WaveRT miniport.
- `simple.cpp` — simple non-WaveRT capture sample (useful reference).
- `*.inf` files — installation metadata.

After cutting, target size is ~3-5 kLoC of C, well-commented.

## 3. Endpoint metadata

In the INF:

- `DeviceDesc` / `FriendlyName` = `MicLayer Microphone`
- `Manufacturer` = `MicLayer`
- Device class = `Media` (GUID `{4d36e96c-e325-11ce-bfc1-08002be10318}`)
- Hardware ID = something like `ROOT\MicLayerMic` (we register as a root-enumerated virtual device)
- KS category = `KSCATEGORY_AUDIO`, `KSCATEGORY_CAPTURE`

The friendly name is what shows up in Windows Sound Settings → Input. Some apps surface manufacturer + friendly name; we set both.

## 4. Default audio format

| Param | Value |
|---|---|
| Sample rate | 48000 Hz |
| Channels | 1 (mono) |
| Bit depth | 16-bit signed integer (s16le) |
| Encoding | PCM |

The Windows audio engine handles conversion if an app requests something else (e.g. Discord requests 48 kHz stereo at 16-bit — the engine upmixes our mono).

We expose only this format. Apps that demand exclusive-mode in another format get a clean failure.

## 5. User-kernel data path

### 5.1 Preferred: shared memory ring + signal event

- At engine start, the user-mode side creates a named section (`\BaseNamedObjects\Global\MicLayerRing` or a per-session private name), maps it, and writes a header + ring buffer.
- The driver, on capture start, opens the section by name and maps it into kernel space.
- The user-mode engine writes processed frames into the ring; the driver's capture pull copies from the ring into the KS data packets handed to Windows.
- A named event signals "data available" so the driver doesn't busy-wait.

Ring layout (cache-line aligned, single-producer / single-consumer):

```
struct MicLayerRingHeader {
    uint32_t magic;             // 'MLR1'
    uint32_t version;           // 1
    uint32_t format_rate_hz;    // 48000
    uint16_t format_channels;   // 1
    uint16_t format_bits;       // 16
    uint32_t ring_bytes;        // capacity
    uint32_t reserved[3];

    // SPSC indices
    atomic_uint64_t write_pos;  // user-mode writer
    atomic_uint64_t read_pos;   // kernel-mode reader
    uint8_t  pad[CACHE_LINE - 16];
};

struct MicLayerRing {
    MicLayerRingHeader header;
    int16_t  buffer[/* ring_bytes / 2 */];
};
```

### 5.2 Fallback: IOCTL

- Engine `DeviceIoControl`s buffers in.
- Driver enqueues them in a non-paged ring for capture pulls.
- Higher per-call overhead, simpler to debug.

Decide based on early benchmarks. Shared memory should win clearly.

## 6. Threading and IRQL

Capture pulls happen at DISPATCH_LEVEL (DPC). Anything called from the capture path:
- No paged memory access.
- No spin-locked-then-paged work.
- Lock-free atomic indices for the ring (SPSC means no CAS needed; release-acquire pairs are enough).
- No allocation. Pre-allocate all kernel-side buffers at miniport init.

The engine side is at PASSIVE_LEVEL (user-mode); no IRQL constraints there.

## 7. Lifecycle

| Event | Behaviour |
|---|---|
| User-mode engine starts | Opens / creates shared section, signals "ready" event |
| User-mode engine stops | Closes section, writes EOS marker to ring |
| Driver capture starts (app opened mic) | Maps section, starts pulling. If no ring or no engine, returns silence (zeros) without erroring out — so apps don't crash. |
| Driver capture stops | Unmaps. |
| Sleep/resume | Driver state survives; engine reopens its section on wake. |
| User logs out / switches user | Driver per-session vs global: we run per-session so user A's processing doesn't bleed to user B. |
| Driver uninstall | `pnputil /delete-driver` removes; clean. |

## 8. Multi-instance behaviour

If the user runs two copies of MicLayer (which we should prevent in the user-mode app via a single-instance lock), the driver should detect a second engine attaching to the section and refuse. We surface this as a user-mode error: "Another MicLayer instance is already running."

## 9. Security considerations

- The shared memory section is namespaced per session and protected by an ACL only granting access to the calling user.
- The driver does not parse or interpret the audio content — it copies bytes from a fixed-size ring with bounds-checked indices. Nothing in the data path can construct a kernel exploit.
- No IOCTLs beyond what's strictly needed; each IOCTL has a strict input-buffer-size check.
- No support for unsigned drivers; we never ask the user to enable Test Mode.

## 10. Build environment

| Tool | Version |
|---|---|
| Visual Studio | 2022 (Build Tools sufficient) |
| Windows Driver Kit | Matching Windows 11 (currently WDK 10.0.22621 or later) |
| Windows SDK | Matching |
| EV code-signing certificate | DigiCert / Sectigo / GlobalSign |
| Microsoft Partner Center | Hardware Dev account |

Build outputs:
- `MicLayerMic.sys` — the driver binary.
- `MicLayerMic.inf` — install metadata.
- `MicLayerMic.cat` — signature catalog.
- Submitted to Partner Center as a CAB; receives Microsoft attestation signature back.

## 11. Testing

| Test | How |
|---|---|
| Loads cleanly | `pnputil /add-driver miclayer.inf /install`, check Device Manager |
| Endpoint visible | Windows Sound Settings → Input → `MicLayer Microphone` listed |
| Apps can open | Open it in Sound Recorder, see live audio |
| 24-hour soak | Engine writing speech-shaped noise; no BSOD, no driver verifier complaints |
| Sleep/resume | Sleep with engine running, wake; check audio resumes |
| User logout/login | Same as above |
| Driver verifier | All checks enabled; clean run |
| Static driver verifier (SDV) | Clean run, no defects |
| HLK (if pursuing WHQL) | Pass relevant audio tests |
| Uninstall | `pnputil /delete-driver`, endpoint vanishes, no leftover INF files in driver store |

CI for the driver runs on a Windows VM in GitHub Actions or a self-hosted runner with the WDK installed. The driver is built and signed (test-signed for CI; production-signed only on tagged releases).

## 12. Versioning

The driver has its own semver, independent of the app. The user-mode engine declares the minimum compatible driver version at startup; if the installed driver is older, the engine refuses to attach to the section and surfaces a "Reinstall the driver" error.

## 13. What if Microsoft changes the audio engine in a future Windows build and our driver breaks?

We add a regression matrix to the repo: known-good Windows builds + driver version + result. When a new Windows feature update is released, a maintainer runs the matrix; if there's a break, we ship a driver hotfix.

This is the cost of shipping a kernel driver. It's worth it for the `MicLayer Microphone` branded device.

## 14. Decision: when do we actually do this?

Driver work starts only when:

- v0.5 has shipped (DSP chain, noise suppression, wizard, all of it).
- The product has demonstrated user demand.
- A maintainer (or sponsored contributor) with WDM experience is willing to lead it.
- Funding for the EV cert is secured.

If none of those is true at the time, we stay on VB-CABLE and document clearly that v1.0 is gated on the driver.

We do **not** start writing kernel code before the user-mode app is working. The product is more valuable as a polished user-mode tool with a VB-CABLE bridge than as a half-broken kernel-driver experiment.
