import { type ReactNode, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppStore((s) => s.ui.theme);

  useEffect(() => {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [theme]);

  return <>{children}</>;
}
