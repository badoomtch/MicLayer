// Reactive engine autostart. The previous snapshot-time autostart was
// fragile — a single thrown error and the UI was stuck with no recovery
// path. This hook watches engine.status + selectedDeviceId and starts
// the engine whenever it's stopped/faulted *and* a device is selected.
//
// Failures land in `engine.lastStartError`, which the Dashboard surfaces
// as a banner with a Retry button. Once a start fails, we do NOT
// auto-retry on the same status edge — the user has to acknowledge it
// (or change the device, or transition status). This avoids tight
// retry loops when the engine can't start for a structural reason
// (no compatible audio device, sink permanently borked, etc).

import { useEffect, useRef } from 'react';

import { engineStart } from '../ipc/commands';
import { useAppStore } from './useAppStore';

export function useEngineAutostart() {
  const status = useAppStore((s) => s.engine.status);
  const deviceId = useAppStore((s) => s.engine.selectedDeviceId);
  const lastStartError = useAppStore((s) => s.engine.lastStartError);
  const bridgeReady = useAppStore((s) => s.engine.bridgeReady);
  // The hook does not subscribe to action references — pulled via getState.

  // Token so we don't fire multiple overlapping engineStart calls when
  // the user rapidly toggles things, and so we know whether a stale
  // attempt is still resolving when status changes.
  const inflight = useRef(false);

  useEffect(() => {
    // Wait for useEngineBridge to finish its initial snapshot + device
    // selection + select_input. Without this gate we race the bridge
    // and engine_start is called before the Rust controller knows
    // which input device to use → InputNoDevice fault and a
    // misleading "Engine couldn't start" banner that goes away on
    // manual retry. See useEngineBridge for where this flips to true.
    if (!bridgeReady) return;
    // Already running, or transitioning — nothing to do.
    if (status === 'running' || status === 'starting' || status === 'stopping') return;
    // No mic — DeviceSelector will let the user pick one, then this
    // hook will fire automatically when selectedDeviceId becomes set.
    if (!deviceId) return;
    // A previous attempt failed and the user hasn't dismissed the error.
    // Don't loop — they'll click Retry on the banner.
    if (lastStartError) return;
    if (inflight.current) return;

    inflight.current = true;
    (async () => {
      try {
        await engineStart();
        useAppStore.getState().setLastStartError(null);
      } catch (e) {
        console.error('auto-start engine failed', e);
        useAppStore.getState().setLastStartError(
          typeof e === 'string' ? e : e instanceof Error ? e.message : String(e),
        );
      } finally {
        inflight.current = false;
      }
    })();
  }, [status, deviceId, lastStartError, bridgeReady]);
}
