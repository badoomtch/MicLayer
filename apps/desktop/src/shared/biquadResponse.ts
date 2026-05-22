// Biquad magnitude-response math for the EQ curve view.
//
// Uses RBJ cookbook formulas (matches what the Rust side does via the
// `biquad` crate). At each frequency we compute the cascade's dB gain by
// summing the dB contributions of every enabled band.

import type { EqBand } from '@miclayer/shared';

interface Coefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function coefficientsFor(band: EqBand, sampleRate: number): Coefficients | null {
  const sr = Math.max(sampleRate, 8000);
  const nyq = sr * 0.499;
  const f0 = Math.min(Math.max(band.frequencyHz, 20), nyq);
  const q = Math.min(Math.max(band.q, 0.1), 10);
  const omega = (2 * Math.PI * f0) / sr;
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  const A = Math.pow(10, band.gainDb / 40);
  const alpha = sinw / (2 * q);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (band.type) {
    case 'peak': {
      b0 = 1 + alpha * A;
      b1 = -2 * cosw;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosw;
      a2 = 1 - alpha / A;
      break;
    }
    case 'low_shelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosw + beta);
      b1 = 2 * A * (A - 1 - (A + 1) * cosw);
      b2 = A * (A + 1 - (A - 1) * cosw - beta);
      a0 = A + 1 + (A - 1) * cosw + beta;
      a1 = -2 * (A - 1 + (A + 1) * cosw);
      a2 = A + 1 + (A - 1) * cosw - beta;
      break;
    }
    case 'high_shelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosw + beta);
      b1 = -2 * A * (A - 1 + (A + 1) * cosw);
      b2 = A * (A + 1 + (A - 1) * cosw - beta);
      a0 = A + 1 - (A - 1) * cosw + beta;
      a1 = 2 * (A - 1 - (A + 1) * cosw);
      a2 = A + 1 - (A - 1) * cosw - beta;
      break;
    }
    case 'high_pass': {
      b0 = (1 + cosw) / 2;
      b1 = -(1 + cosw);
      b2 = (1 + cosw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw;
      a2 = 1 - alpha;
      break;
    }
    case 'low_pass': {
      b0 = (1 - cosw) / 2;
      b1 = 1 - cosw;
      b2 = (1 - cosw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw;
      a2 = 1 - alpha;
      break;
    }
    default:
      return null;
  }

  if (a0 === 0) return null;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/// |H(ω)| in dB for the given frequency, against one biquad's coefficients.
function magnitudeDb(c: Coefficients, frequencyHz: number, sampleRate: number): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  const cos2w = Math.cos(2 * omega);
  const sin2w = Math.sin(2 * omega);
  const nRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const nIm = -(c.b1 * sinw + c.b2 * sin2w);
  const dRe = 1 + c.a1 * cosw + c.a2 * cos2w;
  const dIm = -(c.a1 * sinw + c.a2 * sin2w);
  const numSq = nRe * nRe + nIm * nIm;
  const denSq = dRe * dRe + dIm * dIm;
  if (denSq <= 0 || numSq <= 0) return -120;
  return 10 * Math.log10(numSq / denSq);
}

/// Cascade response in dB for an array of bands.
export function cascadeResponseDb(
  bands: EqBand[],
  frequencyHz: number,
  sampleRate = 48000,
): number {
  let totalDb = 0;
  for (const band of bands) {
    if (!band.enabled) continue;
    const c = coefficientsFor(band, sampleRate);
    if (!c) continue;
    totalDb += magnitudeDb(c, frequencyHz, sampleRate);
  }
  return totalDb;
}
