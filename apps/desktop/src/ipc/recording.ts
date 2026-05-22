// Typed wrappers for the recording commands.

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';

export interface RecordingHandle {
  raw_path: string;
  processed_path: string;
  saved: boolean;
}

export function recordingStart(): Promise<RecordingHandle> {
  return invoke('recording_start');
}

export function recordingStop(): Promise<RecordingHandle | null> {
  return invoke('recording_stop');
}

export function recordingActive(): Promise<boolean> {
  return invoke('recording_active');
}

export function recordingDiscard(rawPath: string): Promise<boolean> {
  return invoke('recording_discard', { rawPath });
}

export interface SavedRecordingPaths {
  raw: string;
  processed: string;
}

export function recordingSave(
  rawPath: string,
  destDir: string,
  name: string,
): Promise<SavedRecordingPaths> {
  return invoke('recording_save', { rawPath, destDir, name });
}

/// Convert a WAV file path to a URL the <audio> element can load.
/// Tauri 2's `convertFileSrc` translates a filesystem path to either
/// `asset://` (mac/linux) or `http://asset.localhost/...` (windows).
export function recordingPlaybackUrl(path: string): string {
  return convertFileSrc(path);
}

/// Pop a Save-As dialog asking the user where to keep the recording,
/// then copy both WAVs there with the chosen base name.
export async function saveRecordingViaDialog(
  rawPath: string,
  defaultName = 'miclayer-test',
): Promise<SavedRecordingPaths | null> {
  // Ask for a representative path — the backend will derive both raw + tuned
  // filenames from the directory + base name.
  const dest = await saveDialog({
    defaultPath: `${defaultName}.wav`,
    filters: [{ name: 'WAV files', extensions: ['wav'] }],
  });
  if (!dest || typeof dest !== 'string') return null;

  // Split into dir + base. dest looks like "C:\path\to\file.wav".
  const lastSep = Math.max(dest.lastIndexOf('\\'), dest.lastIndexOf('/'));
  const destDir = lastSep >= 0 ? dest.slice(0, lastSep) : '.';
  const filename = lastSep >= 0 ? dest.slice(lastSep + 1) : dest;
  const baseName = filename.replace(/\.wav$/i, '') || defaultName;

  return recordingSave(rawPath, destDir, baseName);
}

/// Reference: makes the import-dialog visible even though we don't use it
/// from this module. Kept so callers can lazy-import a single namespace.
export const _openDialog = openDialog;
