import { useRef, useState } from 'react';
import { ChevronDown, Mic, RefreshCw, Star } from 'lucide-react';

import { useAppStore } from '../state/useAppStore';
import { engineSelectInput, engineListDevices } from '../ipc/commands';
import { useClickOutside } from './useClickOutside';

export function DeviceSelector() {
  const { devices, selectedDeviceId, setSelectedDeviceId, setDevices } = useAppStore((s) => ({
    devices: s.devices,
    selectedDeviceId: s.engine.selectedDeviceId,
    setSelectedDeviceId: s.setSelectedDeviceId,
    setDevices: s.setDevices,
  }));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false), open);

  const selected =
    devices.find((d) => d.id === selectedDeviceId) ?? devices.find((d) => d.is_default_communications);
  const sub = selected
    ? `${selected.default_sample_rate_hz ?? 48000} Hz · ${selected.default_channels ?? 1} ch · WASAPI shared`
    : 'No mic chosen';

  const refresh = async () => {
    try {
      setDevices(await engineListDevices());
    } catch (e) {
      console.error('engine_list_devices failed', e);
    }
  };

  const pick = async (id: string) => {
    setOpen(false);
    // Notify the engine controller first, THEN flip the store — same
    // race as cold-start autostart: if the store updates first, the
    // reactive autostart hook can see a new device and fire engine_start
    // before the controller knows about it.
    try {
      await engineSelectInput(id);
      setSelectedDeviceId(id);
    } catch (e) {
      console.error('engine_select_input failed', e);
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--ml-surface)',
          border: '1px solid var(--ml-border)',
          borderRadius: 'var(--ml-r-md)',
          padding: '10px 12px',
          color: 'var(--ml-fg)',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'var(--ml-accent-soft)',
            color: 'var(--ml-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 28px',
          }}
        >
          <Mic size={14} />
        </span>
        <span style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontWeight: 500,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selected?.name ?? 'No microphone selected'}
            </span>
            {selected?.is_default_communications && (
              <Star size={11} style={{ color: 'var(--ml-fg-faint)' }} />
            )}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ml-fg-muted)' }}>{sub}</span>
        </span>
        <ChevronDown size={14} style={{ color: 'var(--ml-fg-muted)', flex: '0 0 14px' }} />
      </button>

      {open && (
        <div
          className="ml-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            boxShadow: 'var(--ml-shadow-2)',
            padding: 4,
          }}
        >
          {devices.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--ml-fg-muted)', fontSize: 12 }}>
              No microphones detected.
            </div>
          ) : (
            devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d.id)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: d.id === selected?.id ? 'var(--ml-accent-soft)' : 'transparent',
                  border: 0,
                  borderRadius: 'var(--ml-r-sm)',
                  font: 'inherit',
                  color: 'var(--ml-fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Mic size={12} style={{ color: 'var(--ml-fg-muted)' }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{d.name}</span>
                {d.is_default_communications && <Star size={11} style={{ color: 'var(--ml-fg-faint)' }} />}
              </button>
            ))
          )}
          <div className="ml-divider" style={{ margin: '4px 0' }} />
          <button
            type="button"
            onClick={refresh}
            className="ml-btn ghost"
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      )}
    </div>
  );
}
