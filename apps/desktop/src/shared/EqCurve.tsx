// Canvas-based magnitude-response curve for an EQ. Log-spaced frequency
// axis from 20 Hz to 20 kHz, linear dB axis from -24 to +24.

import { useEffect, useRef } from 'react';
import type { EqBand } from '@miclayer/shared';

import { cascadeResponseDb } from './biquadResponse';

interface EqCurveProps {
  bands: EqBand[];
  height?: number;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_DB = -24;
const MAX_DB = 24;
const SAMPLE_RATE = 48000;

export function EqCurve({ bands, height = 140 }: EqCurveProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = height;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Background grid: 0 dB line + ±12 dB
    const dbToY = (db: number) =>
      ((MAX_DB - db) / (MAX_DB - MIN_DB)) * cssH;
    const freqToX = (f: number) =>
      (Math.log10(f / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * cssW;

    ctx.strokeStyle = 'rgba(120, 130, 150, 0.18)';
    ctx.lineWidth = 1;
    for (const db of [-18, -12, -6, 6, 12, 18]) {
      ctx.beginPath();
      ctx.moveTo(0, dbToY(db));
      ctx.lineTo(cssW, dbToY(db));
      ctx.stroke();
    }
    // 0 dB center line
    ctx.strokeStyle = 'rgba(120, 130, 150, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, dbToY(0));
    ctx.lineTo(cssW, dbToY(0));
    ctx.stroke();

    // Frequency gridlines + labels (100, 1k, 10k)
    ctx.strokeStyle = 'rgba(120, 130, 150, 0.18)';
    ctx.fillStyle = 'rgba(150, 160, 180, 0.55)';
    ctx.font = '10px Inter, system-ui, sans-serif';
    for (const f of [100, 1000, 10000]) {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, cssH - 4);
    }

    // Compute the curve at ~200 log-spaced frequency points and plot.
    const N = 200;
    const accent = getComputedStyle(canvas).getPropertyValue('--ml-accent') || '#7aa2f7';
    ctx.strokeStyle = accent.trim();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const f = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
      const db = cascadeResponseDb(bands, f, SAMPLE_RATE);
      const x = (t) * cssW;
      const y = dbToY(Math.max(MIN_DB, Math.min(MAX_DB, db)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [bands, height]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block' }}
      aria-label="EQ frequency response"
    />
  );
}
