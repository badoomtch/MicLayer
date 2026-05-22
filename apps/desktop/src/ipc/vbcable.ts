// Typed wrapper for the VB-CABLE bootstrap installer.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type InstallStage = 'downloading' | 'extracting' | 'installing' | 'done' | 'failed';

export interface InstallProgress {
  stage: InstallStage;
  percent: number;
  message: string;
}

/// Kicks off the install. The promise resolves when the installer process
/// exits successfully (or rejects with the error message). Progress events
/// are emitted on the `vbcable:progress` channel — subscribe via
/// `onVbCableProgress` to drive a progress UI.
export function vbcableInstall(): Promise<void> {
  return invoke('vbcable_install');
}

export async function onVbCableProgress(
  handler: (p: InstallProgress) => void,
): Promise<UnlistenFn> {
  return listen<InstallProgress>('vbcable:progress', (e) => handler(e.payload));
}
