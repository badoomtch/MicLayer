// Level meter — peak + peak-hold + dB scale.
// dB axis: -60 dB to 0 dB mapped to 0..1 normalised meter position.

interface LevelMeterProps {
  label?: string;
  peakDb: number;
  rmsDb?: number;
  /** Linear 0..1 peak-hold marker (optional). */
  peakHoldDb?: number;
  clipping?: boolean;
  thick?: boolean;
  /** Show the dB scale ruler beneath. */
  scale?: boolean;
}

const MIN_DB = -60;
const MAX_DB = 0;

function dbToFraction(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return (clamped - MIN_DB) / (MAX_DB - MIN_DB);
}

export function LevelMeter({
  label,
  peakDb,
  peakHoldDb,
  clipping,
  thick = true,
  scale = true,
}: LevelMeterProps) {
  const peakFrac = dbToFraction(peakDb);
  const holdFrac = peakHoldDb !== undefined ? dbToFraction(peakHoldDb) : undefined;

  return (
    <div style={{ width: '100%' }} role="group" aria-label={label}>
      {label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 6,
          }}
        >
          <span className="ml-eyebrow">{label}</span>
          <span className="ml-mono" style={{ fontSize: 11, color: 'var(--ml-fg-muted)' }}>
            {Number.isFinite(peakDb) ? `${peakDb.toFixed(1)} dB peak` : '—'}
          </span>
        </div>
      )}
      <div
        className={'ml-meter' + (thick ? ' thick' : '')}
        style={clipping ? { boxShadow: '0 0 0 1px var(--ml-bad) inset' } : undefined}
      >
        <div
          className="ml-meter-fill"
          style={{ width: `${peakFrac * 100}%`, transition: 'width 60ms linear' }}
        />
        {holdFrac !== undefined && (
          <div className="ml-meter-peak" style={{ left: `calc(${holdFrac * 100}% - 1px)` }} />
        )}
        <div className="ml-meter-ticks">
          {[0.25, 0.5, 0.75, 0.85, 0.95].map((t) => (
            <div key={t} className="ml-meter-tick" style={{ left: `${t * 100}%` }} />
          ))}
        </div>
      </div>
      {scale && (
        <div className="ml-meter-scale">
          <span>−∞</span>
          <span>−42</span>
          <span>−24</span>
          <span>−12</span>
          <span>−6</span>
          <span>0 dBFS</span>
        </div>
      )}
    </div>
  );
}
