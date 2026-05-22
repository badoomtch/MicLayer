// Typed wrappers around Tauri's `listen`. The engine emits one stream of
// events on the channel name `engine`, discriminated by `kind`.

import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type EngineEvent =
  | { kind: 'engine.status'; status: EngineStatusValue; reason: string | null }
  | { kind: 'engine.meters'; inputPeakDb: number; inputRmsDb: number; outputPeakDb: number; outputRmsDb: number; clipping: boolean; noiseFloorDb: number }
  | { kind: 'engine.clip' }
  | { kind: 'engine.error'; id: EngineErrorId; detail?: Record<string, string | number | boolean> }
  | { kind: 'engine.device' };

export type EngineStatusValue = 'stopped' | 'starting' | 'running' | 'stopping' | 'faulted';

export type EngineErrorId =
  | 'engine.input.no_device'
  | 'engine.input.device_missing'
  | 'engine.input.device_busy_exclusive'
  | 'engine.input.permission_denied'
  | 'engine.input.sample_rate_mismatch'
  | 'engine.input.open_failed'
  | 'engine.input.stream_error'
  | 'engine.sink.missing'
  | 'engine.sink.write_failure'
  | 'engine.sink.format_unsupported'
  | 'engine.dsp.panic';

export async function onEngineEvent(
  handler: (event: EngineEvent) => void,
): Promise<UnlistenFn> {
  return listen<EngineEvent>('engine', (e) => handler(e.payload));
}
