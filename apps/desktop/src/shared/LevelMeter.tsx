// Peak + RMS level meter. dB scale, log-mapped to width.
//
// Colour zones (per docs/ui-plan.md §3): green to -12 dB, amber to -3 dB,
// red above. RMS shown as a subtle inner bar.

interface LevelMeterProps {
  label: string;
  peakDb: number;
  rmsDb: number;
  /** Show a red highlight if clipping occurred in the current window. */
  clipping?: boolean;
}

const MIN_DB = -60;
const MAX_DB = 0;

function dbToPct(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

function colourFor(db: number): string {
  if (db >= -3) return 'bg-meterHigh';
  if (db >= -12) return 'bg-meterMid';
  return 'bg-meterLow';
}

export function LevelMeter({ label, peakDb, rmsDb, clipping }: LevelMeterProps) {
  const peakPct = dbToPct(peakDb);
  const rmsPct = dbToPct(rmsDb);
  const peakColour = colourFor(peakDb);

  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span aria-live="polite">
          {Number.isFinite(peakDb) ? `${peakDb.toFixed(1)} dB` : '—'}
        </span>
      </div>
      <div
        className={
          'relative h-3 overflow-hidden rounded-pill bg-bg ' +
          (clipping ? 'ring-1 ring-meterHigh/70' : '')
        }
      >
        <div
          className={'absolute inset-y-0 left-0 ' + peakColour}
          style={{ width: `${peakPct}%`, transition: 'width 50ms linear' }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-fg/20"
          style={{ width: `${rmsPct}%`, transition: 'width 80ms linear' }}
          aria-hidden
        />
      </div>
    </div>
  );
}
