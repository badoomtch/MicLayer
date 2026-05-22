// Profiles page. Built-in vs user lists, apply / duplicate / rename / delete
// / export / import / set-default. Built-ins are read-only.

import { useState } from 'react';
import { Star, StarOff, Copy, Trash2, Download, Upload, Check, Save } from 'lucide-react';

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

  const [selectedId, setSelectedId] = useState<string | null>(
    activeProfileId ?? builtins[0]?.id ?? null,
  );
  const selected =
    [...builtins, ...users].find((p) => p.id === selectedId) ?? null;

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
      console.error('profile_apply failed', e);
    }
  };

  const onDuplicate = async (p: Profile) => {
    const name = window.prompt('Name for the new profile?', `${p.name} copy`);
    if (!name) return;
    try {
      await profileDuplicate(p.id, name);
      await refresh();
    } catch (e) {
      console.error('profile_duplicate failed', e);
    }
  };

  const onRename = async (p: Profile) => {
    const name = window.prompt('New name?', p.name);
    if (!name || name === p.name) return;
    try {
      await profileRename(p.id, name);
      await refresh();
    } catch (e) {
      console.error('profile_rename failed', e);
    }
  };

  const onDelete = async (p: Profile) => {
    if (!window.confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await profileDelete(p.id);
      await refresh();
      if (selectedId === p.id) {
        setSelectedId(builtins[0]?.id ?? null);
      }
    } catch (e) {
      console.error('profile_delete failed', e);
    }
  };

  const onSetDefault = async (p: Profile | null) => {
    try {
      await profileSetDefault(p ? p.id : null);
      await refresh();
    } catch (e) {
      console.error('profile_set_default failed', e);
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
      console.error('profile_save (from tweaks) failed', e);
      window.alert(`Couldn't save: ${e}`);
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
      console.error('profile import failed', e);
      window.alert('Could not import that file. It may not be a valid MicLayer profile.');
    }
  };

  const onExport = async (p: Profile) => {
    try {
      const dest = await exportProfileViaDialog(p);
      if (dest) console.log('exported to', dest);
    } catch (e) {
      console.error('profile export failed', e);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[1fr_320px] gap-6">
      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Profiles</h2>
          <div className="flex gap-2">
            {dirty && (
              <button
                type="button"
                onClick={onSaveTweaks}
                className="inline-flex items-center gap-1 rounded-pill bg-accent/15 px-3 py-1 text-xs text-fg hover:bg-accent/25"
                title="Save the current Tune tweaks as a new user profile"
              >
                <Save className="h-3 w-3" /> Save tweaks as new
              </button>
            )}
            <button
              type="button"
              onClick={onImport}
              className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs hover:border-accent/60"
            >
              <Upload className="h-3 w-3" /> Import
            </button>
          </div>
        </header>

        <ProfileGroup
          title="Built-in"
          items={builtins}
          activeProfileId={activeProfileId}
          defaultProfileId={defaultProfileId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="h-3" />
        <ProfileGroup
          title="Your profiles"
          items={users}
          activeProfileId={activeProfileId}
          defaultProfileId={defaultProfileId}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyHint="Duplicate a built-in to make your own."
        />
      </section>

      <aside className="rounded-card border border-surface/60 bg-surface p-4">
        {selected ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-base font-semibold">{selected.name}</h3>
              <p className="text-xs text-muted">
                {selected.kind === 'builtin' ? 'Built-in' : 'Your profile'}
                {selected.author ? ` · ${selected.author}` : ''}
              </p>
            </div>
            {selected.notes && (
              <p className="whitespace-pre-line text-xs text-muted">
                {selected.notes}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onApply(selected.id)}
                disabled={selected.id === activeProfileId && !dirty}
                className={
                  'inline-flex items-center gap-1 rounded-pill px-3 py-1 text-xs ' +
                  (selected.id === activeProfileId && !dirty
                    ? 'bg-meterLow/15 text-meterLow cursor-default'
                    : 'bg-accent/15 text-fg hover:bg-accent/25')
                }
              >
                <Check className="h-3 w-3" />
                {selected.id === activeProfileId && !dirty ? 'Active' : 'Use this'}
              </button>

              <button
                type="button"
                onClick={() => onDuplicate(selected)}
                className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs hover:border-accent/60"
              >
                <Copy className="h-3 w-3" /> Duplicate
              </button>

              <button
                type="button"
                onClick={() => onExport(selected)}
                className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs hover:border-accent/60"
              >
                <Download className="h-3 w-3" /> Export
              </button>

              {selected.kind === 'user' && (
                <>
                  <button
                    type="button"
                    onClick={() => onRename(selected)}
                    className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs hover:border-accent/60"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(selected)}
                    className="inline-flex items-center gap-1 rounded-pill border border-meterHigh/30 px-3 py-1 text-xs text-meterHigh hover:border-meterHigh/60"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </>
              )}

              {defaultProfileId === selected.id ? (
                <button
                  type="button"
                  onClick={() => onSetDefault(null)}
                  className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs"
                  title="Currently the default profile"
                >
                  <StarOff className="h-3 w-3" /> Clear default
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetDefault(selected)}
                  className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs hover:border-accent/60"
                >
                  <Star className="h-3 w-3" /> Set default
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Select a profile to see details.</p>
        )}
      </aside>
    </div>
  );
}

interface ProfileGroupProps {
  title: string;
  items: Profile[];
  activeProfileId: string | null;
  defaultProfileId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint?: string;
}

function ProfileGroup({
  title,
  items,
  activeProfileId,
  defaultProfileId,
  selectedId,
  onSelect,
  emptyHint,
}: ProfileGroupProps) {
  return (
    <div>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{emptyHint ?? 'Nothing here yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((p) => {
            const active = p.id === activeProfileId;
            const def = p.id === defaultProfileId;
            const sel = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={
                    'flex w-full items-center justify-between rounded-card border bg-surface px-4 py-2 text-left text-sm transition-colors ' +
                    (sel
                      ? 'border-accent/60'
                      : 'border-surface/60 hover:border-accent/40')
                  }
                >
                  <span className="flex items-center gap-2">
                    {def && <Star className="h-3 w-3 text-accent" aria-label="default" />}
                    {p.name}
                  </span>
                  {active && (
                    <span className="text-xs text-meterLow">active</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
