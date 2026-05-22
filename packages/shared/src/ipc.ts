// IPC contract between the React UI and the Tauri/Rust backend.
// See docs/architecture.md §4.
//
// Commands are typed once here and consumed via thin wrappers on each side.

import type { Profile } from './profile';

// -------- Commands (UI -> Engine) --------

export type EngineCommand =
  | { kind: 'engine.start' }
  | { kind: 'engine.stop' }
  | { kind: 'engine.selectInput'; deviceId: string }
  | { kind: 'engine.setMuted'; muted: boolean }
  | { kind: 'engine.setRaw'; raw: boolean }
  | { kind: 'engine.applyProfile'; profile: Profile }
  | { kind: 'engine.setModuleBypass'; module: ModuleId; bypassed: boolean }
  | { kind: 'engine.recordTest.start' }
  | { kind: 'engine.recordTest.stop' }
  | { kind: 'engine.autotune.run'; phase: AutoTunePhase };

export type ModuleId =
  | 'inputGain'
  | 'highPass'
  | 'noiseSuppression'
  | 'gate'
  | 'eq'
  | 'compressor'
  | 'deEsser'
  | 'limiter'
  | 'outputGain';

export type AutoTunePhase = 'silence' | 'normal' | 'loud' | 'reading';

// -------- Events (Engine -> UI) --------

export type EngineEvent =
  | {
      kind: 'engine.status';
      status: 'stopped' | 'starting' | 'running' | 'stopping' | 'faulted';
      reason?: string;
    }
  | { kind: 'engine.device'; devices: AudioDeviceSummary[] }
  | {
      kind: 'engine.meters';
      inputPeakDb: number;
      inputRmsDb: number;
      outputPeakDb: number;
      outputRmsDb: number;
      clipping: boolean;
      noiseFloorDb: number;
    }
  | { kind: 'engine.gate'; open: boolean }
  | { kind: 'engine.clip' }
  | { kind: 'engine.error'; id: EngineErrorId; detail?: Record<string, string | number | boolean> };

export interface AudioDeviceSummary {
  id: string;
  name: string;
  isDefaultCommunications: boolean;
  isDefaultConsole: boolean;
}

export type EngineErrorId =
  | 'engine.input.no_device'
  | 'engine.input.device_missing'
  | 'engine.input.device_busy_exclusive'
  | 'engine.input.permission_denied'
  | 'engine.input.sample_rate_mismatch'
  | 'engine.sink.missing'
  | 'engine.sink.write_failure'
  | 'engine.sink.format_unsupported'
  | 'engine.dsp.panic'
  | 'engine.config.profile_corrupt'
  | 'engine.hotkey.conflict';
