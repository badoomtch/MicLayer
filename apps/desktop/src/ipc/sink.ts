// Sink + virtual-mic backend types and helpers.

import { invoke } from '@tauri-apps/api/core';

export interface SinkFormat {
  sample_rate_hz: number;
  channels: number;
}

export interface SinkStatus {
  backend: string;
  installed: boolean;
  active: boolean;
  windows_facing_name: string | null;
  format: SinkFormat | null;
}

export function engineSinkStatus(): Promise<SinkStatus> {
  return invoke('engine_sink_status');
}

export const VB_CABLE_DOWNLOAD_URL = 'https://vb-audio.com/Cable/';
