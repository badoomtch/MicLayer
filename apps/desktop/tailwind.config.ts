import type { Config } from 'tailwindcss';

// Visuals are class-based on `ml-*` from global.css. Tailwind is only used
// for layout utilities (flex/grid/gap/spacing). Token aliases below keep
// older Tailwind class usages compiling against the new variables.

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--ml-bg)',
        'bg-chrome': 'var(--ml-bg-chrome)',
        surface: 'var(--ml-surface)',
        'surface-2': 'var(--ml-surface-2)',
        fg: 'var(--ml-fg)',
        muted: 'var(--ml-fg-muted)',
        faint: 'var(--ml-fg-faint)',
        border: 'var(--ml-border)',
        accent: 'var(--ml-accent)',
        good: 'var(--ml-good)',
        warn: 'var(--ml-warn)',
        bad: 'var(--ml-bad)',
        meterLow: 'var(--ml-meter-low)',
        meterMid: 'var(--ml-meter-mid)',
        meterHigh: 'var(--ml-meter-high)',
      },
      borderRadius: {
        card: 'var(--ml-r-md)',
        pill: 'var(--ml-r-pill)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
