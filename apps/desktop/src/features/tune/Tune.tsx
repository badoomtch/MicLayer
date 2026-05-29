// Tune — signal-chain strip across the top + editor for the selected module
// beneath it. Matches the Claude Design handoff direction.

import { useState } from 'react';
import type { ProfileModules, EqBand } from '@miclayer/shared';

import { Slider } from '../../shared/Slider';
import { SegmentedToggle } from '../../shared/SegmentedToggle';
import { Toggle } from '../../shared/Toggle';
import { EqCurve } from '../../shared/EqCurve';
import { useAppStore } from '../../state/useAppStore';
// useProfileSync is mounted in App.tsx so slider changes from any page
// (Dashboard quick controls, Tune editors, the wizard) push to the engine.

type ModuleId =
  | 'inputGain'
  | 'highPass'
  | 'noiseSuppression'
  | 'gate'
  | 'eq'
  | 'compressor'
  | 'deEsser'
  | 'limiter'
  | 'outputGain';

interface ChainEntry {
  id: ModuleId;
  label: string;
  short: string;
}

const CHAIN: ChainEntry[] = [
  { id: 'inputGain', label: 'Input', short: 'IN' },
  { id: 'highPass', label: 'Hi-pass', short: 'HPF' },
  { id: 'noiseSuppression', label: 'Noise', short: 'NS' },
  { id: 'gate', label: 'Gate', short: 'GATE' },
  { id: 'eq', label: 'EQ', short: 'EQ' },
  { id: 'compressor', label: 'Comp', short: 'CMP' },
  { id: 'deEsser', label: 'De-ess', short: 'DSS' },
  { id: 'limiter', label: 'Limit', short: 'LIM' },
  { id: 'outputGain', label: 'Output', short: 'OUT' },
];

type UpdateFn = <K extends keyof ProfileModules>(key: K, value: ProfileModules[K]) => void;

export function Tune() {
  const { modules, update } = useAppStore((s) => ({
    modules: s.modules,
    update: s.updateModule,
  }));
  const [active, setActive] = useState<ModuleId>('eq');

  return (
    <div className="ml-page">
      <div className="ml-page-head">
        <div>
          <div className="ml-page-title">Tune</div>
          <div className="ml-page-sub">Edit the processing chain. Changes apply live.</div>
        </div>
      </div>

      <SignalChain modules={modules} active={active} onSelect={setActive} />

      {active === 'inputGain' && <InputGainEditor modules={modules} update={update} />}
      {active === 'highPass' && <HighPassEditor modules={modules} update={update} />}
      {active === 'noiseSuppression' && <NoiseSuppressionEditor modules={modules} update={update} />}
      {active === 'gate' && <GateEditor modules={modules} update={update} />}
      {active === 'eq' && <EqEditor modules={modules} update={update} />}
      {active === 'compressor' && <CompressorEditor modules={modules} update={update} />}
      {active === 'deEsser' && <DeEsserEditor modules={modules} update={update} />}
      {active === 'limiter' && <LimiterEditor modules={modules} update={update} />}
      {active === 'outputGain' && <OutputGainEditor modules={modules} update={update} />}
    </div>
  );
}

// ─── Signal chain strip ────────────────────────────────────────────────────
function SignalChain({
  modules,
  active,
  onSelect,
}: {
  modules: ProfileModules;
  active: ModuleId;
  onSelect: (m: ModuleId) => void;
}) {
  return (
    <div className="ml-card" style={{ padding: '14px 14px 12px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {CHAIN.map((m, i) => {
          const enabled = (modules[m.id] as { enabled: boolean }).enabled;
          return (
            <div key={m.id} style={{ flex: '1 1 0', display: 'flex', alignItems: 'stretch' }}>
              <ChainNode m={m} enabled={enabled} active={m.id === active} onSelect={onSelect} />
              {i < CHAIN.length - 1 && <ChainConnector />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChainNode({
  m,
  enabled,
  active,
  onSelect,
}: {
  m: ChainEntry;
  enabled: boolean;
  active: boolean;
  onSelect: (m: ModuleId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(m.id)}
      style={{
        flex: '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        padding: '6px 4px 4px',
        borderRadius: 'var(--ml-r-md)',
        background: active ? 'var(--ml-accent-soft)' : 'transparent',
        border: active
          ? '1px solid color-mix(in oklch, var(--ml-accent) 30%, transparent)'
          : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background var(--ml-dur-1)',
        position: 'relative',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 9,
          background: active ? 'var(--ml-accent)' : 'var(--ml-surface-2)',
          border: '1px solid ' + (active ? 'transparent' : 'var(--ml-border)'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          className="ml-mono"
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: active ? 'var(--ml-accent-fg)' : 'var(--ml-fg-muted)',
            letterSpacing: 0.5,
          }}
        >
          {m.short}
        </span>
        <span
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: enabled ? 'var(--ml-good)' : 'var(--ml-fg-faint)',
            border: '2px solid var(--ml-surface)',
          }}
        />
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: active ? 'var(--ml-fg)' : 'var(--ml-fg-muted)' }}>
        {m.label}
      </div>
    </button>
  );
}

function ChainConnector() {
  return (
    <div
      style={{
        flex: '0 0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 13,
      }}
    >
      <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
        <line x1="0" y1="9" x2="14" y2="9" stroke="var(--ml-border-strong)" strokeWidth="1" strokeDasharray="2 2" />
        <circle cx="7" cy="9" r="1.5" fill="var(--ml-border-strong)" />
      </svg>
    </div>
  );
}

// ─── Module editors ────────────────────────────────────────────────────────

function ModuleHeader({
  title,
  sub,
  enabled,
  onToggle,
}: {
  title: string;
  sub: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>{sub}</div>
      </div>
      <Toggle checked={enabled} onChange={onToggle} aria-label={`${title} on/off`} />
    </div>
  );
}

function InputGainEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.inputGain;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Input gain"
        sub="Set the working level of the chain. Smoothed to avoid zipper noise."
        enabled={m.enabled}
        onToggle={(enabled) => update('inputGain', { ...m, enabled })}
      />
      <Slider
        label="Gain"
        value={m.params.gainDb}
        min={-24}
        max={24}
        step={0.1}
        unit=" dB"
        bipolar
        onChange={(v) => update('inputGain', { ...m, params: { gainDb: v } })}
      />
    </div>
  );
}

function OutputGainEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.outputGain;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Output gain"
        sub="Final trim before MicLayer hands audio to the virtual mic."
        enabled={m.enabled}
        onToggle={(enabled) => update('outputGain', { ...m, enabled })}
      />
      <Slider
        label="Gain"
        value={m.params.gainDb}
        min={-24}
        max={12}
        step={0.1}
        unit=" dB"
        bipolar
        onChange={(v) => update('outputGain', { ...m, params: { gainDb: v } })}
      />
    </div>
  );
}

function HighPassEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.highPass;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="High-pass"
        sub="Cuts rumble, fan noise, desk thumps."
        enabled={m.enabled}
        onToggle={(enabled) => update('highPass', { ...m, enabled })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ml-fg-muted)' }}>Strength</span>
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
      </div>
    </div>
  );
}

function NoiseSuppressionEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.noiseSuppression;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Noise suppression"
        sub="Local RNNoise via nnnoiseless. ~10 ms latency."
        enabled={m.enabled}
        onToggle={(enabled) => update('noiseSuppression', { ...m, enabled })}
      />
      <Slider
        label="Amount"
        value={Math.round(m.params.amount * 100)}
        min={0}
        max={100}
        step={1}
        unit=" %"
        precision={0}
        onChange={(v) =>
          update('noiseSuppression', { ...m, params: { ...m.params, amount: v / 100 } })
        }
      />
    </div>
  );
}

function GateEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.gate;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Gate"
        sub="Silences the signal between words when only background remains."
        enabled={m.enabled}
        onToggle={(enabled) => update('gate', { ...m, enabled })}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, rowGap: 10 }}>
        <Slider
          label="Threshold"
          value={m.params.thresholdDb}
          min={-80}
          max={-20}
          step={0.5}
          unit=" dB"
          onChange={(v) => update('gate', { ...m, params: { ...m.params, thresholdDb: v } })}
        />
        <Slider
          label="Range"
          value={m.params.rangeDb}
          min={-60}
          max={0}
          step={1}
          unit=" dB"
          precision={0}
          onChange={(v) => update('gate', { ...m, params: { ...m.params, rangeDb: v } })}
        />
        <Slider
          label="Attack"
          value={m.params.attackMs}
          min={0.1}
          max={50}
          step={0.1}
          unit=" ms"
          onChange={(v) => update('gate', { ...m, params: { ...m.params, attackMs: v } })}
        />
        <Slider
          label="Release"
          value={m.params.releaseMs}
          min={10}
          max={1000}
          step={1}
          unit=" ms"
          precision={0}
          onChange={(v) => update('gate', { ...m, params: { ...m.params, releaseMs: v } })}
        />
      </div>
    </div>
  );
}

function CompressorEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.compressor;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Compressor"
        sub="Quiet syllables come up; loud bursts come down."
        enabled={m.enabled}
        onToggle={(enabled) => update('compressor', { ...m, enabled })}
      />
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 24, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Slider
            label="Threshold"
            value={m.params.thresholdDb}
            min={-60}
            max={0}
            step={0.5}
            unit=" dB"
            onChange={(v) => update('compressor', { ...m, params: { ...m.params, thresholdDb: v } })}
          />
          <Slider
            label="Ratio"
            value={m.params.ratio}
            min={1}
            max={20}
            step={0.1}
            display={`${m.params.ratio.toFixed(1)} : 1`}
            onChange={(v) => update('compressor', { ...m, params: { ...m.params, ratio: v } })}
          />
          <Slider
            label="Attack"
            value={m.params.attackMs}
            min={0.1}
            max={200}
            step={0.5}
            unit=" ms"
            onChange={(v) => update('compressor', { ...m, params: { ...m.params, attackMs: v } })}
          />
          <Slider
            label="Release"
            value={m.params.releaseMs}
            min={10}
            max={2000}
            step={5}
            unit=" ms"
            precision={0}
            onChange={(v) => update('compressor', { ...m, params: { ...m.params, releaseMs: v } })}
          />
          <Slider
            label="Knee"
            value={m.params.kneeDb}
            min={0}
            max={24}
            step={0.5}
            unit=" dB"
            onChange={(v) => update('compressor', { ...m, params: { ...m.params, kneeDb: v } })}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 6,
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--ml-fg-muted)' }}>Auto makeup gain</span>
            <Toggle
              checked={m.params.autoMakeup}
              onChange={(v) =>
                update('compressor', { ...m, params: { ...m.params, autoMakeup: v } })
              }
              aria-label="Auto makeup gain"
            />
          </div>
        </div>
        <div
          style={{
            background: 'var(--ml-surface-2)',
            borderRadius: 'var(--ml-r-md)',
            border: '1px solid var(--ml-border)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div className="ml-eyebrow">Compressor profile</div>
          <div className="ml-mono" style={{ fontSize: 24, fontWeight: 500, color: 'var(--ml-warn)' }}>
            {m.params.ratio.toFixed(1)} : 1
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)', textAlign: 'center' }}>
            Threshold sits {Math.abs(m.params.thresholdDb).toFixed(0)} dB below full scale.
          </div>
        </div>
      </div>
    </div>
  );
}

function DeEsserEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.deEsser;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="De-esser"
        sub="Tames harsh sibilance without making the voice lispy."
        enabled={m.enabled}
        onToggle={(enabled) => update('deEsser', { ...m, enabled })}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, rowGap: 10 }}>
        <Slider
          label="Target"
          value={m.params.targetHz}
          min={4000}
          max={10000}
          step={50}
          unit=" Hz"
          precision={0}
          onChange={(v) => update('deEsser', { ...m, params: { ...m.params, targetHz: v } })}
        />
        <Slider
          label="Amount"
          value={m.params.amountDb}
          min={0}
          max={18}
          step={0.5}
          unit=" dB"
          onChange={(v) => update('deEsser', { ...m, params: { ...m.params, amountDb: v } })}
        />
      </div>
    </div>
  );
}

function LimiterEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.limiter;
  return (
    <div className="ml-card ml-card-pad" style={{ padding: '20px 24px' }}>
      <ModuleHeader
        title="Limiter"
        sub="Brick-wall safety. Clamps any peak above the ceiling."
        enabled={m.enabled}
        onToggle={(enabled) => update('limiter', { ...m, enabled })}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 32, rowGap: 10 }}>
        <Slider
          label="Ceiling"
          value={m.params.ceilingDb}
          min={-6}
          max={0}
          step={0.1}
          unit=" dB"
          onChange={(v) => update('limiter', { ...m, params: { ...m.params, ceilingDb: v } })}
        />
        <Slider
          label="Release"
          value={m.params.releaseMs}
          min={10}
          max={500}
          step={1}
          unit=" ms"
          precision={0}
          onChange={(v) => update('limiter', { ...m, params: { ...m.params, releaseMs: v } })}
        />
        <Slider
          label="Lookahead"
          value={m.params.lookaheadMs}
          min={0}
          max={10}
          step={0.5}
          unit=" ms"
          onChange={(v) => update('limiter', { ...m, params: { ...m.params, lookaheadMs: v } })}
        />
      </div>
    </div>
  );
}

function EqEditor({ modules, update }: { modules: ProfileModules; update: UpdateFn }) {
  const m = modules.eq;
  const [selected, setSelected] = useState<number>(2);

  const setBand = (i: number, patch: Partial<EqBand>) => {
    const bands = m.params.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) as typeof m.params.bands;
    update('eq', { ...m, params: { bands } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ml-card ml-card-pad" style={{ padding: '18px 22px 14px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              EQ <span style={{ color: 'var(--ml-fg-muted)', fontWeight: 400 }}>· 5 bands</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>
              Drag a handle in the curve, or edit values below.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Toggle
              checked={m.enabled}
              onChange={(enabled) => update('eq', { ...m, enabled })}
              aria-label="EQ on/off"
            />
          </div>
        </div>
        <div
          style={{
            background: 'var(--ml-surface-2)',
            border: '1px solid var(--ml-border)',
            borderRadius: 'var(--ml-r-md)',
            padding: '14px 16px 10px',
            opacity: m.enabled ? 1 : 0.5,
            pointerEvents: m.enabled ? 'auto' : 'none',
          }}
        >
          <EqCurve
            bands={m.params.bands}
            selectedIndex={selected}
            onSelectBand={setSelected}
            onBandChange={setBand}
            height={220}
          />
        </div>
      </div>

      <div className="ml-card" style={{ padding: '14px 0 6px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 110px 110px 110px 80px 32px',
            padding: '0 22px 8px',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--ml-border)',
            paddingBottom: 8,
          }}
        >
          <span className="ml-eyebrow">#</span>
          <span className="ml-eyebrow">Name</span>
          <span className="ml-eyebrow">Type</span>
          <span className="ml-eyebrow" style={{ textAlign: 'right' }}>
            Freq
          </span>
          <span className="ml-eyebrow" style={{ textAlign: 'right' }}>
            Gain
          </span>
          <span className="ml-eyebrow" style={{ textAlign: 'right' }}>
            Q
          </span>
          <span />
        </div>
        {m.params.bands.map((b, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 110px 110px 110px 80px 32px',
              padding: '11px 22px',
              alignItems: 'center',
              gap: 12,
              background: i === selected ? 'var(--ml-accent-soft)' : 'transparent',
              borderLeft: i === selected ? '2px solid var(--ml-accent)' : '2px solid transparent',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--ml-accent)',
                color: 'var(--ml-accent-fg)',
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontWeight: 500 }}>{eqBandName(i)}</span>
            <select
              value={b.type}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setBand(i, { type: e.target.value as EqBand['type'] })}
              className="ml-input"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              <option value="low_shelf">low shelf</option>
              <option value="peak">peak</option>
              <option value="high_shelf">high shelf</option>
              <option value="high_pass">high pass</option>
              <option value="low_pass">low pass</option>
            </select>
            <span
              className="ml-mono"
              style={{ textAlign: 'right', color: 'var(--ml-fg)', fontSize: 11.5 }}
            >
              {b.frequencyHz >= 1000 ? `${(b.frequencyHz / 1000).toFixed(1)} kHz` : `${b.frequencyHz} Hz`}
            </span>
            <span
              className="ml-mono"
              style={{
                textAlign: 'right',
                fontSize: 11.5,
                color:
                  b.gainDb > 0
                    ? 'var(--ml-good)'
                    : b.gainDb < 0
                      ? 'var(--ml-warn)'
                      : 'var(--ml-fg-muted)',
              }}
            >
              {b.gainDb > 0 ? '+' : ''}
              {b.gainDb.toFixed(1)} dB
            </span>
            <span
              className="ml-mono"
              style={{ textAlign: 'right', color: 'var(--ml-fg-muted)', fontSize: 11.5 }}
            >
              {b.q.toFixed(2)}
            </span>
            <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto' }}>
              <Toggle
                checked={b.enabled}
                onChange={(v) => setBand(i, { enabled: v })}
                aria-label={`Band ${i + 1} on/off`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function eqBandName(i: number): string {
  return ['Low shelf', 'Low mids', 'Mids', 'Upper mids', 'High shelf'][i] ?? `Band ${i + 1}`;
}
