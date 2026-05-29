// Subscribes to engine events and pumps them into the Zustand store.
// Mount this once at the app root.

import { useEffect } from 'react';

import { onEngineEvent } from '../ipc/events';
import {
  engineListDevices,
  engineSelectInput,
  engineSnapshot,
} from '../ipc/commands';
import { useAppStore } from './useAppStore';

export function useEngineBridge() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // Snapshot once on mount so the UI shows current state without
      // waiting for the first engine.status event.
      try {
        const snap = await engineSnapshot();
        if (!cancelled) {
          useAppStore.getState().setEngineStatus(snap.state);
          // Only overwrite the persisted selectedDeviceId when the engine
          // actually has one. On cold start the controller is fresh
          // (selected_device_id = null) but the store may have a
          // persisted value from the previous session — we want to keep
          // it and re-assert it on the engine side below.
          if (snap.selectedDeviceId) {
            useAppStore.getState().setSelectedDeviceId(snap.selectedDeviceId);
          }
        }
        const devices = await engineListDevices();
        if (!cancelled) {
          useAppStore.getState().setDevices(devices);
          // Pick a default mic if nothing is selected yet, OR if the
          // persisted selection no longer exists (different machine,
          // mic unplugged). Without this the engine sits in "no input"
          // forever and engine_start returns InputNoDevice. The
          // reactive autostart hook then picks up the new selectedDeviceId.
          const current = useAppStore.getState().engine.selectedDeviceId;
          const currentStillExists = current
            ? devices.some((d) => d.id === current)
            : false;
          if (!current || !currentStillExists) {
            const fallback =
              devices.find((d) => d.is_default_communications) ?? devices[0];
            if (fallback) {
              try {
                await engineSelectInput(fallback.id);
                useAppStore.getState().setSelectedDeviceId(fallback.id);
              } catch (e) {
                console.error('auto-select default device failed', e);
              }
            } else if (current && !currentStillExists) {
              // Clear the stale selection so the autostart hook stops
              // trying to use a device that isn't here.
              useAppStore.getState().setSelectedDeviceId(null);
            }
          } else {
            // Re-assert the selection on the engine side. Snapshot
            // returns the engine's own selected_device_id which can
            // be null on cold start even if the store had a value
            // from a previous session. Without this, engine_start
            // returns InputNoDevice.
            try {
              await engineSelectInput(current);
            } catch (e) {
              console.error('re-assert selected input failed', e);
            }
          }
        }
      } catch (err) {
        console.error('initial engine bridge sync failed', err);
      } finally {
        // Tell the autostart hook the engine controller has been told
        // about our selected input (or that we tried). Without this
        // gate the autostart hook fires immediately on mount and races
        // engine_select_input — engine_start hits the Rust side before
        // selected_device_id is set, returning InputNoDevice, and the
        // user sees a misleading "Engine couldn't start" banner.
        if (!cancelled) {
          useAppStore.getState().setBridgeReady(true);
        }
      }

      const off = await onEngineEvent((event) => {
        const store = useAppStore.getState();
        switch (event.kind) {
          case 'engine.status':
            store.setEngineStatus(event.status);
            // Engine reached a healthy running state — clear any stale
            // start-error banner the user might still be seeing.
            if (event.status === 'running') {
              store.setLastStartError(null);
            }
            break;
          case 'engine.meters':
            store.setMeters({
              inputPeakDb: event.inputPeakDb,
              inputRmsDb: event.inputRmsDb,
              outputPeakDb: event.outputPeakDb,
              outputRmsDb: event.outputRmsDb,
              clipping: event.clipping,
              noiseFloorDb: event.noiseFloorDb,
            });
            break;
          case 'engine.clip':
            // Clip already encoded in meters; ignore the dedicated event
            // for now. We'll use it for a transient flash in M3+.
            break;
          case 'engine.error':
            store.setLastErrorId(event.id);
            break;
          case 'engine.device':
            engineListDevices()
              .then((d) => useAppStore.getState().setDevices(d))
              .catch((e) => console.error('failed to refresh devices', e));
            break;
        }
      });

      if (cancelled) {
        off();
      } else {
        unlisten = off;
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
