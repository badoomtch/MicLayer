// First-run setup. Shows on launch if VB-CABLE isn't installed, offering
// to install it for the user in one click. Persists a dismissed flag in
// localStorage so power users who don't want VB-CABLE can opt out.

import { useEffect, useRef, useState } from 'react';
import { X, Download, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { engineSinkStatus, VB_CABLE_DOWNLOAD_URL } from '../../ipc/sink';
import { vbcableInstall, onVbCableProgress, type InstallProgress } from '../../ipc/vbcable';

const DISMISSED_KEY = 'miclayer.firstrun.dismissed';

export function FirstRunModal() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installed, setInstalled] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Decide on mount whether to show.
  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    engineSinkStatus()
      .then((s) => {
        if (!s.installed) {
          setOpen(true);
        } else {
          setInstalled(true);
        }
      })
      .catch((e) => console.error('first-run sink check failed', e));
  }, []);

  // Subscribe to install progress.
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

  const close = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setOpen(false);
  };

  const install = async () => {
    setProgress({ stage: 'downloading', percent: 0, message: 'Starting…' });
    try {
      await vbcableInstall();
      // success — refresh sink status
      const s = await engineSinkStatus();
      setInstalled(s.installed);
    } catch (e) {
      setProgress({ stage: 'failed', percent: 0, message: String(e) });
    }
  };

  const openVendor = async () => {
    try {
      await openUrl(VB_CABLE_DOWNLOAD_URL);
    } catch (e) {
      console.error(e);
    }
  };

  if (!open) return null;

  const running = progress && progress.stage !== 'done' && progress.stage !== 'failed';
  const done = progress?.stage === 'done' || installed;
  const failed = progress?.stage === 'failed';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
    >
      <div className="w-[640px] max-w-[92vw] rounded-card border border-surface/60 bg-surface p-6 shadow-xl">
        <header className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Welcome to MicLayer</h2>
            <p className="text-xs text-muted">
              One more step before audio reaches Discord, OBS, Zoom, and the rest.
            </p>
          </div>
          {!running && (
            <button
              type="button"
              onClick={close}
              className="rounded-pill p-1 text-muted hover:bg-bg hover:text-fg"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="space-y-4 text-sm">
          {!running && !done && !failed && (
            <>
              <p className="text-fg">
                MicLayer needs a small virtual audio cable so other apps can hear your
                tuned mic. We use <b>VB-CABLE</b> — a free, well-known driver from
                VB-Audio.
              </p>
              <p className="text-xs text-muted">
                Click the button below and MicLayer will download VB-CABLE from the
                official VB-Audio site and run its installer. Windows will ask for
                administrator permission — that's the driver install. A restart is
                usually required afterwards.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-2 rounded-pill bg-accent/20 px-4 py-2 text-sm font-medium text-fg hover:bg-accent/30"
                >
                  <Download className="h-4 w-4" /> Install VB-CABLE for me
                </button>
                <button
                  type="button"
                  onClick={openVendor}
                  className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-2 text-xs text-muted hover:border-accent/60 hover:text-fg"
                >
                  <ExternalLink className="h-3 w-3" /> I'll do it myself
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="ml-auto inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-2 text-xs text-muted hover:border-accent/60 hover:text-fg"
                >
                  Skip for now
                </button>
              </div>
            </>
          )}

          {running && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-fg">{progress!.message}</p>
              {progress!.stage === 'downloading' && (
                <div className="h-1.5 w-full overflow-hidden rounded-pill bg-bg">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.min(100, progress!.percent)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted">
                {progress!.stage === 'installing'
                  ? 'Click Yes on the Windows permission prompt when it appears.'
                  : 'This usually takes 30–60 seconds.'}
              </p>
            </div>
          )}

          {done && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center gap-2 text-fg">
                <CheckCircle2 className="h-5 w-5 text-meterLow" />
                <span>VB-CABLE installed.</span>
              </div>
              <p className="text-xs text-muted">
                You may need to restart Windows for the driver to load. After restart,
                pick your microphone in MicLayer and start the engine. In Discord,
                OBS, Zoom, etc., select <code className="rounded bg-bg px-1 py-0.5 text-fg">CABLE Output (VB-Audio Virtual Cable)</code>{' '}
                as your mic.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-pill bg-accent/20 px-4 py-1.5 text-sm text-fg hover:bg-accent/30"
                >
                  Get started
                </button>
              </div>
            </div>
          )}

          {failed && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center gap-2 text-fg">
                <AlertTriangle className="h-5 w-5 text-meterHigh" />
                <span>VB-CABLE install didn't complete.</span>
              </div>
              <p className="text-xs text-muted whitespace-pre-line">{progress!.message}</p>
              <p className="text-xs text-muted">
                You can try again, or install VB-CABLE manually from VB-Audio's site.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-1 rounded-pill bg-accent/20 px-3 py-1.5 text-xs text-fg hover:bg-accent/30"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={openVendor}
                  className="inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-fg"
                >
                  <ExternalLink className="h-3 w-3" /> Manual download
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="ml-auto inline-flex items-center gap-1 rounded-pill border border-muted/30 px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-fg"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
