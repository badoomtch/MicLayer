interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="radiogroup"
      className={
        'inline-flex rounded-pill border border-muted/30 p-0.5 ' +
        (disabled ? 'opacity-50' : '')
      }
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={
              'rounded-pill px-3 py-1 text-xs transition-colors ' +
              (active ? 'bg-accent/20 text-fg' : 'text-muted hover:text-fg')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
