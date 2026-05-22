# Contributing to MicLayer

Thanks for being here. MicLayer is intended to be a small, focused, contributor-friendly project. This file tells you how to help without stepping on the design.

## Scope guardrails

Before opening an issue or PR, please re-read the **non-goals** section of [`docs/product-spec.md`](docs/product-spec.md). The most common contribution mistake on apps in this space is feature creep:

- We will **not** add a soundboard.
- We will **not** add voice changers, pitch shifters, or character effects.
- We will **not** add a music/chat/game mixer or per-application audio routing.
- We will **not** add cloud features, accounts, or telemetry.
- We will **not** ship gamer-themed visuals.

A PR that adds something in this list will be closed. A PR that makes the mic chain sound better, the UI clearer, the install/repair flow safer, or the DSP more efficient is exactly what we want.

## Ways to help

| You want to… | Start here |
|---|---|
| Improve DSP quality or efficiency | [`docs/dsp-chain.md`](docs/dsp-chain.md), `engine/dsp/` |
| Add a starter profile | [`profiles/`](profiles/) — open a PR with a JSON conforming to the schema |
| Improve a UI screen | [`docs/ui-plan.md`](docs/ui-plan.md), `apps/desktop/src/` |
| Help with the branded virtual mic driver | [`docs/virtual-microphone.md`](docs/virtual-microphone.md), [`docs/windows-driver-notes.md`](docs/windows-driver-notes.md) |
| Translate the UI | (post-MVP) |
| Triage diagnostics / error messages | [`docs/error-handling.md`](docs/error-handling.md) |

## Development setup

(Build instructions are added with Milestone 1. Until then this section is a placeholder. The intended toolchain is Node 20+, pnpm 9+, Rust 1.78+, MSVC build tools, Windows 10/11 x64.)

## Code style

- **Rust:** `cargo fmt`, `cargo clippy -- -D warnings`. No `unsafe` in DSP modules without a justification comment.
- **TypeScript:** `prettier` + `eslint` defaults from the repo config. Prefer named exports.
- **No comments that just restate the code.** Comment the *why* of a non-obvious choice, especially in real-time paths (allocation avoidance, denormal handling, lock-free patterns).

## Audio-engine rules

The audio thread runs in real time. In `engine/audio/` and `engine/dsp/`:

- No heap allocation in the processing callback.
- No locks. Use lock-free ring buffers (`rtrb`) for cross-thread communication.
- No logging in the hot path. Push events into a ring for the UI thread to drain.
- No panic in `process()` — handle errors by returning silence and surfacing the fault.
- Process in fixed-size blocks; the block size is determined by the device, not by the DSP module.

See [`docs/audio-engine.md`](docs/audio-engine.md) for the full contract.

## Commit style

Conventional commits, lowercase subject:

```
feat(dsp): add lookahead to limiter
fix(devices): handle WASAPI sample-rate mismatch
docs(profiles): document discord profile assumptions
```

## Pull request checklist

- [ ] Linked to an issue or has a short rationale in the PR body
- [ ] Stays within scope (re-check the non-goals)
- [ ] No new dependencies pulled in without justification + licence note
- [ ] `cargo test`, `cargo clippy`, `pnpm lint`, `pnpm typecheck` pass
- [ ] Audio-thread code respects the real-time rules above
- [ ] No telemetry / network calls added
- [ ] Docs updated if behaviour or schema changed

## Reporting bugs

Open an issue with:

- Windows build (`winver` output)
- Mic make/model and connection (USB / 3.5mm / Bluetooth — Bluetooth mic input is notoriously bad and known)
- Sample rate / buffer size from the Diagnostics screen
- The exported diagnostic bundle if relevant (do **not** include audio unless reproducibility requires it)
- Steps to reproduce

## Security and privacy issues

Open a private security advisory on GitHub rather than a public issue. Anything that could exfiltrate mic audio, bypass the local-only guarantee, or compromise the kernel driver is treated as critical.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Short version: be civil, assume good faith, no harassment, no political/religious flamebait in issues. Maintainers may close or lock threads that drift.
