// Dashboard — real input meters + device picker + engine controls +
// Record Test launcher + virtual-mic status.

import { useEffect, useState } from 'react';
import { Mic, CheckCircle2, AlertTriangle, ExternalLink, Download, Wand2 } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { useAppStore } from '../../state/useAppStore';
import { LevelMeter } from '../../shared/LevelMeter';
import { DeviceSelector } from '../../shared/DeviceSelector';
import { EngineControls } from '../../shared/EngineControls';
import { RecordTestModal } from '../recorder/RecordTestModal';
import { AutoTuneWizard } from '../wizard/AutoTuneWizard';
import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL, type SinkStatus } from '../../ipc/sink';
import { vbcableInstall, onVbCableProgress, type InstallProgress } from '../../ipc/vbcable';

export function Dashboard() {
  const { engine } = useAppStore((s) => ({ engine: s.engine }));
  const { meters } = engine;
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sink, setSink] = useState<SinkStatus | null>(null);

  // Refresh sink status on mount and whenever engine status changes.
  useEffect(() => {
    engineSinkStatus()
      .then(setSink)
      .catch((e) => console.error('engine_sink_status failed', e));
  }, [engine.status]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Card title="Microphone">
        <div className="flex flex-col gap-4">
          <DeviceSelector />
          <div className="flex flex-wrap items-center gap-3">
            <EngineControls />
            <button
              type="button"
              onClick={() => setRecorderOpen(true)}
              disabled={engine.status !== 'running'}
              className={
                'inline-flex items-center gap-2 rounded-pill px-3 py-2 text-sm ' +
                (engine.status === 'running'
                  ? 'border border-muted/30 hover:border-accent/60'
                  : 'border border-muted/20 text-muted cursor-not-allowed')
              }
            >
              <Mic className="h-3.5 w-3.5" /> Record test
            </button>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              disabled={engine.status !== 'running'}
              className={
                'inline-flex items-center gap-2 rounded-pill px-3 py-2 text-sm ' +
                (engine.status === 'running'
                  ? 'border border-muted/30 hover:border-accent/60'
                  : 'border border-muted/20 text-muted cursor-not-allowed')
              }
            >
              <Wand2 className="h-3.5 w-3.5" /> Auto-tune
            </button>
          </div>
        </div>
      </Card>

      <Card title="Levels">
        <div className="flex flex-col gap-3">
          <LevelMeter
            label="Input"
            peakDb={meters.inputPeakDb}
            rmsDb={meters.inputRmsDb}
            clipping={meters.clipping}
          />
          <LevelMeter
            label="Output"
            peakDb={meters.outputPeakDb}
            rmsDb={meters.outputRmsDb}
            clipping={meters.clipping}
          />
          <div className="flex justify-between pt-1 text-xs text-muted">
            <span>
              Noise floor:{' '}
              <span className="text-fg">
                {Number.isFinite(meters.noiseFloorDb)
                  ? `${meters.noiseFloorDb.toFixed(1)} dB`
                  : '—'}
              </span>
            </span>
            <span>
              Engine: <span className="text-fg">{engine.status}</span>
            </span>
          </div>
        </div>
      </Card>

      <Card title="Virtual microphone">
        <SinkStatusBody sink={sink} engineRunning={engine.status === 'running'} />
      </Card>

      <RecordTestModal open={recorderOpen} onClose={() => setRecorderOpen(false)} />
      <AutoTuneWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function SinkStatusBody({
  sink,
  engineRunning,
}: {
  sink: SinkStatus | null;
  engineRunning: boolean;
}) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    onVbCableProgress((p) => setProgress(p)).then((off) => {
      if (cancelled) off();
      else unlisten = off;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const install = async () => {
    setProgress({ stage: 'downloading', percent: 0, message: 'Starting…' });
    try {
      await vbcableInstall();
    } catch (e) {
      setProgress({ stage: 'failed', percent: 0, message: String(e) });
    }
  };

  if (!sink) return <p className="text-sm text-muted">Checking…</p>;

  if (sink.installed && sink.active) {
    return (
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-meterLow" />
        <p className="text-sm text-fg">
          Audio is flowing to{' '}
          <code className="rounded bg-bg px-1 py-0.5">
            {sink.windows_facing_name ?? 'CABLE Output'}
          </code>
          . Select that device as your microphone in Discord, OBS, Zoom, your browser,
          or wherever you want the tuned signal.
        </p>
      </div>
    );
  }

  if (sink.installed && !sink.active) {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-meterMid" />
        <p className="text-sm text-muted">
          VB-CABLE is installed but the sink isn't open yet.{' '}
          {engineRunning
            ? 'Restart the engine if this persists.'
            : 'Click Start engine above to begin sending audio.'}
        </p>
      </div>
    );
  }

  const isInstalling = progress && progress.stage !== 'done' && progress.stage !== 'failed';

  return (
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-meterMid" />
      <div className="flex-1 text-sm">
        <p className="text-fg">VB-CABLE isn't installed.</p>
        <p className="mt-1 text-xs text-muted">
          MicLayer can install VB-CABLE for you — it'll download the official VB-Audio
          installer and run it. Windows will ask for administrator permission.
        </p>
        {isInstalling && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-fg">{progress!.message}</p>
            {progress!.stage === 'downloading' && (
              <div className="h-1 w-full overflow-hidden rounded-pill bg-bg">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.min(100, progress!.percent)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {progress?.stage === 'failed' && (
          <p className="mt-2 text-xs text-meterHigh">{progress.message}</p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={install}
            disabled={!!isInstalling}
            className={
              'inline-flex items-center gap-1 rounded-pill px-3 py-1 text-xs ' +
              (isInstalling
                ? 'bg-bg text-muted cursor-not-allowed'
                : 'bg-accent/15 text-fg hover:bg-accent/25')
            }
          >
            <Download className="h-3 w-3" /> Install VB-CABLE for me
          </button>
          <button
            type="button"
            onClick={() => openUrl(VB_CABLE_DOWNLOAD_URL).catch(() => null)}
            className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-fg"
          >
            <ExternalLink className="h-3 w-3" />
            Manual download
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-surface/60 bg-surface p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      {children}
    </section>
  );
}
