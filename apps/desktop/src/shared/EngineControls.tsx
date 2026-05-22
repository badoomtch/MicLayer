import { useState } from 'react';
import { Play, Square } from 'lucide-react';

import { engineStart, engineStop } from '../ipc/commands';
import { useAppStore } from '../state/useAppStore';

export function EngineControls() {
  const { status, selectedDeviceId, lastErrorId, setLastErrorId } = useAppStore((s) => ({
    status: s.engine.status,
    selectedDeviceId: s.engine.selectedDeviceId,
    lastErrorId: s.engine.lastErrorId,
    setLastErrorId: s.setLastErrorId,
  }));
  const [busy, setBusy] = useState(false);

  const running = status === 'running' || status === 'starting';
  const disabled = busy || !selectedDeviceId;

  const onClick = async () => {
    setBusy(true);
    setLastErrorId(null);
    try {
      if (running) {
        await engineStop();
      } else {
        await engineStart();
      }
    } catch (e) {
      console.error('engine start/stop failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={
          'inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors ' +
          (running
            ? 'bg-meterHigh/15 text-meterHigh hover:bg-meterHigh/25'
            : 'bg-accent/15 text-fg hover:bg-accent/25') +
          (disabled ? ' opacity-50 cursor-not-allowed' : '')
        }
      >
        {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {running ? 'Stop engine' : 'Start engine'}
      </button>
      {!selectedDeviceId && (
        <span className="text-xs text-muted">Pick a microphone first.</span>
      )}
      {lastErrorId && (
        <span className="text-xs text-meterHigh">Error: {lastErrorId}</span>
      )}
    </div>
  );
}
