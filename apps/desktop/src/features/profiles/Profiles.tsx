// Profiles — list + detail panel. From the Claude Design handoff.

import { useState } from 'react';
import { Plus, Star, Save } from 'lucide-react';

import {
  profileApply,
  profileDelete,
  profileDuplicate,
  profileRename,
  profileSave,
  profileSetDefault,
  exportProfileViaDialog,
  importProfileViaDialog,
  type Profile,
} from '../../ipc/profiles';
import { useAppStore } from '../../state/useAppStore';
import { useProfilesBridge } from '../../state/useProfilesBridge';

export function Profiles() {
  const refresh = useProfilesBridge();
  const { builtins, users, activeProfileId, defaultProfileId, dirty, modules, setActiveProfile } =
    useAppStore((s) => ({
      builtins: s.profiles.builtins,
      users: s.profiles.users,
      activeProfileId: s.profiles.activeProfileId,
      defaultProfileId: s.profiles.defaultProfileId,
      dirty: s.profiles.dirty,
      modules: s.modules,
      setActiveProfile: s.setActiveProfile,
    }));

  const allProfiles = [...builtins, ...users];
  const initial = activeProfileId ?? builtins[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const selected = allProfiles.find((p) => p.id === selectedId) ?? builtins[0] ?? null;
  const isBuiltIn = selected ? builtins.some((p) => p.id === selected.id) : false;

  const onApply = async (id: string) => {
    if (dirty && id !== activeProfileId) {
      const ok = window.confirm(
        'You have unsaved tweaks. Switching profile will discard them. Continue?',
      );
      if (!ok) return;
    }
    try {
      const p = await profileApply(id);
      setActiveProfile(p);
      setSelectedId(p.id);
    } catch (e) {
      console.error(e);
    }
  };

  const onDuplicate = async (p: Profile) => {
    const name = window.prompt('Name for the new profile?', `${p.name} copy`);
    if (!name) return;
    try {
      await profileDuplicate(p.id, name);
      await refresh();
    } catch (e) {
      console.error(e);
    }
  };
  const onRename = async (p: Profile) => {
    const name = window.prompt('New name?', p.name);
    if (!name || name === p.name) return;
    try {
      await profileRename(p.id, name);
      await refresh();
    } catch (e) {
      console.error(e);
    }
  };
  const onDelete = async (p: Profile) => {
    if (!window.confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await profileDelete(p.id);
      await refresh();
      if (selectedId === p.id) setSelectedId(builtins[0]?.id ?? null);
    } catch (e) {
      console.error(e);
    }
  };
  const onSetDefault = async (p: Profile | null) => {
    try {
      await profileSetDefault(p ? p.id : null);
      await refresh();
    } catch (e) {
      console.error(e);
    }
  };
  const onImport = async () => {
    try {
      const p = await importProfileViaDialog();
      if (p) {
        await refresh();
        setSelectedId(p.id);
      }
    } catch (e) {
      console.error(e);
      window.alert('Could not import that file.');
    }
  };
  const onExport = async (p: Profile) => {
    try {
      await exportProfileViaDialog(p);
    } catch (e) {
      console.error(e);
    }
  };
  const onSaveTweaks = async () => {
    const name = window.prompt('Name for the new profile?', 'My profile');
    if (!name) return;
    const profile: Profile = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name: name.trim(),
      kind: 'user',
      modules,
    };
    try {
      const saved = await profileSave(profile);
      await refresh();
      setSelectedId(saved.id);
      setActiveProfile(saved);
    } catch (e) {
      console.error(e);
    }
  };

  // Save the dirty editor state into the currently-active user profile,
  // overwriting it in place. Only enabled when the active profile is a
  // user profile (built-ins are read-only).
  const onSaveChanges = async () => {
    const active = [...builtins, ...users].find((p) => p.id === activeProfileId);
    if (!active || active.kind !== 'user') return;
    const updated: Profile = { ...active, modules };
    try {
      const saved = await profileSave(updated);
      await refresh();
      setActiveProfile(saved);
    } catch (e) {
      console.error(e);
      window.alert(`Couldn't save: ${e}`);
    }
  };

  const activeProfile = [...builtins, ...users].find((p) => p.id === activeProfileId);
  const canSaveInPlace = dirty && activeProfile && activeProfile.kind === 'user';

  return (
    <div className="ml-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="ml-page-head">
        <div>
          <div className="ml-page-title">Profiles</div>
          <div className="ml-page-sub">Saved tunes you can switch between instantly.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canSaveInPlace && (
            <button type="button" className="ml-btn primary" onClick={onSaveChanges}>
              <Save size={12} /> Save changes
            </button>
          )}
          {dirty && (
            <button type="button" className="ml-btn" onClick={onSaveTweaks}>
              <Plus size={12} /> Save tweaks as new
            </button>
          )}
          <button type="button" className="ml-btn" onClick={onImport}>
            <Plus size={12} /> Import…
          </button>
        </div>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 12, flex: 1, minHeight: 0 }}
      >
        <div className="ml-card" style={{ padding: '6px 0', overflow: 'auto' }}>
          <GroupHeader label="Built-in" count={builtins.length} />
          {builtins.map((p) => (
            <ProfileRow
              key={p.id}
              p={p}
              isActive={p.id === activeProfileId}
              isDefault={p.id === defaultProfileId}
              selected={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
          <GroupHeader label="Your profiles" count={users.length} />
          {users.length === 0 ? (
            <div
              style={{
                padding: '12px 18px',
                fontSize: 12,
                color: 'var(--ml-fg-muted)',
              }}
            >
              Duplicate a built-in to make your own.
            </div>
          ) : (
            users.map((p) => (
              <ProfileRow
                key={p.id}
                p={p}
                isActive={p.id === activeProfileId}
                isDefault={p.id === defaultProfileId}
                selected={p.id === selectedId}
                onClick={() => setSelectedId(p.id)}
              />
            ))
          )}
        </div>

        <div
          className="ml-card"
          style={{ padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: '-0.015em',
                      marginBottom: 4,
                    }}
                  >
                    {selected.name}
                    {selected.id === activeProfileId && (
                      <span
                        className="ml-pill good"
                        style={{ marginLeft: 10, fontSize: 10, padding: '2px 8px' }}
                      >
                        <span className="ml-dot" /> Active
                      </span>
                    )}
                  </div>
                  {selected.notes && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ml-fg-muted)',
                        lineHeight: 1.55,
                      }}
                    >
                      {selected.notes}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="ml-pill">{isBuiltIn ? 'Built-in' : 'Custom'}</span>
                {selected.id === defaultProfileId && (
                  <span className="ml-pill good">
                    <Star size={11} /> Default
                  </span>
                )}
              </div>

              <div>
                <div className="ml-eyebrow" style={{ marginBottom: 8 }}>
                  Chain summary
                </div>
                <ChainSummary profile={selected} />
              </div>

              <div style={{ flex: 1 }} />

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  borderTop: '1px solid var(--ml-border)',
                  paddingTop: 14,
                  marginLeft: -22,
                  marginRight: -22,
                  paddingLeft: 22,
                  paddingRight: 22,
                }}
              >
                <button
                  type="button"
                  className={'ml-btn ' + (selected.id !== activeProfileId ? 'primary' : '')}
                  style={{ flex: '1 1 auto', justifyContent: 'center' }}
                  onClick={() => onApply(selected.id)}
                  disabled={selected.id === activeProfileId && !dirty}
                >
                  {selected.id === activeProfileId && !dirty ? 'In use' : 'Use this'}
                </button>
                <button type="button" className="ml-btn" onClick={() => onDuplicate(selected)}>
                  Duplicate
                </button>
                <button type="button" className="ml-btn ghost" onClick={() => onExport(selected)}>
                  Export
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  fontSize: 11.5,
                  color: 'var(--ml-fg-muted)',
                }}
              >
                {selected.id === defaultProfileId ? (
                  <LinkButton onClick={() => onSetDefault(null)}>Clear default</LinkButton>
                ) : (
                  <LinkButton onClick={() => onSetDefault(selected)}>Set as default</LinkButton>
                )}
                {!isBuiltIn && (
                  <>
                    <span>·</span>
                    <LinkButton onClick={() => onRename(selected)}>Rename</LinkButton>
                    <span>·</span>
                    <LinkButton onClick={() => onDelete(selected)} danger>
                      Delete
                    </LinkButton>
                  </>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>Select a profile to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px 6px',
        fontSize: 10.5,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--ml-fg-faint)',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          background: 'var(--ml-surface-2)',
          borderRadius: 999,
          padding: '0 6px',
          fontSize: 10,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function ProfileRow({
  p,
  isActive,
  isDefault,
  selected,
  onClick,
}: {
  p: Profile;
  isActive: boolean;
  isDefault: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        background: selected ? 'var(--ml-accent-soft)' : 'transparent',
        borderLeft: selected ? '2px solid var(--ml-accent)' : '2px solid transparent',
        cursor: 'pointer',
        width: '100%',
        border: 0,
        borderRight: 0,
        borderTop: 0,
        borderBottom: 0,
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isActive ? 'var(--ml-good)' : 'transparent',
          border: isActive ? 'none' : '1.5px solid var(--ml-border-strong)',
          flex: '0 0 8px',
        }}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
          {isDefault && <Star size={11} style={{ color: 'var(--ml-warn)' }} />}
          {isActive && (
            <span style={{ fontSize: 10, color: 'var(--ml-good)', fontWeight: 500 }}>· in use</span>
          )}
        </div>
        {p.notes && (
          <div
            title={p.notes}
            style={{
              fontSize: 11,
              color: 'var(--ml-fg-muted)',
              lineHeight: 1.4,
              marginTop: 2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {p.notes}
          </div>
        )}
      </div>
    </button>
  );
}

function ChainSummary({ profile }: { profile: Profile }) {
  const m = profile.modules;
  const rows: [string, string][] = [
    ['High-pass', m.highPass.enabled ? `${m.highPass.params.mode}, order ${m.highPass.params.order}` : 'off'],
    [
      'Noise suppression',
      m.noiseSuppression.enabled
        ? `${Math.round(m.noiseSuppression.params.amount * 100)}%`
        : 'off',
    ],
    ['Gate', m.gate.enabled ? `${m.gate.params.thresholdDb.toFixed(0)} dB` : 'off'],
    ['EQ', m.eq.enabled ? `${m.eq.params.bands.filter((b) => b.enabled).length} bands` : 'off'],
    [
      'Compressor',
      m.compressor.enabled
        ? `${m.compressor.params.ratio.toFixed(1)}:1 @ ${m.compressor.params.thresholdDb.toFixed(0)} dB`
        : 'off',
    ],
    [
      'De-esser',
      m.deEsser.enabled ? `${m.deEsser.params.amountDb.toFixed(0)} dB @ ${m.deEsser.params.targetHz} Hz` : 'off',
    ],
    ['Limiter', m.limiter.enabled ? `${m.limiter.params.ceilingDb.toFixed(1)} dBFS` : 'off'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: 12,
            gap: 12,
          }}
        >
          <span style={{ color: 'var(--ml-fg-muted)' }}>{label}</span>
          <span className="ml-mono" style={{ fontSize: 11.5, color: 'var(--ml-fg)' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LinkButton({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        font: 'inherit',
        fontSize: 11.5,
        color: danger ? 'var(--ml-bad)' : 'var(--ml-accent)',
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
      }}
    >
      {children}
    </button>
  );
}
