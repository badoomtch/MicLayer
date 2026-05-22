// Neutral profile used as the UI's starting point if the engine hasn't
// returned anything yet. Matches `ProfileModules::neutral()` in Rust.

import type { ProfileModules } from '@miclayer/shared';

export const NEUTRAL_MODULES: ProfileModules = {
  inputGain: { enabled: true, params: { gainDb: 0 } },
  highPass: { enabled: true, params: { mode: 'medium', cutoffHz: 80, order: 2 } },
  noiseSuppression: { enabled: false, params: { amount: 0.65, voiceFloorDb: -45 } },
  gate: {
    enabled: false,
    params: {
      thresholdDb: -50,
      rangeDb: -30,
      attackMs: 5,
      holdMs: 150,
      releaseMs: 250,
      hysteresisDb: 3,
    },
  },
  eq: {
    enabled: false,
    params: {
      bands: [
        { type: 'low_shelf', frequencyHz: 200, gainDb: 0, q: 0.7, enabled: false },
        { type: 'peak', frequencyHz: 250, gainDb: 0, q: 1.0, enabled: false },
        { type: 'peak', frequencyHz: 3000, gainDb: 0, q: 1.0, enabled: false },
        { type: 'peak', frequencyHz: 5000, gainDb: 0, q: 1.2, enabled: false },
        { type: 'high_shelf', frequencyHz: 10000, gainDb: 0, q: 0.7, enabled: false },
      ],
    },
  },
  compressor: {
    enabled: true,
    params: {
      thresholdDb: -22,
      ratio: 3,
      attackMs: 12,
      releaseMs: 150,
      kneeDb: 6,
      makeupDb: 0,
      autoMakeup: true,
      detectorMs: 10,
    },
  },
  deEsser: {
    enabled: false,
    params: { targetHz: 7000, thresholdDb: -26, amountDb: 6, q: 1.5 },
  },
  limiter: {
    enabled: true,
    params: { ceilingDb: -1, releaseMs: 50, lookaheadMs: 2 },
  },
  outputGain: { enabled: true, params: { gainDb: 0 } },
};
