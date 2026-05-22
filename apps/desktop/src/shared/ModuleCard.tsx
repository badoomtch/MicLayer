import { type ReactNode } from 'react';

interface ModuleCardProps {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  subtitle?: string;
  children: ReactNode;
}

export function ModuleCard({ title, enabled, onToggle, subtitle, children }: ModuleCardProps) {
  return (
    <section
      className={
        'rounded-card border border-surface/60 bg-surface p-4 transition-opacity ' +
        (enabled ? '' : 'opacity-60')
      }
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="accent-accent"
          />
          <span>{enabled ? 'enabled' : 'disabled'}</span>
        </label>
      </header>
      <div className={enabled ? '' : 'pointer-events-none'}>{children}</div>
    </section>
  );
}
