// Settings page. Sections: Theme, General (autostart), Virtual mic, Hotkeys.

import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Download } from 'lucide-react';

import { useAppStore, type ThemeChoice } from '../../state/useAppStore';
import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL, type SinkStatus } from '../../ipc/sink';
import { autostart, hotkeysGet, hotkeysSet, type HotkeyMap } from '../../ipc/hotkeys';
import {
  diagnosticsSnapshot,
  exportDiagnosticsViaDialog,
  type DiagnosticsSnapshot,
} from '../../ipc/diagnostics';

const themes: ThemeChoice[] = ['dark', 'medium', 'light', 'system'];

export function Settings() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ThemeSection />
      <GeneralSection />
      <VirtualMicSection />
      <HotkeysSection />
      <DiagnosticsSection />
      <AboutSection />
    </div>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useAppStore((s) => ({
    theme: s.ui.theme,
    setTheme: s.setTheme,
  }));
  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">Theme</h2>
      <div className="flex gap-2">
        {themes.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            className={
              'rounded-pill px-3 py-1 text-sm capitalize ' +
              (theme === t
                ? 'bg-accent/20 text-fg'
                : 'border border-muted/30 text-muted hover:border-accent/60')
            }
          >
            {t}
          </button>
        ))}
      </div>
    </section>
  );
}

function GeneralSection() {
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    autostart.isEnabled()
      .then(setStartWithWindows)
      .catch((e) => console.error('autostart.isEnabled failed', e));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (startWithWindows) {
        await autostart.disable();
        setStartWithWindows(false);
      } else {
        await autostart.enable();
        setStartWithWindows(true);
      }
    } catch (e) {
      console.error('autostart toggle failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">General</h2>
      <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
        <span>
          <span className="block">Start with Windows</span>
          <span className="block text-xs text-muted">
            Launch MicLayer automatically when you sign in.
          </span>
        </span>
        <input
          type="checkbox"
          checked={startWithWindows}
          disabled={busy}
          onChange={toggle}
          className="h-4 w-4 accent-accent"
        />
      </label>
    </section>
  );
}

function VirtualMicSection() {
  const [status, setStatus] = useState<SinkStatus | null>(null);

  const refresh = async () => {
    try {
      const s = await engineSinkStatus();
      setStatus(s);
    } catch (e) {
      console.error('engine_sink_status failed', e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openInstaller = async () => {
    try {
      await openUrl(VB_CABLE_DOWNLOAD_URL);
    } catch (e) {
      console.error('opener failed', e);
    }
  };

  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Virtual microphone</h2>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-2.5 py-1 text-xs text-muted hover:border-accent/60 hover:text-fg"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </header>

      {!status && <p className="text-sm text-muted">Checking…</p>}

      {status && status.installed && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-meterLow" />
            <span className="text-fg">VB-CABLE detected</span>
            <span className="text-xs text-muted">
              ({status.active ? 'sink open' : 'sink closed — start the engine to open it'})
            </span>
          </div>
          <p className="text-xs text-muted">
            Apps will see your tuned mic as:{' '}
            <code className="rounded bg-bg px-1 py-0.5 text-fg">
              {status.windows_facing_name ?? 'CABLE Output (VB-Audio Virtual Cable)'}
            </code>
            . Select that as your microphone in Discord / OBS / Zoom / your browser.
          </p>
          {status.format && (
            <p className="text-xs text-muted">
              Format: {status.format.sample_rate_hz} Hz, {status.format.channels} channel
              {status.format.channels === 1 ? '' : 's'}
            </p>
          )}
        </div>
      )}

      {status && !status.installed && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-meterMid" />
            <span className="text-fg">VB-CABLE is not installed</span>
          </div>
          <p className="text-xs text-muted">
            MicLayer needs a virtual audio cable to deliver your tuned mic to other apps.
            We use{' '}
            <a
              href={VB_CABLE_DOWNLOAD_URL}
              onClick={(e) => {
                e.preventDefault();
                openInstaller();
              }}
              className="text-accent hover:underline"
            >
              VB-CABLE
            </a>{' '}
            — a free third-party driver. Install it from the official VB-Audio page,
            then come back and click Refresh.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openInstaller}
              className="inline-flex items-center gap-1 rounded-pill bg-accent/15 px-3 py-1 text-xs text-fg hover:bg-accent/25"
            >
              <ExternalLink className="h-3 w-3" />
              Open VB-CABLE download page
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        A branded <code className="rounded bg-bg px-1 py-0.5 text-fg">MicLayer Microphone</code>{' '}
        device — without the VB-CABLE relabel — will ship with v1.0 (see{' '}
        <code className="rounded bg-bg px-1 py-0.5 text-fg">docs/roadmap.md</code> Milestone 11).
      </p>
    </section>
  );
}

function DiagnosticsSection() {
  const [snap, setSnap] = useState<DiagnosticsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setSnap(await diagnosticsSnapshot());
    } catch (e) {
      console.error('diagnostics_snapshot failed', e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onExport = async () => {
    setBusy(true);
    try {
      const dest = await exportDiagnosticsViaDialog();
      if (dest) console.log('diagnostics exported to', dest);
    } catch (e) {
      console.error('diagnostics export failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Diagnostics</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-2.5 py-1 text-xs text-muted hover:border-accent/60 hover:text-fg"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-pill bg-accent/15 px-3 py-1 text-xs text-fg hover:bg-accent/25 disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> Export bundle
          </button>
        </div>
      </header>

      {!snap && <p className="text-sm text-muted">Loading…</p>}

      {snap && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <dt className="text-muted">App version</dt>
          <dd className="text-fg">{snap.app_version}</dd>
          <dt className="text-muted">Engine state</dt>
          <dd className="text-fg">{snap.engine_state}</dd>
          <dt className="text-muted">Selected mic</dt>
          <dd className="text-fg">{snap.selected_device_id ?? '—'}</dd>
          <dt className="text-muted">Sink backend</dt>
          <dd className="text-fg">{snap.sink.backend} {snap.sink.installed ? '· detected' : '· not installed'}</dd>
          <dt className="text-muted">Sink format</dt>
          <dd className="text-fg">
            {snap.sink.format
              ? `${snap.sink.format.sample_rate_hz} Hz / ${snap.sink.format.channels} ch`
              : '—'}
          </dd>
          <dt className="text-muted">Active profile</dt>
          <dd className="text-fg">{snap.active_profile_id ?? '—'}</dd>
          <dt className="text-muted">Default profile</dt>
          <dd className="text-fg">{snap.default_profile_id ?? '—'}</dd>
          <dt className="text-muted">OS</dt>
          <dd className="text-fg">{snap.os.family} ({snap.os.arch})</dd>
          <dt className="text-muted">Devices visible</dt>
          <dd className="text-fg">{snap.input_devices.length}</dd>
        </dl>
      )}

      <p className="mt-3 text-xs text-muted">
        Export bundle writes a JSON with the above plus device list. No audio is ever included.
      </p>
    </section>
  );
}

function AboutSection() {
  const [snap, setSnap] = useState<DiagnosticsSnapshot | null>(null);
  useEffect(() => {
    diagnosticsSnapshot().then(setSnap).catch(() => null);
  }, []);
  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">About</h2>
      <p className="text-sm text-fg">
        MicLayer {snap?.app_version ?? ''} — free, open-source mic tuning for Windows. Local
        processing only. No accounts, no telemetry, no cloud.
      </p>
      <p className="mt-2 text-xs text-muted">
        Built on Tauri, React, Rust, cpal, and nnnoiseless. VB-CABLE is a third-party virtual
        audio cable used as the MVP sink — we don't ship it ourselves; the app downloads it for
        you on first run from VB-Audio's official site.
      </p>
    </section>
  );
}

function HotkeysSection() {
  const [map, setMap] = useState<HotkeyMap | null>(null);
  const [editing, setEditing] = useState<keyof HotkeyMap | null>(null);

  useEffect(() => {
    hotkeysGet()
      .then(setMap)
      .catch((e) => console.error('hotkeys_get failed', e));
  }, []);

  if (!map) return <section className="rounded-card border border-surface/60 bg-surface p-5">
    <h2 className="mb-3 text-base font-semibold">Hotkeys</h2>
    <p className="text-sm text-muted">Loading…</p>
  </section>;

  const rows: { key: keyof HotkeyMap; label: string; help: string }[] = [
    { key: 'mute_toggle', label: 'Mute / unmute', help: 'Toggles mic mute.' },
    { key: 'raw_toggle', label: 'Raw / Tuned', help: 'Toggles between raw and tuned signal.' },
    { key: 'next_profile', label: 'Next profile', help: 'Cycles to the next profile.' },
    { key: 'prev_profile', label: 'Previous profile', help: 'Cycles to the previous profile.' },
    { key: 'show_hide', label: 'Show / hide window', help: 'Toggles the MicLayer window.' },
  ];

  const updateRow = async (key: keyof HotkeyMap, value: string | null) => {
    const next = { ...map, [key]: value };
    setMap(next);
    try {
      await hotkeysSet(next);
    } catch (e) {
      console.error('hotkeys_set failed', e);
    }
  };

  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">Hotkeys</h2>
      <p className="mb-3 text-xs text-muted">
        Accelerator syntax: <code className="rounded bg-bg px-1 py-0.5">CmdOrCtrl+Shift+M</code>,
        modifiers <code className="rounded bg-bg px-1 py-0.5">Alt</code>{' '}
        <code className="rounded bg-bg px-1 py-0.5">Shift</code>{' '}
        <code className="rounded bg-bg px-1 py-0.5">CmdOrCtrl</code>, key codes are
        plus-separated. Push-to-mute (hold) isn't supported yet.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 rounded-card bg-bg p-3">
            <div>
              <div className="text-sm">{r.label}</div>
              <div className="text-xs text-muted">{r.help}</div>
            </div>
            {editing === r.key ? (
              <input
                autoFocus
                defaultValue={map[r.key] ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  updateRow(r.key, v === '' ? null : v);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="rounded-pill border border-accent/60 bg-bg px-3 py-1 text-xs"
                placeholder="(unset)"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(r.key)}
                className="rounded-pill border border-muted/30 px-3 py-1 font-mono text-xs hover:border-accent/60"
              >
                {map[r.key] ?? '(unset)'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
