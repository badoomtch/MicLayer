// Profile picker — sidebar control. Shows the active profile name,
// a dirty marker, and opens a dropdown listing all profiles. Styled
// to match the sidebar (no floating pill on the title bar).

import { useRef, useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';

import { useAppStore } from '../state/useAppStore';
import { profileApply } from '../ipc/profiles';
import { useClickOutside } from './useClickOutside';

export function ProfilePicker() {
  const { builtins, users, activeProfileId, dirty, setActiveProfile } = useAppStore((s) => ({
    builtins: s.profiles.builtins,
    users: s.profiles.users,
    activeProfileId: s.profiles.activeProfileId,
    dirty: s.profiles.dirty,
    setActiveProfile: s.setActiveProfile,
  }));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false), open);
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
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={allEmpty}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: open ? 'var(--ml-surface-hover)' : 'transparent',
          border: 0,
          borderRadius: 6,
          padding: '8px 10px',
          color: 'var(--ml-fg)',
          cursor: allEmpty ? 'not-allowed' : 'pointer',
          font: 'inherit',
          textAlign: 'left',
          transition: 'background var(--ml-dur-1)',
        }}
        title="Switch active profile"
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ml-fg-faint)',
              marginBottom: 2,
            }}
          >
            Profile
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {active?.name ?? '—'}
            </span>
            {dirty && (
              <span
                style={{ fontSize: 10, color: 'var(--ml-warn)', flex: '0 0 auto' }}
                title="Unsaved tweaks"
              >
                · edited
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--ml-fg-muted)', flex: '0 0 14px' }} />
      </button>

      {open && (
        <div
          className="ml-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            boxShadow: 'var(--ml-shadow-2)',
            padding: 4,
            maxHeight: 360,
            overflowY: 'auto',
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
