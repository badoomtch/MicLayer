# profiles/

Built-in profile JSONs shipped with MicLayer. Loaded at build time and copied to `%APPDATA%\MicLayer\profiles\` on first run.

| File | Use |
|---|---|
| `natural.json` | Minimal processing; transparent. Use when your mic/room are already clean. |
| `streaming.json` | Twitch / YouTube live with a decent mic. Clarity boost, moderate compression, safety limiter. |
| `podcast.json` | Long-form recording. Warmer, smoother, light cleanup. |
| `voiceover.json` | Polished narration. Tight gate, strong compression, de-esser on. |
| `discord.json` | Voice chat. Aggressive cleanup, tight gate, presence boost for small speakers. |
| `noisy-room.json` | Loud environments. Maxed NS, strong gate. |
| `late-night.json` | Quiet calls / late streams. Lower input level, gentle compression, high-end roll-off. |
| `headset-rescue.json` | Gaming headsets and budget boom mics. Cuts nasal honk, restores body and air. |
| `laptop-mic-rescue.json` | Built-in laptop mics. Hard high-pass, heavy NS, aggressive EQ shaping. |
| `radio-style.json` | Classic broadcast feel. Scooped mids, big low-end, lifted highs, heavier compression. |

Schema: [`../packages/shared/schemas/profile.schema.json`](../packages/shared/schemas/profile.schema.json).
Documentation: [`../docs/profile-format.md`](../docs/profile-format.md).

These are read-only in the app; users duplicate them to make their own.
