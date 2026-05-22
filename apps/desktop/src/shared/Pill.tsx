import type { ReactNode } from 'react';

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const cls = tone === 'neutral' ? 'ml-pill' : `ml-pill ${tone}`;
  return <span className={cls}>{children}</span>;
}

export function StatusDot({ color }: { color?: string }) {
  return <span className="ml-dot" style={color ? { background: color } : undefined} />;
}
