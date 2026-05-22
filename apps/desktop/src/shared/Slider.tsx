interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  precision?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  precision = 1,
  onChange,
  disabled,
}: SliderProps) {
  return (
    <div className={'flex flex-col gap-1 ' + (disabled ? 'opacity-50' : '')}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-fg">
          {Number.isFinite(value) ? value.toFixed(precision) : '—'}
          {unit && ` ${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="accent-accent h-1 w-full cursor-pointer"
      />
    </div>
  );
}
