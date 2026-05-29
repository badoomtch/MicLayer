// Dashboard — designed by the Claude Design handoff.
// Layout: page head with action buttons → hero row (device + sink status)
// → big meters card → quick controls.

import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, ExternalLink, Download, Save, Plus } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { useAppStore } from '../../state/useAppStore';
import { LevelMeter } from '../../shared/LevelMeter';
import { DeviceSelector } from '../../shared/DeviceSelector';
import { Slider } from '../../shared/Slider';
import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL, type SinkStatus } from '../../ipc/sink';
import { vbcableInstall, onVbCableProgress, type InstallProgress } from '../../ipc/vbcable';
import { profileSave, type Profile } from '../../ipc/profiles';
import { useProfilesBridge } from '../../state/useProfilesBridge';
import { RecordTestModal } from '../recorder/RecordTestModal';
import { AutoTuneWizard } from '../wizard/AutoTuneWizard';

export function Dashboard() {
  const refreshProfiles = useProfilesBridge();
  const {
    engine,
    modules,
    updateModule,
    builtins,
    users,
    activeProfileId,
    dirty,
    setActiveProfile,
  } = useAppStore((s) => ({
    engine: s.engine,
    modules: s.modules,
    updateModule: s.updateModule,
    builtins: s.profiles.builtins,
    users: s.profiles.users,
    activeProfileId: s.profiles.activeProfileId,
    dirty: s.profiles.dirty,
    setActiveProfile: s.setActiveProfile,
  }));
  const { meters } = engine;
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sink, setSink] = useState<SinkStatus | null>(null);

  useEffect(() => {
    engineSinkStatus().then(setSink).catch((e) => console.error('sink status', e));
  }, [engine.status]);

  const running = engine.status === 'running' || engine.status === 'starting';

  const activeProfile = [...builtins, ...users].find((p) => p.id === activeProfileId);
  const canSaveInPlace = dirty && activeProfile && activeProfile.kind === 'user';

  const onSaveChanges = async () => {
    if (!activeProfile || activeProfile.kind !== 'user') return;
    const updated: Profile = { ...activeProfile, modules };
    try {
      const saved = await profileSave(updated);
      await refreshProfiles();
      setActiveProfile(saved);
    } catch (e) {
      console.error(e);
      window.alert(`Couldn't save: ${e}`);
    }
  };

  const onSaveAsNew = async () => {
    const name = window.prompt('Name for the new profile?', 'My profile');
    if (!name) return;
    const profile: Profile = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name: name.trim(),
      kind: 'user',
      modules,
    };
    try {
      const saved = await profileSave(profile);
      await refreshProfiles();
      setActiveProfile(saved);
    } catch (e) {
      console.error(e);
      window.alert(`Couldn't save: ${e}`);
    }
  };

  return (
    <div className="ml-page">
      <div className="ml-page-head">
        <div>
          <div className="ml-page-title">Dashboard</div>
          <div className="ml-page-sub">Your mic, processed locally, ready for any app.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canSaveInPlace && (
            <button
              className="ml-btn primary"
              type="button"
              onClick={onSaveChanges}
              title={`Overwrite "${activeProfile!.name}" with your current tweaks`}
            >
              <Save size={12} /> Save changes
            </button>
          )}
          {dirty && (
            <button
              className="ml-btn"
              type="button"
              onClick={onSaveAsNew}
              title="Save your current tweaks as a brand-new profile"
            >
              <Plus size={12} /> Save as new
            </button>
          )}
          <button
            className="ml-btn"
            type="button"
            disabled={!running}
            onClick={() => setRecorderOpen(true)}
            title="Record a short clip and A/B raw vs tuned"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--ml-bad)',
              }}
            />
            Record test
          </button>
          <button
            className="ml-btn"
            type="button"
            disabled={!running}
            onClick={() => setWizardOpen(true)}
            title="Analyse your room and voice, then build a custom profile"
          >
            <Sparkles size={12} />
            Auto-tune
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div className="ml-card ml-card-pad" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div className="ml-eyebrow" style={{ marginBottom: 8 }}>
            Input device
          </div>
          <DeviceSelector />
        </div>

        <div className="ml-card ml-card-pad" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div className="ml-eyebrow" style={{ marginBottom: 8 }}>
            Virtual microphone
          </div>
          <SinkStatusBlock sink={sink} engineRunning={running} />
        </div>
      </div>

      <div className="ml-card" style={{ padding: '22px 26px', marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Signal</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="ml-mono" style={{ fontSize: 11, color: 'var(--ml-fg-faint)' }}>
              Noise floor{' '}
              <span style={{ color: 'var(--ml-fg-muted)' }}>
                {Number.isFinite(meters.noiseFloorDb) ? `${meters.noiseFloorDb.toFixed(1)} dB` : '—'}
              </span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <LevelMeter
            label="Input · raw"
            peakDb={meters.inputPeakDb}
            peakHoldDb={meters.inputPeakDb}
            clipping={meters.clipping}
            thick
          />
          <LevelMeter
            label="Output · tuned"
            peakDb={meters.outputPeakDb}
            peakHoldDb={meters.outputPeakDb}
            clipping={meters.clipping}
            thick
          />
        </div>
      </div>

      {/* Quick controls — map to the underlying module params for beginner editing */}
      <div className="ml-card" style={{ padding: '18px 26px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Quick controls</div>
          <button
            type="button"
            onClick={() => useAppStore.getState().setSection('tune')}
            style={{
              background: 'transparent',
              border: 0,
              fontSize: 12,
              color: 'var(--ml-accent)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Open Tune for advanced →
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: 28,
            rowGap: 10,
          }}
        >
          <Slider
            label="Clean up"
            hint="How aggressively to remove background noise (fans, keyboard, room rumble). 0% turns the AI noise suppressor off; 100% is most aggressive but can sound artefacty on light voices."
            value={Math.round(modules.noiseSuppression.params.amount * 100)}
            min={0}
            max={100}
            step={1}
            unit=" %"
            precision={0}
            onChange={(v) =>
              updateModule('noiseSuppression', {
                ...modules.noiseSuppression,
                enabled: v > 0,
                params: { ...modules.noiseSuppression.params, amount: v / 100 },
              })
            }
          />
          <Slider
            label="Loudness"
            hint="How much to even out volume swings (compression ratio). 1:1 is off, 3:1 is a gentle natural sound, 6:1+ sounds tight and broadcast-style."
            value={modules.compressor.params.ratio}
            min={1}
            max={10}
            step={0.1}
            display={`${modules.compressor.params.ratio.toFixed(1)} : 1`}
            onChange={(v) =>
              updateModule('compressor', {
                ...modules.compressor,
                params: { ...modules.compressor.params, ratio: v },
              })
            }
          />
          <Slider
            label="Warmth"
            hint="Low-shelf EQ around 200 Hz. Positive values add body and chestiness; negative values thin the voice and reduce rumble."
            value={modules.eq.params.bands[0]?.gainDb ?? 0}
            min={-12}
            max={12}
            step={0.1}
            unit=" dB"
            bipolar
            onChange={(v) => {
              const bands = modules.eq.params.bands.map((b, i) =>
                i === 0 ? { ...b, gainDb: v, enabled: true } : b,
              ) as typeof modules.eq.params.bands;
              updateModule('eq', { ...modules.eq, enabled: true, params: { bands } });
            }}
          />
          <Slider
            label="Sibilance"
            hint="De-esser strength on harsh S, T and SH sounds. 0 dB is off, 3–5 dB is typical, higher values can make speech sound lispy."
            value={modules.deEsser.params.amountDb}
            min={0}
            max={12}
            step={0.5}
            unit=" dB"
            onChange={(v) =>
              updateModule('deEsser', {
                ...modules.deEsser,
                enabled: v > 0,
                params: { ...modules.deEsser.params, amountDb: v },
              })
            }
          />
          <Slider
            label="Clarity"
            hint="Presence EQ around 3 kHz. Positive values bring the voice forward and add intelligibility; negative values push it back and reduce nasality."
            value={modules.eq.params.bands[2]?.gainDb ?? 0}
            min={-12}
            max={12}
            step={0.1}
            unit=" dB"
            bipolar
            onChange={(v) => {
              const bands = modules.eq.params.bands.map((b, i) =>
                i === 2 ? { ...b, gainDb: v, enabled: true } : b,
              ) as typeof modules.eq.params.bands;
              updateModule('eq', { ...modules.eq, enabled: true, params: { bands } });
            }}
          />
          <Slider
            label="Output"
            hint="Final loudness trim before the virtual mic. Use this if other apps hear you too loud or too quiet. The safety limiter keeps you from clipping."
            value={modules.outputGain.params.gainDb}
            min={-12}
            max={12}
            step={0.1}
            unit=" dB"
            bipolar
            onChange={(v) =>
              updateModule('outputGain', {
                ...modules.outputGain,
                params: { gainDb: v },
              })
            }
          />
        </div>
      </div>

      <RecordTestModal open={recorderOpen} onClose={() => setRecorderOpen(false)} />
      <AutoTuneWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function SinkStatusBlock({ sink, engineRunning }: { sink: SinkStatus | null; engineRunning: boolean }) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  useEffect(() => {
    let off: (() => void) | null = null;
    let cancelled = false;
    onVbCableProgress((p) => setProgress(p)).then((u) => {
      if (cancelled) u();
      else off = u;
    });
    return () => {
      cancelled = true;
      if (off) off();
    };
  }, []);

  if (!sink) return <div style={{ fontSize: 12, color: 'var(--ml-fg-muted)' }}>Checking…</div>;

  if (sink.installed && sink.active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ml-pill good">
          <span className="ml-dot" /> Audio flowing
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>via CABLE Output</span>
      </div>
    );
  }
  if (sink.installed && !sink.active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ml-pill warn">
          <AlertTriangle size={11} /> Sink closed
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>
          {engineRunning ? 'restart engine' : 'start the engine'}
        </span>
      </div>
    );
  }

  const installing = progress && progress.stage !== 'done' && progress.stage !== 'failed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ml-pill warn">
          <AlertTriangle size={11} /> VB-CABLE missing
        </span>
        <button
          type="button"
          className="ml-btn primary"
          style={{ padding: '6px 10px', fontSize: 12 }}
          disabled={!!installing}
          onClick={() => {
            setProgress({ stage: 'downloading', percent: 0, message: 'Starting…' });
            vbcableInstall().catch((e) =>
              setProgress({ stage: 'failed', percent: 0, message: String(e) }),
            );
          }}
        >
          <Download size={12} /> Install for me
        </button>
      </div>
      {installing && (
        <div style={{ fontSize: 11.5, color: 'var(--ml-fg-muted)' }}>{progress!.message}</div>
      )}
      {progress?.stage === 'failed' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--ml-bad)' }}>{progress.message}</span>
          <button
            type="button"
            className="ml-btn ghost"
            style={{ padding: '4px 8px', fontSize: 11.5 }}
            onClick={() => openUrl(VB_CABLE_DOWNLOAD_URL).catch(() => null)}
          >
            <ExternalLink size={11} /> Manual download
          </button>
        </div>
      )}
    </div>
  );
}

