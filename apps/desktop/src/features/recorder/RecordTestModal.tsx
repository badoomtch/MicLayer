// Test recorder modal: countdown record, then two players for raw + tuned,
// then Save (file dialog) or Discard.
//
// The audio engine must be running before recording is meaningful — the
// modal explains that if the user opens it while stopped.

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Square, Save, Trash2 } from 'lucide-react';

import {
  recordingStart,
  recordingStop,
  recordingDiscard,
  recordingPlaybackUrl,
  saveRecordingViaDialog,
  type RecordingHandle,
} from '../../ipc/recording';
import { useAppStore } from '../../state/useAppStore';

const MAX_SECONDS = 30;

interface RecordTestModalProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'recording' | 'done';

export function RecordTestModal({ open, onClose }: RecordTestModalProps) {
  const engineRunning = useAppStore((s) => s.engine.status === 'running');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [handle, setHandle] = useState<RecordingHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const tick = useRef<number | null>(null);

  // Reset state whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setElapsedMs(0);
    setHandle(null);
    setError(null);
  }, [open]);

  const stopTick = useCallback(() => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    stopTick();
    try {
      const h = await recordingStop();
      if (h) {
        setHandle(h);
        setPhase('done');
      } else {
        setPhase('idle');
      }
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  }, [stopTick]);

  // Auto-stop at MAX_SECONDS.
  useEffect(() => {
    if (phase !== 'recording') return;
    if (elapsedMs >= MAX_SECONDS * 1000) {
      stop();
    }
  }, [phase, elapsedMs, stop]);

  const start = async () => {
    setError(null);
    try {
      const h = await recordingStart();
      setHandle(h);
      setPhase('recording');
      startedAt.current = performance.now();
      setElapsedMs(0);
      tick.current = window.setInterval(() => {
        if (startedAt.current !== null) {
          setElapsedMs(performance.now() - startedAt.current);
        }
      }, 100);
    } catch (e) {
      setError(String(e));
    }
  };

  const discard = async () => {
    if (handle) {
      try {
        await recordingDiscard(handle.raw_path);
      } catch (e) {
        console.error('recording_discard failed', e);
      }
    }
    onClose();
  };

  const save = async () => {
    if (!handle) return;
    try {
      const saved = await saveRecordingViaDialog(handle.raw_path);
      if (saved) {
        // Files were copied. Keep modal open so user can play more or close.
        // The temp WAVs remain marked as saved server-side so they aren't
        // deleted on quit either.
      }
    } catch (e) {
      console.error('saveRecordingViaDialog failed', e);
      setError(String(e));
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
    >
      <div className="w-[640px] max-w-[92vw] rounded-card border border-surface/60 bg-surface p-5 shadow-xl">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Record a test clip</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill p-1 text-muted hover:bg-bg hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {!engineRunning && (
          <p className="mb-3 rounded-card border border-meterMid/30 bg-meterMid/10 p-3 text-xs text-meterMid">
            The audio engine isn't running yet. Start it from the Dashboard
            before recording — otherwise the WAVs will be silent.
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-card border border-meterHigh/30 bg-meterHigh/10 p-3 text-xs text-meterHigh">
            {error}
          </p>
        )}

        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="max-w-md text-center text-sm text-muted">
              Speak for up to {MAX_SECONDS} seconds. MicLayer will save a
              clean copy and a tuned copy. Files stay on your computer —
              nothing is uploaded.
            </p>
            <button
              type="button"
              onClick={start}
              disabled={!engineRunning}
              className={
                'inline-flex items-center gap-2 rounded-pill px-5 py-2 text-sm font-medium ' +
                (engineRunning
                  ? 'bg-meterHigh/20 text-meterHigh hover:bg-meterHigh/30'
                  : 'bg-bg text-muted cursor-not-allowed')
              }
            >
              <Mic className="h-4 w-4" /> Start recording
            </button>
          </div>
        )}

        {phase === 'recording' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="text-3xl font-mono tabular-nums">
              {(elapsedMs / 1000).toFixed(1)} s
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-bg">
              <div
                className="h-full bg-meterHigh transition-[width] duration-100"
                style={{ width: `${Math.min(100, (elapsedMs / (MAX_SECONDS * 1000)) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-pill bg-bg px-5 py-2 text-sm hover:bg-bg/50"
            >
              <Square className="h-4 w-4" /> Stop
            </button>
          </div>
        )}

        {phase === 'done' && handle && (
          <div className="flex flex-col gap-3">
            <PlayerRow label="Raw" path={handle.raw_path} />
            <PlayerRow label="Tuned" path={handle.processed_path} />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={discard}
                className="inline-flex items-center gap-1 rounded-pill border border-meterHigh/30 px-3 py-1 text-xs text-meterHigh hover:border-meterHigh/60"
              >
                <Trash2 className="h-3 w-3" /> Discard
              </button>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center gap-1 rounded-pill bg-accent/15 px-3 py-1 text-xs text-fg hover:bg-accent/25"
              >
                <Save className="h-3 w-3" /> Save…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ label, path }: { label: string; path: string }) {
  const url = recordingPlaybackUrl(path);
  return (
    <div className="rounded-card border border-surface/60 bg-bg p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={url} controls className="w-full" />
    </div>
  );
}
