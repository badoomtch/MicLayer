// Loads profile listings into the store on mount, provides a refresh, and
// reacts to tray-driven `profiles:applied` events from the backend.

import { useCallback, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

import { profileGet, profileList } from '../ipc/profiles';
import { useAppStore } from './useAppStore';

export function useProfilesBridge() {
  const setListing = useAppStore((s) => s.setProfilesListing);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const refresh = useCallback(async () => {
    try {
      const listing = await profileList();
      setListing(
        listing.builtins,
        listing.users,
        listing.config.activeProfileId,
        listing.config.defaultProfileId,
      );
    } catch (e) {
      console.error('profile_list failed', e);
    }
  }, [setListing]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const off = await listen<string>('profiles:applied', async (e) => {
        try {
          const p = await profileGet(e.payload);
          setActiveProfile(p);
        } catch (err) {
          console.error('profile_get failed for tray-applied profile', err);
        }
      });
      if (cancelled) off();
      else unlisten = off;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [setActiveProfile]);

  return refresh;
}
