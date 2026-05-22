// Settings — anchor nav + sections (Appearance / General / Virtual mic /
// Hotkeys / Diagnostics / About). From the Claude Design handoff.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink, RefreshCw, Check, Download } from 'lucide-react';

import { useAppStore, type ThemeChoice } from '../../state/useAppStore';
import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL, type SinkStatus } from '../../ipc/sink';
import { autostart, hotkeysGet, hotkeysSet, type HotkeyMap } from '../../ipc/hotkeys';
import {
  diagnosticsSnapshot,
  exportDiagnosticsViaDialog,
  type DiagnosticsSnapshot,
} from '../../ipc/diagnostics';
import { Toggle } from '../../shared/Toggle';

const NAV = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'general', label: 'General' },
  { id: 'sink', label: 'Virtual microphone' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'about', label: 'About' },
] as const;

type SectionId = (typeof NAV)[number]['id'];

export function Settings() {
  const [active, setActive] = useState<SectionId>('appearance');
  const refs = useRef<Record<SectionId, HTMLDivElement | null>>({} as never);

  const onJump = (id: SectionId) => {
    setActive(id);
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="ml-page"
      style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 22 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
        }}
      >
        <div className="ml-eyebrow" style={{ padding: '6px 10px 8px' }}>
          Settings
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onJump(n.id)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              color: active === n.id ? 'var(--ml-fg)' : 'var(--ml-fg-muted)',
              background: active === n.id ? 'var(--ml-surface-2)' : 'transparent',
              cursor: 'pointer',
              border: 0,
              textAlign: 'left',
              font: 'inherit',
            }}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Anchor id="appearance" refs={refs}>
          <AppearanceSection />
        </Anchor>
        <Anchor id="general" refs={refs}>
          <GeneralSection />
        </Anchor>
        <Anchor id="sink" refs={refs}>
          <SinkSection />
        </Anchor>
        <Anchor id="hotkeys" refs={refs}>
          <HotkeysSection />
        </Anchor>
        <Anchor id="diagnostics" refs={refs}>
          <DiagnosticsSection />
        </Anchor>
        <Anchor id="about" refs={refs}>
          <AboutSection />
        </Anchor>
      </div>
    </div>
  );
}

function Anchor({
  id,
  refs,
  children,
}: {
  id: SectionId;
  refs: React.MutableRefObject<Record<SectionId, HTMLDivElement | null>>;
  children: ReactNode;
}) {
  return (
    <div
      ref={(el) => {
        refs.current[id] = el;
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  desc,
  trailing,
  children,
}: {
  title: string;
  desc?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ml-card ml-card-pad" style={{ padding: '18px 22px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
          gap: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {desc && (
            <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)', marginTop: 2 }}>{desc}</div>
          )}
        </div>
        {trailing}
      </header>
      {children}
    </section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useAppStore((s) => ({
    theme: s.ui.theme,
    setTheme: s.setTheme,
  }));
  const choices: { value: ThemeChoice; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'medium', label: 'Medium' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];
  return (
    <Section
      title="Appearance"
      desc="Choose how MicLayer looks. Follow-system tracks Windows light/dark."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {choices.map((c) => (
          <ThemeSwatch
            key={c.value}
            label={c.label}
            value={c.value}
            selected={theme === c.value}
            onSelect={() => setTheme(c.value)}
          />
        ))}
      </div>
    </Section>
  );
}

function ThemeSwatch({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: ThemeChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors: Record<ThemeChoice, string[]> = {
    dark: ['#0b0c0e', '#141518', '#ecedef', '#7aa2f7'],
    medium: ['#1a1d22', '#23262d', '#e3e6ea', '#7aa2f7'],
    light: ['#f7f7f5', '#ffffff', '#15171b', '#3b6bd1'],
    system: ['#0b0c0e', '#f7f7f5', '#ecedef', '#7aa2f7'],
  };
  const c = colors[value];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        border: '1px solid ' + (selected ? 'var(--ml-accent)' : 'var(--ml-border)'),
        borderRadius: 'var(--ml-r-md)',
        padding: 8,
        cursor: 'pointer',
        background: selected ? 'var(--ml-accent-soft)' : 'transparent',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          height: 60,
          borderRadius: 6,
          overflow: 'hidden',
          background: c[0],
          display: 'grid',
          gridTemplateColumns: '34px 1fr',
          border: '1px solid rgba(127, 127, 127, 0.15)',
        }}
      >
        <div style={{ background: c[1], borderRight: '1px solid rgba(127, 127, 127, 0.15)' }} />
        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ width: '70%', height: 4, borderRadius: 2, background: c[2], opacity: 0.7 }} />
          <div style={{ width: '40%', height: 4, borderRadius: 2, background: c[3] }} />
          <div style={{ width: '55%', height: 4, borderRadius: 2, background: c[2], opacity: 0.35 }} />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
        {selected && (
          <span style={{ color: 'var(--ml-accent)' }}>
            <Check size={12} />
          </span>
        )}
      </div>
    </button>
  );
}

function GeneralSection() {
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    autostart.isEnabled().then(setStartWithWindows).catch(() => null);
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
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="General">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13 }}>Start with Windows</div>
          <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>
            Launch MicLayer when you sign in.
          </div>
        </div>
        <Toggle
          checked={startWithWindows}
          onChange={toggle}
          disabled={busy}
          aria-label="Start with Windows"
        />
      </div>
    </Section>
  );
}

function SinkSection() {
  const [status, setStatus] = useState<SinkStatus | null>(null);
  const refresh = async () => setStatus(await engineSinkStatus());
  useEffect(() => {
    refresh().catch(() => null);
  }, []);
  const openVendor = () => openUrl(VB_CABLE_DOWNLOAD_URL).catch(() => null);

  return (
    <Section
      title="Virtual microphone"
      desc="The bridge that delivers your tuned mic to other apps."
      trailing={
        <button type="button" className="ml-btn ghost" onClick={() => refresh().catch(() => null)}>
          <RefreshCw size={11} /> Refresh
        </button>
      }
    >
      {!status && <p style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>Checking…</p>}
      {status && status.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ml-pill good">
            <span className="ml-dot" /> Connected
          </span>
          <div style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>
            VB-CABLE detected · {status.windows_facing_name ?? 'CABLE Output'}
          </div>
        </div>
      )}
      {status && !status.installed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="ml-pill warn">VB-CABLE missing</span>
            <button type="button" className="ml-btn ghost" onClick={openVendor}>
              <ExternalLink size={11} /> Open vendor page
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>
            Use the first-run installer (Dashboard) or download VB-CABLE manually from VB-Audio.
          </p>
        </div>
      )}
    </Section>
  );
}

function HotkeysSection() {
  const [map, setMap] = useState<HotkeyMap | null>(null);
  const [editing, setEditing] = useState<keyof HotkeyMap | null>(null);
  useEffect(() => {
    hotkeysGet().then(setMap).catch(() => null);
  }, []);
  if (!map) {
    return (
      <Section title="Hotkeys">
        <p style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>Loading…</p>
      </Section>
    );
  }
  const rows: { key: keyof HotkeyMap; label: string }[] = [
    { key: 'mute_toggle', label: 'Mute / unmute' },
    { key: 'raw_toggle', label: 'Toggle raw / tuned' },
    { key: 'next_profile', label: 'Next profile' },
    { key: 'prev_profile', label: 'Previous profile' },
    { key: 'show_hide', label: 'Show / hide MicLayer' },
  ];
  const update = async (key: keyof HotkeyMap, value: string | null) => {
    const next = { ...map, [key]: value };
    setMap(next);
    try {
      await hotkeysSet(next);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Section
      title="Hotkeys"
      desc="Reach the essentials without bringing MicLayer to the front."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rows.map((r) => (
          <div
            key={r.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '9px 0',
              borderBottom: '1px solid var(--ml-border)',
            }}
          >
            <span style={{ fontSize: 12.5 }}>{r.label}</span>
            {editing === r.key ? (
              <input
                autoFocus
                defaultValue={map[r.key] ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  update(r.key, v === '' ? null : v);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="ml-input"
                style={{ width: 200 }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(r.key)}
                className="ml-kbd"
                style={{ cursor: 'pointer', padding: '4px 10px' }}
              >
                {map[r.key] ?? '(unset)'}
              </button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function DiagnosticsSection() {
  const [snap, setSnap] = useState<DiagnosticsSnapshot | null>(null);
  const refresh = async () => setSnap(await diagnosticsSnapshot());
  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  return (
    <Section
      title="Diagnostics"
      trailing={
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ml-btn ghost" onClick={() => refresh().catch(() => null)}>
            <RefreshCw size={11} /> Refresh
          </button>
          <button
            type="button"
            className="ml-btn"
            onClick={() => exportDiagnosticsViaDialog().catch(() => null)}
          >
            <Download size={11} /> Export
          </button>
        </div>
      }
    >
      {!snap && <p style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>Loading…</p>}
      {snap && (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr',
            rowGap: 6,
            columnGap: 14,
            fontSize: 12,
            margin: 0,
          }}
        >
          <dt style={{ color: 'var(--ml-fg-muted)' }}>App version</dt>
          <dd style={{ margin: 0 }} className="ml-mono">
            {snap.app_version}
          </dd>
          <dt style={{ color: 'var(--ml-fg-muted)' }}>Engine state</dt>
          <dd style={{ margin: 0 }}>{snap.engine_state}</dd>
          <dt style={{ color: 'var(--ml-fg-muted)' }}>Sink</dt>
          <dd style={{ margin: 0 }}>
            {snap.sink.backend} · {snap.sink.installed ? 'detected' : 'not installed'}
          </dd>
          <dt style={{ color: 'var(--ml-fg-muted)' }}>OS</dt>
          <dd style={{ margin: 0 }}>
            {snap.os.family} ({snap.os.arch})
          </dd>
          <dt style={{ color: 'var(--ml-fg-muted)' }}>Devices</dt>
          <dd style={{ margin: 0 }}>{snap.input_devices.length}</dd>
        </dl>
      )}
    </Section>
  );
}

function AboutSection() {
  return (
    <Section title="About">
      <p style={{ fontSize: 12.5, color: 'var(--ml-fg)' }}>
        MicLayer — free, open-source microphone tuning for Windows. All processing happens locally.
        No accounts, no telemetry, no cloud.
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)', marginTop: 8 }}>
        Built on Tauri, React, Rust, cpal, and nnnoiseless. VB-CABLE is a free third-party driver
        we use as the MVP sink; you can install it from inside the app, and we never redistribute
        their files ourselves.
      </p>
    </Section>
  );
}
