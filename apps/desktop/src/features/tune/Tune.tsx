// Tune section. Module cards bound to the store's `modules` slice; edits
// debounced and pushed to the engine via useProfileSync.
//
// M3 ships simple-mode controls only; advanced expanders + visual EQ
// curve land in subsequent iterations.

import type { ProfileModules } from '@miclayer/shared';

import { ModuleCard } from '../../shared/ModuleCard';
import { SegmentedToggle } from '../../shared/SegmentedToggle';
import { Slider } from '../../shared/Slider';
import { EqCurve } from '../../shared/EqCurve';
import { useAppStore } from '../../state/useAppStore';
import { useProfileSync } from '../../state/useProfileSync';

export function Tune() {
  useProfileSync();
  const { modules, update } = useAppStore((s) => ({
    modules: s.modules,
    update: s.updateModule,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <InputGainCard modules={modules} update={update} />
      <HighPassCard modules={modules} update={update} />
      <NoiseSuppressionCard modules={modules} update={update} />
      <GateCard modules={modules} update={update} />
      <EqCard modules={modules} update={update} />
      <CompressorCard modules={modules} update={update} />
      <DeEsserCard modules={modules} update={update} />
      <LimiterCard modules={modules} update={update} />
      <OutputGainCard modules={modules} update={update} />
    </div>
  );
}

type UpdateFn = <K extends keyof ProfileModules>(key: K, value: ProfileModules[K]) => void;
interface CardProps {
  modules: ProfileModules;
  update: UpdateFn;
}

function InputGainCard({ modules, update }: CardProps) {
  const m = modules.inputGain;
  return (
    <ModuleCard
      title="Input gain"
      enabled={m.enabled}
      onToggle={(enabled) => update('inputGain', { ...m, enabled })}
    >
      <Slider
        label="Gain"
        value={m.params.gainDb}
        min={-24}
        max={24}
        step={0.1}
        unit="dB"
        onChange={(gainDb) => update('inputGain', { ...m, params: { gainDb } })}
      />
    </ModuleCard>
  );
}

function HighPassCard({ modules, update }: CardProps) {
  const m = modules.highPass;
  return (
    <ModuleCard
      title="High-pass"
      subtitle="Removes rumble, fan noise, desk thumps."
      enabled={m.enabled}
      onToggle={(enabled) => update('highPass', { ...m, enabled })}
    >
      <SegmentedToggle
        value={m.params.mode}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'strong', label: 'Strong' },
        ]}
        onChange={(mode) =>
          update('highPass', { ...m, params: { ...m.params, mode } })
        }
      />
    </ModuleCard>
  );
}

function NoiseSuppressionCard({ modules, update }: CardProps) {
  const m = modules.noiseSuppression;
  return (
    <ModuleCard
      title="Noise suppression"
      subtitle="Local RNNoise via nnnoiseless. ~10 ms latency, CPU-only."
      enabled={m.enabled}
      onToggle={(enabled) => update('noiseSuppression', { ...m, enabled })}
    >
      <Slider
        label="Amount"
        value={m.params.amount}
        min={0}
        max={1}
        step={0.05}
        precision={2}
        onChange={(amount) =>
          update('noiseSuppression', { ...m, params: { ...m.params, amount } })
        }
      />
    </ModuleCard>
  );
}

function GateCard({ modules, update }: CardProps) {
  const m = modules.gate;
  return (
    <ModuleCard
      title="Gate"
      subtitle="Silences the signal between words when only background remains."
      enabled={m.enabled}
      onToggle={(enabled) => update('gate', { ...m, enabled })}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Slider
          label="Threshold"
          value={m.params.thresholdDb}
          min={-80}
          max={-20}
          step={0.5}
          unit="dB"
          onChange={(thresholdDb) =>
            update('gate', { ...m, params: { ...m.params, thresholdDb } })
          }
        />
        <Slider
          label="Range"
          value={m.params.rangeDb}
          min={-60}
          max={0}
          step={1}
          unit="dB"
          onChange={(rangeDb) =>
            update('gate', { ...m, params: { ...m.params, rangeDb } })
          }
        />
        <Slider
          label="Attack"
          value={m.params.attackMs}
          min={0.1}
          max={50}
          step={0.1}
          unit="ms"
          onChange={(attackMs) =>
            update('gate', { ...m, params: { ...m.params, attackMs } })
          }
        />
        <Slider
          label="Release"
          value={m.params.releaseMs}
          min={10}
          max={1000}
          step={1}
          unit="ms"
          precision={0}
          onChange={(releaseMs) =>
            update('gate', { ...m, params: { ...m.params, releaseMs } })
          }
        />
      </div>
    </ModuleCard>
  );
}

function EqCard({ modules, update }: CardProps) {
  const m = modules.eq;
  const setBand = (i: number, patch: Partial<typeof m.params.bands[number]>) => {
    const bands = m.params.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) as typeof m.params.bands;
    update('eq', { ...m, params: { bands } });
  };

  return (
    <ModuleCard
      title="EQ — 5 bands"
      subtitle="Cascade of biquads. Live magnitude response below."
      enabled={m.enabled}
      onToggle={(enabled) => update('eq', { ...m, enabled })}
    >
      <div className="mb-3 rounded-card border border-surface/60 bg-bg p-2">
        <EqCurve bands={m.params.bands} />
      </div>

      <div className="flex flex-col gap-4">
        {m.params.bands.map((band, i) => (
          <div key={i} className="rounded-card border border-surface/60 bg-bg p-3">
            <header className="mb-2 flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={band.enabled}
                  onChange={(e) => setBand(i, { enabled: e.target.checked })}
                  className="accent-accent"
                />
                <span className="font-medium text-fg">Band {i + 1}</span>
              </label>
              <select
                value={band.type}
                onChange={(e) =>
                  setBand(i, { type: e.target.value as typeof band.type })
                }
                className="rounded-pill border border-muted/30 bg-surface px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
              >
                <option value="low_shelf">Low shelf</option>
                <option value="peak">Peak</option>
                <option value="high_shelf">High shelf</option>
                <option value="high_pass">High pass</option>
                <option value="low_pass">Low pass</option>
              </select>
            </header>
            <div className={'grid grid-cols-3 gap-x-4 gap-y-2 ' + (band.enabled ? '' : 'opacity-50')}>
              <Slider
                label="Freq"
                value={band.frequencyHz}
                min={20}
                max={20000}
                step={1}
                unit="Hz"
                precision={0}
                onChange={(frequencyHz) => setBand(i, { frequencyHz })}
              />
              <Slider
                label="Gain"
                value={band.gainDb}
                min={-24}
                max={24}
                step={0.1}
                unit="dB"
                onChange={(gainDb) => setBand(i, { gainDb })}
              />
              <Slider
                label="Q"
                value={band.q}
                min={0.1}
                max={10}
                step={0.05}
                precision={2}
                onChange={(q) => setBand(i, { q })}
              />
            </div>
          </div>
        ))}
      </div>
    </ModuleCard>
  );
}

function CompressorCard({ modules, update }: CardProps) {
  const m = modules.compressor;
  return (
    <ModuleCard
      title="Compressor"
      subtitle="Smooths volume so quiet syllables come up and loud bursts come down."
      enabled={m.enabled}
      onToggle={(enabled) => update('compressor', { ...m, enabled })}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Slider
          label="Threshold"
          value={m.params.thresholdDb}
          min={-60}
          max={0}
          step={0.5}
          unit="dB"
          onChange={(thresholdDb) =>
            update('compressor', { ...m, params: { ...m.params, thresholdDb } })
          }
        />
        <Slider
          label="Ratio"
          value={m.params.ratio}
          min={1}
          max={20}
          step={0.1}
          precision={1}
          onChange={(ratio) =>
            update('compressor', { ...m, params: { ...m.params, ratio } })
          }
        />
        <Slider
          label="Attack"
          value={m.params.attackMs}
          min={0.1}
          max={200}
          step={0.5}
          unit="ms"
          onChange={(attackMs) =>
            update('compressor', { ...m, params: { ...m.params, attackMs } })
          }
        />
        <Slider
          label="Release"
          value={m.params.releaseMs}
          min={10}
          max={2000}
          step={5}
          unit="ms"
          precision={0}
          onChange={(releaseMs) =>
            update('compressor', { ...m, params: { ...m.params, releaseMs } })
          }
        />
        <Slider
          label="Knee"
          value={m.params.kneeDb}
          min={0}
          max={24}
          step={0.5}
          unit="dB"
          onChange={(kneeDb) =>
            update('compressor', { ...m, params: { ...m.params, kneeDb } })
          }
        />
        <label className="flex items-end gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={m.params.autoMakeup}
            onChange={(e) =>
              update('compressor', {
                ...m,
                params: { ...m.params, autoMakeup: e.target.checked },
              })
            }
            className="accent-accent"
          />
          Auto makeup
        </label>
      </div>
    </ModuleCard>
  );
}

function DeEsserCard({ modules, update }: CardProps) {
  const m = modules.deEsser;
  return (
    <ModuleCard
      title="De-esser"
      subtitle="Bandpass detector around the sibilance band, dynamic attenuation."
      enabled={m.enabled}
      onToggle={(enabled) => update('deEsser', { ...m, enabled })}
    >
      <Slider
        label="Amount"
        value={m.params.amountDb}
        min={0}
        max={18}
        step={0.5}
        unit="dB"
        onChange={(amountDb) =>
          update('deEsser', { ...m, params: { ...m.params, amountDb } })
        }
      />
    </ModuleCard>
  );
}

function LimiterCard({ modules, update }: CardProps) {
  const m = modules.limiter;
  return (
    <ModuleCard
      title="Limiter"
      subtitle="Brick-wall safety. Clamps any peak above the ceiling."
      enabled={m.enabled}
      onToggle={(enabled) => update('limiter', { ...m, enabled })}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Slider
          label="Ceiling"
          value={m.params.ceilingDb}
          min={-6}
          max={0}
          step={0.1}
          unit="dB"
          onChange={(ceilingDb) =>
            update('limiter', { ...m, params: { ...m.params, ceilingDb } })
          }
        />
        <Slider
          label="Release"
          value={m.params.releaseMs}
          min={10}
          max={500}
          step={1}
          unit="ms"
          precision={0}
          onChange={(releaseMs) =>
            update('limiter', { ...m, params: { ...m.params, releaseMs } })
          }
        />
      </div>
    </ModuleCard>
  );
}

function OutputGainCard({ modules, update }: CardProps) {
  const m = modules.outputGain;
  return (
    <ModuleCard
      title="Output gain"
      enabled={m.enabled}
      onToggle={(enabled) => update('outputGain', { ...m, enabled })}
    >
      <Slider
        label="Gain"
        value={m.params.gainDb}
        min={-24}
        max={12}
        step={0.1}
        unit="dB"
        onChange={(gainDb) => update('outputGain', { ...m, params: { gainDb } })}
      />
    </ModuleCard>
  );
}
