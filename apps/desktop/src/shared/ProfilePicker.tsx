// Top-bar profile picker. Lists every profile (built-ins above user
// profiles), shows the active one, applies on select. If the editor is
// dirty, asks for confirmation before discarding tweaks.

import { useAppStore } from '../state/useAppStore';
import { profileApply } from '../ipc/profiles';

export function ProfilePicker() {
  const { builtins, users, activeProfileId, dirty, setActiveProfile } = useAppStore(
    (s) => ({
      builtins: s.profiles.builtins,
      users: s.profiles.users,
      activeProfileId: s.profiles.activeProfileId,
      dirty: s.profiles.dirty,
      setActiveProfile: s.setActiveProfile,
    }),
  );

  const onChange = async (id: string) => {
    if (!id) return;
    if (dirty) {
      const ok = window.confirm(
        'You have unsaved tweaks. Switching profile will discard them. Continue?',
      );
      if (!ok) return;
    }
    try {
      const profile = await profileApply(id);
      setActiveProfile(profile);
    } catch (e) {
      console.error('profile_apply failed', e);
    }
  };

  const allEmpty = builtins.length === 0 && users.length === 0;
  return (
    <select
      value={activeProfileId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={allEmpty}
      className="rounded-pill border border-muted/30 bg-bg px-3 py-1 text-xs text-fg focus:border-accent focus:outline-none"
      aria-label="Active profile"
    >
      <option value="" disabled>
        {allEmpty ? 'No profiles' : 'Pick a profile…'}
      </option>
      {builtins.length > 0 && (
        <optgroup label="Built-in">
          {builtins.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {dirty && p.id === activeProfileId ? ' • edited' : ''}
            </option>
          ))}
        </optgroup>
      )}
      {users.length > 0 && (
        <optgroup label="Your profiles">
          {users.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {dirty && p.id === activeProfileId ? ' • edited' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
