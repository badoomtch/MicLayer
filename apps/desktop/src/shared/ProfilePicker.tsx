// Top-bar profile picker — a pill that opens a dropdown with all profiles.

import { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';

import { useAppStore } from '../state/useAppStore';
import { profileApply } from '../ipc/profiles';

export function ProfilePicker() {
  const { builtins, users, activeProfileId, dirty, setActiveProfile } = useAppStore((s) => ({
    builtins: s.profiles.builtins,
    users: s.profiles.users,
    activeProfileId: s.profiles.activeProfileId,
    dirty: s.profiles.dirty,
    setActiveProfile: s.setActiveProfile,
  }));
  const [open, setOpen] = useState(false);
  const active = [...builtins, ...users].find((p) => p.id === activeProfileId);

  const onPick = async (id: string) => {
    setOpen(false);
    if (dirty) {
      const ok = window.confirm(
        'You have unsaved tweaks. Switching profile will discard them. Continue?',
      );
      if (!ok) return;
    }
    try {
      const p = await profileApply(id);
      setActiveProfile(p);
    } catch (e) {
      console.error('profile_apply failed', e);
    }
  };

  const allEmpty = builtins.length === 0 && users.length === 0;

  return (
    <div className="ml-no-drag" style={{ position: 'relative' }}>
      <button
        type="button"
        className="ml-pill"
        onClick={() => setOpen((v) => !v)}
        disabled={allEmpty}
        style={{
          background: 'var(--ml-surface-2)',
          borderColor: 'var(--ml-border)',
          color: 'var(--ml-fg)',
          cursor: 'pointer',
          padding: '4px 8px 4px 12px',
        }}
      >
        <span style={{ color: 'var(--ml-fg-muted)', fontWeight: 400, fontSize: 11.5 }}>Profile</span>
        <span style={{ fontWeight: 500 }}>{active?.name ?? '—'}</span>
        {dirty && (
          <span style={{ fontSize: 10, color: 'var(--ml-warn)' }}>· edited</span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          className="ml-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 240,
            maxHeight: 360,
            overflowY: 'auto',
            zIndex: 30,
            boxShadow: 'var(--ml-shadow-2)',
            padding: 4,
          }}
        >
          {builtins.length > 0 && (
            <>
              <div className="ml-eyebrow" style={{ padding: '6px 10px 4px' }}>
                Built-in
              </div>
              {builtins.map((p) => (
                <ProfileRow
                  key={p.id}
                  name={p.name}
                  active={p.id === activeProfileId}
                  onClick={() => onPick(p.id)}
                />
              ))}
            </>
          )}
          {users.length > 0 && (
            <>
              <div className="ml-eyebrow" style={{ padding: '8px 10px 4px' }}>
                Your profiles
              </div>
              {users.map((p) => (
                <ProfileRow
                  key={p.id}
                  name={p.name}
                  active={p.id === activeProfileId}
                  onClick={() => onPick(p.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileRow({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: active ? 'var(--ml-accent-soft)' : 'transparent',
        border: 0,
        borderRadius: 'var(--ml-r-sm)',
        font: 'inherit',
        color: 'var(--ml-fg)',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      <span style={{ flex: 1 }}>{name}</span>
      {active && <Star size={11} style={{ color: 'var(--ml-accent)' }} />}
    </button>
  );
}
