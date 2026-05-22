// Profile types shared between the React UI, the Tauri command layer (via
// JSON), and ultimately the Rust engine's serde-Deserialize impls.
//
// Authoritative schema: ../schemas/profile.schema.json
// Documentation: docs/profile-format.md
//
// Keep field names in sync with the JSON schema. We use camelCase here and
// `#[serde(rename = "...")]` on the Rust side.

export const PROFILE_SCHEMA_VERSION = 1 as const;

export type ProfileKind = 'builtin' | 'user';

export interface Profile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  id: string;
  name: string;
  author?: string;
  kind: ProfileKind;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  modules: ProfileModules;
}

export interface ProfileModules {
  inputGain: { enabled: boolean; params: { gainDb: number } };
  highPass: {
    enabled: boolean;
    params: {
      mode: 'off' | 'low' | 'medium' | 'strong' | 'custom';
      cutoffHz: number;
      order: 2 | 4;
    };
  };
  noiseSuppression: {
    enabled: boolean;
    params: { amount: number; voiceFloorDb: number };
  };
  gate: {
    enabled: boolean;
    params: {
      thresholdDb: number;
      rangeDb: number;
      attackMs: number;
      holdMs: number;
      releaseMs: number;
      hysteresisDb: number;
    };
  };
  eq: {
    enabled: boolean;
    params: { bands: EqBand[] };
  };
  compressor: {
    enabled: boolean;
    params: {
      thresholdDb: number;
      ratio: number;
      attackMs: number;
      releaseMs: number;
      kneeDb: number;
      makeupDb: number;
      autoMakeup: boolean;
      detectorMs: number;
    };
  };
  deEsser: {
    enabled: boolean;
    params: { targetHz: number; thresholdDb: number; amountDb: number; q: number };
  };
  limiter: {
    enabled: boolean;
    params: { ceilingDb: number; releaseMs: number; lookaheadMs: number };
  };
  outputGain: { enabled: boolean; params: { gainDb: number } };
}

export type EqBandType = 'low_shelf' | 'peak' | 'high_shelf' | 'high_pass' | 'low_pass';

export interface EqBand {
  type: EqBandType;
  frequencyHz: number;
  gainDb: number;
  q: number;
  enabled: boolean;
}
