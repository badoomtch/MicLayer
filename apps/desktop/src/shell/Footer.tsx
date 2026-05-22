import { useAppStore } from '../state/useAppStore';
import { engineSetMuted, engineSetRaw } from '../ipc/commands';

export function Footer() {
  const { raw, muted, status, setRaw, setMuted } = useAppStore((s) => ({
    raw: s.engine.raw,
    muted: s.engine.muted,
    status: s.engine.status,
    setRaw: s.setRaw,
    setMuted: s.setMuted,
  }));

  const toggleRaw = async () => {
    const next = !raw;
    setRaw(next);
    try {
      await engineSetRaw(next);
    } catch (e) {
      console.error('engine_set_raw failed', e);
    }
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    try {
      await engineSetMuted(next);
    } catch (e) {
      console.error('engine_set_muted failed', e);
    }
  };

  return (
    <footer className="flex h-10 items-center justify-between border-t border-surface/60 bg-surface px-4 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={
            'inline-block h-2 w-2 rounded-full ' +
            (status === 'running'
              ? 'bg-meterLow'
              : status === 'faulted'
                ? 'bg-meterHigh'
                : 'bg-muted')
          }
        />
        <span className="text-muted">
          Engine: <span className="text-fg">{status}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleRaw}
          className="rounded-pill border border-muted/30 px-3 py-1 hover:border-accent/60"
        >
          {raw ? 'Raw' : 'Tuned'}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          className={
            'rounded-pill px-3 py-1 ' +
            (muted
              ? 'bg-meterHigh/20 text-meterHigh'
              : 'border border-muted/30 hover:border-accent/60')
          }
        >
          {muted ? 'Muted' : 'Mute'}
        </button>
      </div>
    </footer>
  );
}
