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
      if (running) await engineStop();
      else await engineStart();
    } catch (e) {
      console.error('engine start/stop failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={'ml-btn' + (running ? '' : ' primary')}
      >
        {running ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        {running ? 'Stop engine' : 'Start engine'}
      </button>
      {!selectedDeviceId && (
        <span style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>Pick a microphone first.</span>
      )}
      {lastErrorId && (
        <span style={{ fontSize: 11.5, color: 'var(--ml-bad)' }}>Error: {lastErrorId}</span>
      )}
    </div>
  );
}
