//! Meter compute + aggregation.
//!
//! The compute happens on the audio thread (real-time, allocation-free).
//! The aggregator runs on the drain thread.

use serde::Serialize;

/// A single per-callback meter snapshot. Real-time safe (POD, Copy).
#[derive(Debug, Clone, Copy)]
pub struct MeterSample {
    pub input_peak: f32,
    pub input_rms: f32,
    pub output_peak: f32,
    pub output_rms: f32,
    pub clipped: bool,
    pub gate_open: bool,
}

impl MeterSample {
    pub const SILENT: Self = Self {
        input_peak: 0.0,
        input_rms: 0.0,
        output_peak: 0.0,
        output_rms: 0.0,
        clipped: false,
        gate_open: true,
    };
}

/// Compute peak (max |x|) and RMS over a single buffer, allocation-free.
#[inline]
pub fn compute(buf: &[f32]) -> (f32, f32, bool) {
    if buf.is_empty() {
        return (0.0, 0.0, false);
    }
    let mut peak: f32 = 0.0;
    let mut sumsq: f32 = 0.0;
    for &s in buf {
        let a = s.abs();
        if a > peak {
            peak = a;
        }
        sumsq += s * s;
    }
    let rms = (sumsq / buf.len() as f32).sqrt();
    let clipped = peak >= 1.0;
    (peak, rms, clipped)
}

/// Drain-thread accumulator over a UI tick (~33 ms window).
/// Tracks max peak (worst-case visualisation) and mean RMS.
#[derive(Debug, Default)]
pub struct MeterAccumulator {
    samples: u32,
    input_peak_max: f32,
    input_rms_sum: f32,
    output_peak_max: f32,
    output_rms_sum: f32,
    clipped_any: bool,
}

impl MeterAccumulator {
    pub fn merge(&mut self, s: MeterSample) {
        self.samples = self.samples.saturating_add(1);
        if s.input_peak > self.input_peak_max {
            self.input_peak_max = s.input_peak;
        }
        if s.output_peak > self.output_peak_max {
            self.output_peak_max = s.output_peak;
        }
        self.input_rms_sum += s.input_rms;
        self.output_rms_sum += s.output_rms;
        if s.clipped {
            self.clipped_any = true;
        }
    }

    pub fn finalize(self) -> Option<MeterAggregate> {
        if self.samples == 0 {
            return None;
        }
        let n = self.samples as f32;
        let input_rms = self.input_rms_sum / n;
        let output_rms = self.output_rms_sum / n;
        Some(MeterAggregate {
            input_peak_db: to_db(self.input_peak_max),
            input_rms_db: to_db(input_rms),
            output_peak_db: to_db(self.output_peak_max),
            output_rms_db: to_db(output_rms),
            clipping: self.clipped_any,
            // Milestone 2 has no gate; noise-floor estimate is the RMS of
            // the captured window. A real noise-floor estimator that tracks
            // below-speech RMS arrives with the gate in Milestone 3.
            noise_floor_db: to_db(input_rms),
        })
    }
}

/// Aggregated meter values shipped to the UI. dB ref: 0 dBFS = full scale.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct MeterAggregate {
    #[serde(rename = "inputPeakDb")]
    pub input_peak_db: f32,
    #[serde(rename = "inputRmsDb")]
    pub input_rms_db: f32,
    #[serde(rename = "outputPeakDb")]
    pub output_peak_db: f32,
    #[serde(rename = "outputRmsDb")]
    pub output_rms_db: f32,
    #[serde(rename = "clipping")]
    pub clipping: bool,
    #[serde(rename = "noiseFloorDb")]
    pub noise_floor_db: f32,
}

impl MeterAggregate {
    pub const SILENT: Self = Self {
        input_peak_db: -120.0,
        input_rms_db: -120.0,
        output_peak_db: -120.0,
        output_rms_db: -120.0,
        clipping: false,
        noise_floor_db: -120.0,
    };
}

#[inline]
fn to_db(linear: f32) -> f32 {
    if linear <= 1.0e-6 {
        -120.0
    } else {
        20.0 * linear.log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_empty() {
        let (p, r, c) = compute(&[]);
        assert_eq!((p, r, c), (0.0, 0.0, false));
    }

    #[test]
    fn compute_full_scale_sine() {
        // Quarter cycle of full-scale sine: peak should hit 1.0.
        let buf: Vec<f32> = (0..1024)
            .map(|i| (i as f32 / 4096.0 * std::f32::consts::TAU).sin())
            .collect();
        let (peak, rms, _) = compute(&buf);
        assert!(peak <= 1.0 && peak > 0.6);
        // RMS of sine = peak / sqrt(2). Allow slack since we're not a full period.
        assert!(rms > 0.0 && rms < 1.0);
    }

    #[test]
    fn clip_detected() {
        let buf = vec![1.0_f32; 128];
        let (peak, _, clipped) = compute(&buf);
        assert_eq!(peak, 1.0);
        assert!(clipped);
    }

    #[test]
    fn db_floor() {
        assert_eq!(to_db(0.0), -120.0);
        assert!((to_db(1.0) - 0.0).abs() < 1e-3);
        assert!((to_db(0.5) - (-6.02)).abs() < 0.05);
    }
}
