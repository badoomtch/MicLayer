// Subscribes to engine events and pumps them into the Zustand store.
// Mount this once at the app root.

import { useEffect } from 'react';

import { onEngineEvent } from '../ipc/events';
import {
  engineListDevices,
  engineSelectInput,
  engineSnapshot,
  engineStart,
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
          useAppStore.getState().setSelectedDeviceId(snap.selectedDeviceId);
        }
        const devices = await engineListDevices();
        if (!cancelled) {
          useAppStore.getState().setDevices(devices);
          // If nothing was previously selected, auto-pick the Windows
          // default communications device. Without this, Start engine
          // stays disabled because the controller has no input chosen,
          // and the user has to manually open the device dropdown to
          // unstick it.
          const current = useAppStore.getState().engine.selectedDeviceId;
          if (!current) {
            const fallback =
              devices.find((d) => d.is_default_communications) ?? devices[0];
            if (fallback) {
              try {
                await engineSelectInput(fallback.id);
                useAppStore.getState().setSelectedDeviceId(fallback.id);
              } catch (e) {
                console.error('auto-select default device failed', e);
              }
            }
          }

          // Auto-start the engine when there's a selected device and nothing
          // is already running. This removes the Start/Stop button from the
          // UI — the app being open is the user's intent. They can pause
          // audio with the mute button in the sidebar, and the engine
          // shuts down naturally when the app actually quits.
          const status = useAppStore.getState().engine.status;
          const haveDevice = useAppStore.getState().engine.selectedDeviceId;
          if (haveDevice && (status === 'stopped' || status === 'faulted')) {
            try {
              await engineStart();
            } catch (e) {
              console.error('auto-start engine failed', e);
            }
          }
        }
      } catch (err) {
        console.error('initial engine bridge sync failed', err);
      }

      const off = await onEngineEvent((event) => {
        const store = useAppStore.getState();
        switch (event.kind) {
          case 'engine.status':
            store.setEngineStatus(event.status);
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
