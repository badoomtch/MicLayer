import { type ReactNode } from 'react';
import { Toggle } from './Toggle';

interface ModuleCardProps {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  subtitle?: string;
  /** Optional right-aligned actions in the header. */
  trailing?: ReactNode;
  children: ReactNode;
}

export function ModuleCard({
  title,
  enabled,
  onToggle,
  subtitle,
  trailing,
  children,
}: ModuleCardProps) {
  return (
    <section className="ml-card ml-card-pad" style={{ opacity: enabled ? 1 : 0.65 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {trailing}
          <Toggle checked={enabled} onChange={onToggle} aria-label={`${title} on/off`} />
        </div>
      </header>
      <div style={{ pointerEvents: enabled ? 'auto' : 'none' }}>{children}</div>
    </section>
  );
}
