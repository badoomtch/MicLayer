// Typed wrappers around Tauri's `invoke`. One named export per command.

import { invoke } from '@tauri-apps/api/core';
import type { ProfileModules } from '@miclayer/shared';

export interface AudioDeviceSummary {
  id: string;
  name: string;
  is_default_communications: boolean;
  is_default_console: boolean;
  supported_formats: { sample_rate_hz: number; channels: number }[];
  default_sample_rate_hz: number | null;
  default_channels: number | null;
}

export interface EngineSnapshot {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'faulted';
  selectedDeviceId: string | null;
  muted: boolean;
  raw: boolean;
}

export function appVersion(): Promise<string> {
  return invoke('app_version');
}

export function engineListDevices(): Promise<AudioDeviceSummary[]> {
  return invoke('engine_list_devices');
}

export function engineSelectInput(deviceId: string): Promise<void> {
  return invoke('engine_select_input', { deviceId });
}

export function engineStart(): Promise<void> {
  return invoke('engine_start');
}

export function engineStop(): Promise<void> {
  return invoke('engine_stop');
}

export function engineSetMuted(muted: boolean): Promise<void> {
  return invoke('engine_set_muted', { muted });
}

export function engineSetRaw(raw: boolean): Promise<void> {
  return invoke('engine_set_raw', { raw });
}

export function engineSnapshot(): Promise<EngineSnapshot> {
  return invoke('engine_snapshot');
}

export function engineApplyProfile(modules: ProfileModules): Promise<void> {
  return invoke('engine_apply_profile', { modules });
}

export function engineCurrentProfile(): Promise<ProfileModules> {
  return invoke('engine_current_profile');
}
