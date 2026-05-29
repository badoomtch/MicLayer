// Sidebar — nav above, footer (raw/tuned, engine status, mute) below.
// Replaces the separate top-level Footer component.

import {
  LayoutDashboard,
  Sliders,
  FileText,
  Settings as SettingsIcon,
  Mic,
  MicOff,
  type LucideIcon,
} from 'lucide-react';

import { useAppStore, type SectionId } from '../state/useAppStore';
import { engineSetMuted, engineSetRaw } from '../ipc/commands';
import { SegmentedToggle } from '../shared/SegmentedToggle';

const items: { id: SectionId; label: string; Icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'tune', label: 'Tune', Icon: Sliders },
  { id: 'profiles', label: 'Profiles', Icon: FileText },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

const engineLabel: Record<string, { label: string; varName: string }> = {
  stopped: { label: 'Stopped', varName: '--ml-fg-faint' },
  starting: { label: 'Starting…', varName: '--ml-warn' },
  running: { label: 'Running', varName: '--ml-good' },
  stopping: { label: 'Stopping…', varName: '--ml-fg-faint' },
  faulted: { label: 'Faulted', varName: '--ml-bad' },
};

export function Sidebar() {
  const { section, setSection, status, raw, muted, setRaw, setMuted } = useAppStore((s) => ({
    section: s.ui.section,
    setSection: s.setSection,
    status: s.engine.status,
    raw: s.engine.raw,
    muted: s.engine.muted,
    setRaw: s.setRaw,
    setMuted: s.setMuted,
  }));

  const eng = engineLabel[status] ?? engineLabel.stopped!;

  const toggleRaw = async (v: 'raw' | 'tuned') => {
    const next = v === 'raw';
    setRaw(next);
    try {
      await engineSetRaw(next);
    } catch (e) {
      console.error('engine_set_raw failed', e);
    }
  };

  const toggleMute = async (next: boolean) => {
    setMuted(next);
    try {
      await engineSetMuted(next);
    } catch (e) {
      console.error('engine_set_muted failed', e);
    }
  };

  return (
    <nav className="ml-sidebar">
      <div className="ml-nav">
        {items.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={'ml-nav-item' + (section === id ? ' active' : '')}
            onClick={() => setSection(id)}
          >
            <span className="ml-nav-icon">
              <Icon size={16} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="ml-footer">
        <div style={{ width: '100%' }}>
          <SegmentedToggle
            options={[
              { value: 'tuned', label: 'Tuned' },
              { value: 'raw', label: 'Raw' },
            ]}
            value={raw ? 'raw' : 'tuned'}
            onChange={toggleRaw}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="ml-dot" style={{ background: `var(${eng.varName})` }} />
            <span style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)', fontWeight: 500 }}>
              {eng.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => toggleMute(!muted)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute (click to pass audio)' : 'Mute (silence the virtual mic)'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: '1px solid ' + (muted ? 'color-mix(in oklch, var(--ml-bad) 35%, transparent)' : 'var(--ml-border)'),
              background: muted ? 'color-mix(in oklch, var(--ml-bad) 12%, transparent)' : 'transparent',
              color: muted ? 'var(--ml-bad)' : 'var(--ml-fg-muted)',
              borderRadius: 'var(--ml-r-pill)',
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
              font: 'inherit',
              transition: 'background var(--ml-dur-1), color var(--ml-dur-1), border-color var(--ml-dur-1)',
            }}
          >
            {muted ? <MicOff size={12} /> : <Mic size={12} />}
            {muted ? 'Muted' : 'Mute'}
          </button>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ml-fg-faint)',
            textAlign: 'center',
            paddingBottom: 2,
          }}
        >
          v0.5 · pre-alpha
        </div>
      </div>
    </nav>
  );
}
