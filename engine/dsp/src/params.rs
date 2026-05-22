// SCAFFOLD: param structs mirroring the JSON profile schema in
// packages/shared/schemas/profile.schema.json.
//
// Each module's Params struct is serde-tagged so we can round-trip
// profiles between disk and engine. Defaults are documented in
// docs/dsp-chain.md per module.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct InputGainParams {
    #[serde(rename = "gainDb")]
    pub gain_db: f32,
}

impl Default for InputGainParams {
    fn default() -> Self { Self { gain_db: 0.0 } }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct HighPassParams {
    pub mode: HighPassMode,
    #[serde(rename = "cutoffHz")]
    pub cutoff_hz: f32,
    pub order: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HighPassMode {
    Off,
    Low,
    Medium,
    Strong,
    Custom,
}

impl Default for HighPassParams {
    fn default() -> Self {
        Self { mode: HighPassMode::Medium, cutoff_hz: 80.0, order: 2 }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct NoiseSuppressionParams {
    pub amount: f32,
    #[serde(rename = "voiceFloorDb")]
    pub voice_floor_db: f32,
}

impl Default for NoiseSuppressionParams {
    fn default() -> Self { Self { amount: 0.65, voice_floor_db: -45.0 } }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GateParams {
    #[serde(rename = "thresholdDb")]
    pub threshold_db: f32,
    #[serde(rename = "rangeDb")]
    pub range_db: f32,
    #[serde(rename = "attackMs")]
    pub attack_ms: f32,
    #[serde(rename = "holdMs")]
    pub hold_ms: f32,
    #[serde(rename = "releaseMs")]
    pub release_ms: f32,
    #[serde(rename = "hysteresisDb")]
    pub hysteresis_db: f32,
}

impl Default for GateParams {
    fn default() -> Self {
        Self {
            threshold_db: -50.0,
            range_db: -30.0,
            attack_ms: 5.0,
            hold_ms: 150.0,
            release_ms: 250.0,
            hysteresis_db: 3.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EqBand {
    #[serde(rename = "type")]
    pub kind: EqBandType,
    #[serde(rename = "frequencyHz")]
    pub frequency_hz: f32,
    #[serde(rename = "gainDb")]
    pub gain_db: f32,
    pub q: f32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EqBandType {
    LowShelf,
    Peak,
    HighShelf,
    HighPass,
    LowPass,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqParams {
    pub bands: [EqBand; 5],
}

impl Default for EqParams {
    fn default() -> Self {
        Self {
            bands: [
                EqBand { kind: EqBandType::LowShelf,  frequency_hz: 200.0,   gain_db: 0.0, q: 0.7, enabled: false },
                EqBand { kind: EqBandType::Peak,      frequency_hz: 250.0,   gain_db: 0.0, q: 1.0, enabled: false },
                EqBand { kind: EqBandType::Peak,      frequency_hz: 3000.0,  gain_db: 0.0, q: 1.0, enabled: false },
                EqBand { kind: EqBandType::Peak,      frequency_hz: 5000.0,  gain_db: 0.0, q: 1.2, enabled: false },
                EqBand { kind: EqBandType::HighShelf, frequency_hz: 10000.0, gain_db: 0.0, q: 0.7, enabled: false },
            ],
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CompressorParams {
    #[serde(rename = "thresholdDb")]
    pub threshold_db: f32,
    pub ratio: f32,
    #[serde(rename = "attackMs")]
    pub attack_ms: f32,
    #[serde(rename = "releaseMs")]
    pub release_ms: f32,
    #[serde(rename = "kneeDb")]
    pub knee_db: f32,
    #[serde(rename = "makeupDb")]
    pub makeup_db: f32,
    #[serde(rename = "autoMakeup")]
    pub auto_makeup: bool,
    #[serde(rename = "detectorMs")]
    pub detector_ms: f32,
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self {
            threshold_db: -22.0,
            ratio: 3.0,
            attack_ms: 12.0,
            release_ms: 150.0,
            knee_db: 6.0,
            makeup_db: 0.0,
            auto_makeup: true,
            detector_ms: 10.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DeEsserParams {
    #[serde(rename = "targetHz")]
    pub target_hz: f32,
    #[serde(rename = "thresholdDb")]
    pub threshold_db: f32,
    #[serde(rename = "amountDb")]
    pub amount_db: f32,
    pub q: f32,
}

impl Default for DeEsserParams {
    fn default() -> Self {
        Self { target_hz: 7000.0, threshold_db: -26.0, amount_db: 6.0, q: 1.5 }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LimiterParams {
    #[serde(rename = "ceilingDb")]
    pub ceiling_db: f32,
    #[serde(rename = "releaseMs")]
    pub release_ms: f32,
    #[serde(rename = "lookaheadMs")]
    pub lookahead_ms: f32,
}

impl Default for LimiterParams {
    fn default() -> Self {
        Self { ceiling_db: -1.0, release_ms: 50.0, lookahead_ms: 2.0 }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OutputGainParams {
    #[serde(rename = "gainDb")]
    pub gain_db: f32,
}

impl Default for OutputGainParams {
    fn default() -> Self { Self { gain_db: 0.0 } }
}
