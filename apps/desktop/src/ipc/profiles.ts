// Typed wrappers for profile commands.

import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import type { ProfileModules } from '@miclayer/shared';

export type ProfileKind = 'builtin' | 'user';

export interface Profile {
  schemaVersion: 1;
  id: string;
  name: string;
  author?: string;
  kind: ProfileKind;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  modules: ProfileModules;
}

export interface AppConfig {
  defaultProfileId: string | null;
  activeProfileId: string | null;
}

export interface ProfileListing {
  builtins: Profile[];
  users: Profile[];
  config: AppConfig;
}

export function profileList(): Promise<ProfileListing> {
  return invoke('profile_list');
}

export function profileGet(id: string): Promise<Profile> {
  return invoke('profile_get', { id });
}

export function profileApply(id: string): Promise<Profile> {
  return invoke('profile_apply', { id });
}

export function profileSave(profile: Profile): Promise<Profile> {
  return invoke('profile_save', { profile });
}

export function profileDuplicate(fromId: string, newName: string): Promise<Profile> {
  return invoke('profile_duplicate', { fromId, newName });
}

export function profileDelete(id: string): Promise<void> {
  return invoke('profile_delete', { id });
}

export function profileRename(id: string, newName: string): Promise<Profile> {
  return invoke('profile_rename', { id, newName });
}

export function profileSetDefault(id: string | null): Promise<void> {
  return invoke('profile_set_default', { id });
}

export function profileImportJson(json: string): Promise<Profile> {
  return invoke('profile_import_json', { json });
}

export function profileExportJson(id: string): Promise<string> {
  return invoke('profile_export_json', { id });
}

export function profileImportFile(path: string): Promise<Profile> {
  return invoke('profile_import_file', { path });
}

export function profileExportFile(id: string, path: string): Promise<void> {
  return invoke('profile_export_file', { id, path });
}

// ── Higher-level helpers that combine commands with the dialog plugin ──

/// Open a file picker; on selection, backend reads and imports the file.
export async function importProfileViaDialog(): Promise<Profile | null> {
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'MicLayer profile', extensions: ['json'] }],
  });
  if (!picked || typeof picked !== 'string') return null;
  return profileImportFile(picked);
}

/// Save-as dialog → backend writes the profile to the chosen path.
/// Returns the chosen path, or null if the user cancelled.
export async function exportProfileViaDialog(profile: Profile): Promise<string | null> {
  const slug = profile.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const dest = await saveDialog({
    defaultPath: `${slug}.miclayer.json`,
    filters: [{ name: 'MicLayer profile', extensions: ['json'] }],
  });
  if (!dest || typeof dest !== 'string') return null;
  await profileExportFile(profile.id, dest);
  return dest;
}
