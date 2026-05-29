// Slider — uni and bipolar variants. Uses a native <input type="range">
// overlaid invisibly on the visual track so keyboard + drag both work.

import { Info } from 'lucide-react';

interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Override the auto-formatted value pill. */
  display?: string;
  precision?: number;
  onChange: (v: number) => void;
  /** Centred zero with fill growing outward (gains, dB). */
  bipolar?: boolean;
  disabled?: boolean;
  /** Optional explainer shown via an (i) icon next to the label. */
  hint?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  display,
  precision = 1,
  onChange,
  bipolar = false,
  disabled,
  hint,
}: SliderProps) {
  const range = max - min;
  const valuePct = ((value - min) / range) * 100;
  const zeroPct = ((0 - min) / range) * 100;
  const showZero = bipolar && min < 0 && max > 0;

  let fillLeft = 0;
  let fillWidth = valuePct;
  if (bipolar && showZero) {
    fillLeft = Math.min(zeroPct, valuePct);
    fillWidth = Math.max(zeroPct, valuePct) - fillLeft;
  }

  const text = display ?? formatValue(value, precision, unit, bipolar);

  return (
    <div className={'ml-slider' + (disabled ? ' opacity-50' : '')}>
      {label && (
        <div
          className="ml-slider-label"
          style={hint ? { display: 'inline-flex', alignItems: 'center', gap: 5 } : undefined}
        >
          <span>{label}</span>
          {hint && (
            <span
              title={hint}
              aria-label={hint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--ml-fg-faint)',
                cursor: 'help',
              }}
            >
              <Info size={11} />
            </span>
          )}
        </div>
      )}
      <div className="ml-slider-track-wrap">
        <div className="ml-slider-track" />
        <div
          className="ml-slider-fill"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        {showZero && <div className="ml-slider-zero" style={{ left: `${zeroPct}%` }} />}
        <div className="ml-slider-thumb" style={{ left: `${valuePct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
      </div>
      <div className="ml-slider-value">{text}</div>
    </div>
  );
}

function formatValue(value: number, precision: number, unit: string, bipolar: boolean) {
  if (!Number.isFinite(value)) return '—';
  const sign = bipolar && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`;
}
