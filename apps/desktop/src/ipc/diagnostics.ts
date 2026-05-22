// Typed wrappers for diagnostics.

import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

import type { AudioDeviceSummary, EngineSnapshot } from './commands';
import type { SinkStatus } from './sink';

export interface DiagnosticsSnapshot {
  app_version: string;
  engine_state: EngineSnapshot['state'];
  selected_device_id: string | null;
  muted: boolean;
  raw: boolean;
  sink: SinkStatus;
  input_devices: AudioDeviceSummary[];
  active_profile_id: string | null;
  default_profile_id: string | null;
  os: { family: string; arch: string };
  timestamp: string;
}

export function diagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  return invoke('diagnostics_snapshot');
}

export function diagnosticsExport(path: string): Promise<void> {
  return invoke('diagnostics_export', { path });
}

export async function exportDiagnosticsViaDialog(): Promise<string | null> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = await saveDialog({
    defaultPath: `miclayer-diagnostics-${ts}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!dest || typeof dest !== 'string') return null;
  await diagnosticsExport(dest);
  return dest;
}
