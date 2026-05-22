// First-run setup modal. Phases: idle → progress → done | failed.
// From the Claude Design handoff.

import { useEffect, useRef, useState } from 'react';
import { Mic, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL } from '../../ipc/sink';
import { vbcableInstall, onVbCableProgress, type InstallProgress } from '../../ipc/vbcable';

const DISMISSED_KEY = 'miclayer.firstrun.dismissed';

export function FirstRunModal() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    engineSinkStatus()
      .then((s) => setOpen(!s.installed))
      .catch(() => null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    onVbCableProgress((p) => setProgress(p)).then((off) => {
      if (cancelled) off();
      else unlistenRef.current = off;
    });
    return () => {
      cancelled = true;
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  const phase: 'idle' | 'progress' | 'done' | 'failed' = (() => {
    if (!progress) return 'idle';
    if (progress.stage === 'done') return 'done';
    if (progress.stage === 'failed') return 'failed';
    return 'progress';
  })();

  const close = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setOpen(false);
  };
  const install = async () => {
    setProgress({ stage: 'downloading', percent: 0, message: 'Starting…' });
    try {
      await vbcableInstall();
    } catch (e) {
      setProgress({ stage: 'failed', percent: 0, message: String(e) });
    }
  };
  const openVendor = () => openUrl(VB_CABLE_DOWNLOAD_URL).catch(() => null);

  if (!open) return null;

  const icon =
    phase === 'failed' ? <AlertTriangle size={16} /> : phase === 'done' ? <Check size={16} /> : <Mic size={16} />;
  const iconBg =
    phase === 'failed'
      ? 'color-mix(in oklch, var(--ml-bad) 14%, transparent)'
      : phase === 'done'
        ? 'color-mix(in oklch, var(--ml-good) 14%, transparent)'
        : 'var(--ml-accent-soft)';
  const iconColor =
    phase === 'failed'
      ? 'var(--ml-bad)'
      : phase === 'done'
        ? 'var(--ml-good)'
        : 'var(--ml-accent)';

  return (
    <div className="ml-scrim" role="dialog" aria-modal="true">
      <div className="ml-modal" style={{ maxWidth: 540 }}>
        <div className="ml-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: iconBg,
                color: iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </span>
            <div className="ml-eyebrow">Setup · Step 2 of 2</div>
          </div>

          {phase === 'idle' && (
            <>
              <div className="ml-modal-title">
                One more thing before MicLayer can route to other apps.
              </div>
              <div className="ml-modal-sub">
                MicLayer ships the tuned signal through a free third-party driver called VB-CABLE.
                We can install it for you — it takes about fifteen seconds and asks for admin
                permission.
              </div>
            </>
          )}
          {phase === 'progress' && (
            <>
              <div className="ml-modal-title">Installing VB-CABLE…</div>
              <div className="ml-modal-sub">
                Downloading the official installer from VB-Audio.com, then asking Windows to run it.
                You may see a UAC prompt — that's expected.
              </div>
            </>
          )}
          {phase === 'done' && (
            <>
              <div className="ml-modal-title">You're set.</div>
              <div className="ml-modal-sub">
                VB-CABLE is installed and MicLayer is routing your tuned mic. Restart Windows now or
                later — Discord, OBS, Zoom etc. will see MicLayer once you do.
              </div>
            </>
          )}
          {phase === 'failed' && (
            <>
              <div className="ml-modal-title">That didn't go as planned.</div>
              <div className="ml-modal-sub">{progress?.message}</div>
            </>
          )}
        </div>

        <div className="ml-modal-body">
          {phase === 'idle' && (
            <BulletList
              items={[
                'Local-only. Your audio never leaves your computer.',
                'You can uninstall VB-CABLE any time from Windows Settings.',
                "Already have it? We'll detect it and skip this step.",
              ]}
            />
          )}
          {phase === 'progress' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ color: 'var(--ml-fg-muted)' }}>
                  {progress?.message ?? 'Working…'}
                </span>
                {progress?.stage === 'downloading' && (
                  <span className="ml-mono" style={{ color: 'var(--ml-fg)' }}>
                    {progress.percent}%
                  </span>
                )}
              </div>
              <div
                style={{
                  height: 6,
                  background: 'var(--ml-surface-2)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, progress?.percent ?? 0)}%`,
                    background: 'var(--ml-accent)',
                    borderRadius: 3,
                    transition: 'width var(--ml-dur-2)',
                  }}
                />
              </div>
            </div>
          )}
          {phase === 'done' && (
            <div
              style={{
                background: 'var(--ml-surface-2)',
                border: '1px solid var(--ml-border)',
                borderRadius: 'var(--ml-r-md)',
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--ml-fg-muted)',
                lineHeight: 1.55,
              }}
            >
              <div style={{ color: 'var(--ml-fg)', fontWeight: 500, marginBottom: 4 }}>
                How to use MicLayer in your apps
              </div>
              In Discord, OBS, Zoom, or any app that takes a mic, choose{' '}
              <span className="ml-mono" style={{ color: 'var(--ml-fg)' }}>
                CABLE Output (VB-Audio Virtual Cable)
              </span>{' '}
              as the input device.
            </div>
          )}
          {phase === 'failed' && (
            <div
              style={{
                background: 'color-mix(in oklch, var(--ml-bad) 7%, transparent)',
                border: '1px solid color-mix(in oklch, var(--ml-bad) 30%, transparent)',
                borderRadius: 'var(--ml-r-md)',
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--ml-fg-muted)',
                lineHeight: 1.55,
              }}
            >
              You can also download VB-CABLE directly from vb-audio.com and run the installer
              yourself. MicLayer will detect it on next launch.
            </div>
          )}
        </div>

        <div className="ml-modal-foot">
          {phase === 'idle' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={openVendor}>
                I'll install it manually
              </button>
              <button type="button" className="ml-btn ghost" onClick={close}>
                Skip
              </button>
              <button type="button" className="ml-btn primary" onClick={install}>
                Install VB-CABLE
              </button>
            </>
          )}
          {phase === 'progress' && (
            <>
              <button type="button" className="ml-btn ghost" disabled>
                Cancel
              </button>
              <button type="button" className="ml-btn primary" disabled>
                Installing…
              </button>
            </>
          )}
          {phase === 'done' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={close}>
                Close
              </button>
              <button type="button" className="ml-btn primary" onClick={close}>
                Get started
              </button>
            </>
          )}
          {phase === 'failed' && (
            <>
              <button type="button" className="ml-btn ghost" onClick={openVendor}>
                <ExternalLink size={11} /> Open download page
              </button>
              <button type="button" className="ml-btn" onClick={close}>
                Close
              </button>
              <button type="button" className="ml-btn primary" onClick={install}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '6px 0 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {items.map((it, i) => (
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
          <span style={{ color: 'var(--ml-accent)', flex: '0 0 16px', marginTop: 1 }}>
            <Check size={14} />
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
