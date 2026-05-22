// SVG-based EQ magnitude-response curve with draggable band handles.
// Uses the existing biquadResponse math.

import { useCallback, useRef } from 'react';

import type { EqBand } from '@miclayer/shared';
import { cascadeResponseDb } from './biquadResponse';

interface EqCurveProps {
  bands: EqBand[];
  height?: number;
  selectedIndex?: number | null;
  onSelectBand?: (index: number) => void;
  onBandChange?: (index: number, patch: Partial<EqBand>) => void;
  sampleRate?: number;
}

const F_MIN = 30;
const F_MAX = 18000;
const DB_MIN = -15;
const DB_MAX = 15;
const F_GRID = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const DB_GRID = [-12, -6, 0, 6, 12];

export function EqCurve({
  bands,
  height = 210,
  selectedIndex = null,
  onSelectBand,
  onBandChange,
  sampleRate = 48000,
}: EqCurveProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ index: number } | null>(null);

  const xFromFreq = (f: number, w: number) =>
    ((Math.log10(f) - Math.log10(F_MIN)) / (Math.log10(F_MAX) - Math.log10(F_MIN))) * w;
  const yFromDb = (db: number, h: number) =>
    h - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * h;
  const freqFromX = (x: number, w: number) =>
    F_MIN * Math.pow(F_MAX / F_MIN, x / w);
  const dbFromY = (y: number, h: number) =>
    DB_MAX - (y / h) * (DB_MAX - DB_MIN);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, i: number) => {
      e.stopPropagation();
      (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
      dragRef.current = { index: i };
      onSelectBand?.(i);
    },
    [onSelectBand],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!dragRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const newFreq = Math.round(freqFromX(x, rect.width));
      const newGain = Math.max(-24, Math.min(24, dbFromY(y, rect.height)));
      onBandChange?.(dragRef.current.index, {
        frequencyHz: Math.max(20, Math.min(20000, newFreq)),
        gainDb: Math.round(newGain * 10) / 10,
      });
    },
    [onBandChange],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const enabled = bands.filter((b) => b.enabled);
  // Render curve at 240 log-spaced samples
  const N = 240;
  const W = 1; // viewBox width; we'll express coordinates relative to box
  // Use a square viewBox-ish for math, but compute as percentages
  // Easier: render a rectangular viewBox sized to a default width and let CSS scale.
  const VB_W = 880;
  const VB_H = height;
  const samples = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const f = F_MIN * Math.pow(F_MAX / F_MIN, t);
    const db = cascadeResponseDb(enabled, f, sampleRate);
    return [xFromFreq(f, VB_W), yFromDb(Math.max(DB_MIN, Math.min(DB_MAX, db)), VB_H)] as const;
  });
  const path = samples.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${path} L ${VB_W} ${yFromDb(0, VB_H)} L 0 ${yFromDb(0, VB_H)} Z`;
  void W;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      style={{ display: 'block', cursor: 'crosshair' }}
    >
      {/* db gridlines */}
      {DB_GRID.map((db) => (
        <line
          key={`h-${db}`}
          x1={0}
          x2={VB_W}
          y1={yFromDb(db, VB_H)}
          y2={yFromDb(db, VB_H)}
          stroke="var(--ml-border)"
          strokeWidth={db === 0 ? 1.25 : 0.75}
          strokeDasharray={db === 0 ? '' : '2 3'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* freq gridlines */}
      {F_GRID.map((f) => (
        <line
          key={`v-${f}`}
          x1={xFromFreq(f, VB_W)}
          x2={xFromFreq(f, VB_W)}
          y1={0}
          y2={VB_H}
          stroke="var(--ml-border)"
          strokeWidth="0.6"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {F_GRID.map((f) => (
        <text
          key={`l-${f}`}
          x={xFromFreq(f, VB_W)}
          y={VB_H - 4}
          textAnchor="middle"
          fontSize="9"
          fill="var(--ml-fg-faint)"
          fontFamily="var(--ml-font-mono)"
        >
          {f >= 1000 ? `${f / 1000}k` : f}
        </text>
      ))}
      {/* area fill */}
      <path d={area} fill="var(--ml-accent)" opacity="0.1" />
      {/* curve */}
      <path
        d={path}
        fill="none"
        stroke="var(--ml-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* band handles */}
      {bands.map(
        (b, i) =>
          b.enabled && (
            <g key={i}>
              <circle
                cx={xFromFreq(b.frequencyHz, VB_W)}
                cy={yFromDb(Math.max(DB_MIN, Math.min(DB_MAX, b.gainDb)), VB_H)}
                r={selectedIndex === i ? 9 : 6.5}
                fill={selectedIndex === i ? 'var(--ml-accent)' : 'var(--ml-surface)'}
                stroke="var(--ml-accent)"
                strokeWidth="2"
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={xFromFreq(b.frequencyHz, VB_W)}
                y={yFromDb(Math.max(DB_MIN, Math.min(DB_MAX, b.gainDb)), VB_H) + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill={selectedIndex === i ? 'var(--ml-accent-fg)' : 'var(--ml-accent)'}
                pointerEvents="none"
              >
                {i + 1}
              </text>
            </g>
          ),
      )}
    </svg>
  );
}
