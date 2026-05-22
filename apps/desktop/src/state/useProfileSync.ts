// Debounced push of the module-editor state into the engine.
//
// Each time `modules` changes, we wait ~80 ms and then call
// `engine_apply_profile`. Quick slider drags collapse to one trailing
// invocation. Cheap on the engine because writes go through triple_buffer.

import { useEffect, useRef } from 'react';

import { engineApplyProfile } from '../ipc/commands';
import { useAppStore } from './useAppStore';

const DEBOUNCE_MS = 80;

export function useProfileSync() {
  const modules = useAppStore((s) => s.modules);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      engineApplyProfile(modules).catch((e) =>
        console.error('engine_apply_profile failed', e),
      );
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [modules]);
}
