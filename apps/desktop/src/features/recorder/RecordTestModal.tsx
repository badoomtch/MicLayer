// Record test — idle / recording / done with two waveform players.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Save, Trash2, Check } from 'lucide-react';

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

type Phase = 'idle' | 'recording' | 'done';

interface RecordTestModalProps {
  open: boolean;
  onClose: () => void;
}

export function RecordTestModal({ open, onClose }: RecordTestModalProps) {
  const engineRunning = useAppStore((s) => s.engine.status === 'running');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [handle, setHandle] = useState<RecordingHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const tick = useRef<number | null>(null);

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

  useEffect(() => {
    if (phase !== 'recording') return;
    if (elapsedMs >= MAX_SECONDS * 1000) stop();
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
      }, 80);
    } catch (e) {
      setError(String(e));
    }
  };

  const discard = async () => {
    if (handle) {
      try {
        await recordingDiscard(handle.raw_path);
      } catch (e) {
        console.error(e);
      }
    }
    onClose();
  };

  const save = async () => {
    if (!handle) return;
    try {
      await saveRecordingViaDialog(handle.raw_path);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!open) return null;

  const pctOfMax = (elapsedMs / (MAX_SECONDS * 1000)) * 100;

  return (
    <div className="ml-scrim" role="dialog" aria-modal="true">
      <div className="ml-modal" style={{ maxWidth: 620 }}>
        <div className="ml-modal-head">
          <div className="ml-modal-title">Record test</div>
          <div className="ml-modal-sub">
            Capture a short clip with both your raw mic and the tuned signal, side by side.
            Recordings stay on your computer and are deleted unless you save them.
          </div>
        </div>
        <div className="ml-modal-body">
          {!engineRunning && (
            <p
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                fontSize: 12,
                color: 'var(--ml-warn)',
                background: 'color-mix(in oklch, var(--ml-warn) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--ml-warn) 30%, transparent)',
                borderRadius: 'var(--ml-r-md)',
              }}
            >
              The audio engine isn't running. Start it from the Dashboard before recording.
            </p>
          )}
          {error && (
            <p
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                fontSize: 12,
                color: 'var(--ml-bad)',
                background: 'color-mix(in oklch, var(--ml-bad) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--ml-bad) 30%, transparent)',
                borderRadius: 'var(--ml-r-md)',
              }}
            >
              {error}
            </p>
          )}

          {phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {[
                  "We'll record up to 30 seconds.",
                  'Try a normal-volume sentence, then something louder.',
                  "You'll get raw and tuned audio side by side to compare.",
                ].map((s, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      fontSize: 12.5,
                      color: 'var(--ml-fg)',
                    }}
                  >
                    <Check size={14} style={{ color: 'var(--ml-accent)', marginTop: 1 }} />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase === 'recording' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--ml-bad)',
                      boxShadow:
                        '0 0 0 4px color-mix(in oklch, var(--ml-bad) 22%, transparent)',
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>Recording</span>
                </div>
                <div className="ml-mono" style={{ fontSize: 22, fontWeight: 500 }}>
                  {(elapsedMs / 1000).toFixed(1)}s
                </div>
              </div>
              <div
                style={{
                  height: 4,
                  background: 'var(--ml-surface-2)',
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, pctOfMax)}%`,
                    background: 'var(--ml-bad)',
                    borderRadius: 2,
                    transition: 'width 80ms linear',
                  }}
                />
              </div>
            </div>
          )}

          {phase === 'done' && handle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
              <PlayerRow label="Raw" tag="straight from your mic" path={handle.raw_path} />
              <PlayerRow
                label="Tuned"
                tag="after the chain"
                path={handle.processed_path}
                highlight
              />
            </div>
          )}
        </div>
        <div className="ml-modal-foot">
          {phase === 'idle' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ml-btn primary"
                onClick={start}
                disabled={!engineRunning}
              >
                Start recording
              </button>
            </>
          )}
          {phase === 'recording' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="ml-btn" onClick={stop}>
                Stop now
              </button>
            </>
          )}
          {phase === 'done' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={discard}>
                <Trash2 size={11} /> Discard
              </button>
              <button type="button" className="ml-btn primary" onClick={save}>
                <Save size={11} /> Save…
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  label,
  tag,
  path,
  highlight,
}: {
  label: string;
  tag: string;
  path: string;
  highlight?: boolean;
}) {
  const url = recordingPlaybackUrl(path);
  return (
    <div
      style={{
        border: '1px solid ' + (highlight ? 'color-mix(in oklch, var(--ml-accent) 28%, transparent)' : 'var(--ml-border)'),
        background: highlight ? 'var(--ml-accent-soft)' : 'var(--ml-surface-2)',
        borderRadius: 'var(--ml-r-md)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--ml-surface)',
          border: '1px solid var(--ml-border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Play size={12} fill="currentColor" />
      </span>
      <div style={{ minWidth: 80 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--ml-fg-faint)' }}>{tag}</div>
      </div>
      <audio src={url} controls className="ml-no-drag" style={{ flex: 1, height: 28 }} />
    </div>
  );
}
