// ThemeProvider — passes the resolved theme name to children via context-free
// store read. The new design scopes its theme via `data-theme` on `.ml-window`,
// so children render that wrapper. This component now exists only to react to
// the system theme media query and surface the resolved theme as a hook.

import { type ReactNode, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppStore((s) => s.ui.theme);

  // When the user picks "System", react to OS-level changes.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      // Force a re-render by re-setting the same value through the store.
      useAppStore.getState().setTheme('system');
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [theme]);

  return <>{children}</>;
}

/// Resolve the active theme to one of the three concrete options.
export function useResolvedTheme(): 'dark' | 'medium' | 'light' {
  const theme = useAppStore((s) => s.ui.theme);
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme;
}
