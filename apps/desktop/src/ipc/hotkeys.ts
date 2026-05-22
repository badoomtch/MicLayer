// Typed wrappers for the hotkeys + autostart commands.

import { invoke } from '@tauri-apps/api/core';
import { isEnabled as autostartIsEnabled, enable as autostartEnable, disable as autostartDisable } from '@tauri-apps/plugin-autostart';

export interface HotkeyMap {
  mute_toggle: string | null;
  raw_toggle: string | null;
  next_profile: string | null;
  prev_profile: string | null;
  show_hide: string | null;
}

export function hotkeysGet(): Promise<HotkeyMap> {
  return invoke('hotkeys_get');
}

export function hotkeysSet(map: HotkeyMap): Promise<void> {
  return invoke('hotkeys_set', { map });
}

export const autostart = {
  isEnabled: autostartIsEnabled,
  enable: autostartEnable,
  disable: autostartDisable,
};
