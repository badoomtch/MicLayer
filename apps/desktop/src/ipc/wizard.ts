// Typed wrappers for the auto-tune wizard commands.

import { invoke } from '@tauri-apps/api/core';
import type { ProfileModules } from '@miclayer/shared';

export interface PhaseStats {
  peak_db: number;
  rms_db: number;
  noise_floor_db: number;
  low_band_db: number;
  mid_band_db: number;
  high_band_db: number;
  sibilance_ratio_db: number;
  sample_count: number;
}

export interface WizardResult {
  modules: ProfileModules;
  recommendations: string[];
}

export function wizardAnalyze(path: string): Promise<PhaseStats> {
  return invoke('wizard_analyze', { path });
}

export function wizardSynthesize(
  silence: PhaseStats,
  normal: PhaseStats,
  loud: PhaseStats,
): Promise<WizardResult> {
  return invoke('wizard_synthesize', { silence, normal, loud });
}
