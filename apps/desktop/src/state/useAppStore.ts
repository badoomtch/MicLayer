// UI store. Theme + last section persist to localStorage; engine state is
// authoritative from the running engine and is hydrated from engine events.
// Profile modules are an in-memory editor state that the UI mutates with
// sliders; an effect hook pushes them to the engine on debounce.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { ProfileModules } from '@miclayer/shared';

import type { AudioDeviceSummary } from '../ipc/commands';
import type { EngineStatusValue } from '../ipc/events';
import type { Profile } from '../ipc/profiles';
import { NEUTRAL_MODULES } from './defaultProfile';

export type ThemeChoice = 'dark' | 'medium' | 'light' | 'system';
export type SectionId = 'dashboard' | 'tune' | 'profiles' | 'settings';

export interface UiState {
  theme: ThemeChoice;
  section: SectionId;
  advancedDefault: boolean;
}

export interface Meters {
  inputPeakDb: number;
  inputRmsDb: number;
  outputPeakDb: number;
  outputRmsDb: number;
  clipping: boolean;
  noiseFloorDb: number;
}

export interface EngineSnapshotState {
  status: EngineStatusValue;
  raw: boolean;
  muted: boolean;
  selectedDeviceId: string | null;
  activeProfileName: string;
  sinkBackend: 'vb-cable' | 'miclayer-wdm' | null;
  lastErrorId: string | null;
  /// Human-readable error from the most recent engine_start attempt.
  /// Cleared when the engine successfully transitions to running, or
  /// when the user dismisses it via the Dashboard banner.
  lastStartError: string | null;
  meters: Meters;
}

export interface ProfilesState {
  builtins: Profile[];
  users: Profile[];
  activeProfileId: string | null;
  defaultProfileId: string | null;
  /// Editor differs from the active profile (the user has tweaked sliders).
  dirty: boolean;
}

export interface AppState {
  ui: UiState;
  engine: EngineSnapshotState;
  devices: AudioDeviceSummary[];
  modules: ProfileModules;
  profiles: ProfilesState;

  setTheme: (t: ThemeChoice) => void;
  setSection: (s: SectionId) => void;
  setRaw: (r: boolean) => void;
  setMuted: (m: boolean) => void;
  setAdvancedDefault: (v: boolean) => void;
  setDevices: (d: AudioDeviceSummary[]) => void;
  setSelectedDeviceId: (id: string | null) => void;
  setEngineStatus: (s: EngineStatusValue) => void;
  setMeters: (m: Meters) => void;
  setLastErrorId: (id: string | null) => void;
  setLastStartError: (msg: string | null) => void;

  setModules: (m: ProfileModules) => void;
  updateModule: <K extends keyof ProfileModules>(key: K, value: ProfileModules[K]) => void;

  setProfilesListing: (
    builtins: Profile[],
    users: Profile[],
    activeProfileId: string | null,
    defaultProfileId: string | null,
  ) => void;
  setActiveProfile: (profile: Profile) => void;
  markDirty: (dirty: boolean) => void;
}

const SILENT_METERS: Meters = {
  inputPeakDb: -120,
  inputRmsDb: -120,
  outputPeakDb: -120,
  outputRmsDb: -120,
  clipping: false,
  noiseFloorDb: -120,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ui: { theme: 'dark', section: 'dashboard', advancedDefault: false },
      engine: {
        status: 'stopped',
        raw: false,
        muted: false,
        selectedDeviceId: null,
        activeProfileName: 'Natural',
        sinkBackend: null,
        lastErrorId: null,
        lastStartError: null,
        meters: SILENT_METERS,
      },
      devices: [],
      modules: NEUTRAL_MODULES,
      profiles: {
        builtins: [],
        users: [],
        activeProfileId: null,
        defaultProfileId: null,
        dirty: false,
      },

      setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),
      setSection: (section) => set((s) => ({ ui: { ...s.ui, section } })),
      setRaw: (raw) => set((s) => ({ engine: { ...s.engine, raw } })),
      setMuted: (muted) => set((s) => ({ engine: { ...s.engine, muted } })),
      setAdvancedDefault: (advancedDefault) =>
        set((s) => ({ ui: { ...s.ui, advancedDefault } })),
      setDevices: (devices) => set({ devices }),
      setSelectedDeviceId: (selectedDeviceId) =>
        set((s) => ({ engine: { ...s.engine, selectedDeviceId } })),
      setEngineStatus: (status) =>
        set((s) => ({ engine: { ...s.engine, status } })),
      setMeters: (meters) => set((s) => ({ engine: { ...s.engine, meters } })),
      setLastErrorId: (lastErrorId) =>
        set((s) => ({ engine: { ...s.engine, lastErrorId } })),
      setLastStartError: (lastStartError) =>
        set((s) => ({ engine: { ...s.engine, lastStartError } })),

      setModules: (modules) => set({ modules }),
      updateModule: (key, value) =>
        set((s) => ({
          modules: { ...s.modules, [key]: value },
          // User tweaked something — diverged from the applied profile.
          profiles: { ...s.profiles, dirty: true },
        })),

      setProfilesListing: (builtins, users, activeProfileId, defaultProfileId) =>
        set((s) => ({
          profiles: {
            ...s.profiles,
            builtins,
            users,
            activeProfileId,
            defaultProfileId,
          },
        })),
      setActiveProfile: (profile) =>
        set((s) => ({
          modules: profile.modules,
          engine: { ...s.engine, activeProfileName: profile.name },
          profiles: {
            ...s.profiles,
            activeProfileId: profile.id,
            dirty: false,
          },
        })),
      markDirty: (dirty) =>
        set((s) => ({ profiles: { ...s.profiles, dirty } })),
    }),
    {
      name: 'miclayer.ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        ui: s.ui,
        engine: {
          status: 'stopped' as EngineStatusValue,
          raw: false,
          muted: false,
          selectedDeviceId: s.engine.selectedDeviceId,
          activeProfileName: s.engine.activeProfileName,
          sinkBackend: null,
          lastErrorId: null,
          lastStartError: null,
          meters: SILENT_METERS,
        },
        // Modules persist so the user's tweaks survive an app restart
        // even before the profile system lands in M4.
        modules: s.modules,
      }),
      version: 2,
    },
  ),
);
