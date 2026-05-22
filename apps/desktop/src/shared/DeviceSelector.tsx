import { useAppStore } from '../state/useAppStore';
import { engineSelectInput, engineListDevices } from '../ipc/commands';
import { RefreshCw } from 'lucide-react';

export function DeviceSelector() {
  const { devices, selectedDeviceId, setSelectedDeviceId, setDevices } = useAppStore(
    (s) => ({
      devices: s.devices,
      selectedDeviceId: s.engine.selectedDeviceId,
      setSelectedDeviceId: s.setSelectedDeviceId,
      setDevices: s.setDevices,
    }),
  );

  const onSelect = async (id: string) => {
    setSelectedDeviceId(id);
    try {
      await engineSelectInput(id);
    } catch (e) {
      console.error('engine_select_input failed', e);
    }
  };

  const refresh = async () => {
    try {
      const list = await engineListDevices();
      setDevices(list);
    } catch (e) {
      console.error('engine_list_devices failed', e);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedDeviceId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="min-w-[260px] flex-1 rounded-card border border-muted/20 bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        aria-label="Input microphone"
      >
        <option value="" disabled>
          {devices.length === 0 ? 'No microphones detected' : 'Pick a microphone…'}
        </option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.is_default_communications ? '★ ' : ''}
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={refresh}
        className="rounded-pill border border-muted/30 px-2.5 py-2 text-xs text-muted hover:border-accent/60 hover:text-fg"
        aria-label="Refresh device list"
        title="Refresh device list"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
