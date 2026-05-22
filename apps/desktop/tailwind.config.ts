import type { Config } from 'tailwindcss';

// Tokens documented in docs/ui-plan.md §3.
// Each theme sets CSS variables on the root; Tailwind reads them.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--ml-bg)',
        surface: 'var(--ml-surface)',
        fg: 'var(--ml-fg)',
        muted: 'var(--ml-muted)',
        accent: 'var(--ml-accent)',
        meterLow: 'var(--ml-meter-low)',
        meterMid: 'var(--ml-meter-mid)',
        meterHigh: 'var(--ml-meter-high)',
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI Variable',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
