//! Auto-tune wizard.
//!
//! Three phases the user records with the existing recorder. After each
//! phase the frontend hands us the WAV path, we read it and compute
//! summary stats. Once all three are in, `synthesize_profile_from_stats`
//! turns them into a fresh `ProfileModules` plus a list of plain-English
//! reasons the UI displays.

use std::path::PathBuf;

use biquad::{Biquad as _, Coefficients, DirectForm2Transposed, ToHertz, Type as BiquadType};
use miclayer_audio::ProfileModules;
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PhaseStats {
    pub peak_db: f32,
    pub rms_db: f32,
    pub noise_floor_db: f32,
    pub low_band_db: f32,
    pub mid_band_db: f32,
    pub high_band_db: f32,
    pub sibilance_ratio_db: f32,
    pub sample_count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct WizardResult {
    pub modules: ProfileModules,
    pub recommendations: Vec<String>,
}

#[tauri::command]
pub async fn wizard_analyze(path: String) -> Result<PhaseStats, String> {
    tauri::async_runtime::spawn_blocking(move || analyze_wav(&PathBuf::from(path)))
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub fn wizard_synthesize(
    state: tauri::State<AppState>,
    silence: PhaseStats,
    normal: PhaseStats,
    loud: PhaseStats,
) -> WizardResult {
    let mut modules = state.controller.lock().current_profile().clone();
    let mut recs = Vec::new();
    apply_recommendations(&silence, &normal, &loud, &mut modules, &mut recs);
    WizardResult { modules, recommendations: recs }
}

fn analyze_wav(path: &std::path::Path) -> Result<PhaseStats, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("open wav: {e}"))?;
    let spec = reader.spec();
    let scale = if spec.sample_format == hound::SampleFormat::Int {
        1.0_f32 / ((1 << (spec.bits_per_sample - 1)) as f32)
    } else {
        1.0
    };

    // Pull all samples into a Vec<f32> normalized to [-1, 1]. Recordings
    // are <=30 s; memory is fine.
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .filter_map(Result::ok)
            .map(|s| s as f32 * scale)
            .collect(),
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .filter_map(Result::ok)
            .collect(),
    };

    if samples.is_empty() {
        return Err("empty recording".into());
    }

    let sr = spec.sample_rate;
    let n = samples.len();
    let mut peak = 0.0_f32;
    let mut sumsq = 0.0_f64;
    for &s in &samples {
        let a = s.abs();
        if a > peak {
            peak = a;
        }
        sumsq += (s as f64) * (s as f64);
    }
    let rms = ((sumsq / n.max(1) as f64).sqrt()) as f32;

    // Noise floor — sliding 50 ms window RMS, take the minimum.
    let window = (sr as usize / 20).max(1);
    let mut noise_floor = f32::INFINITY;
    let mut idx = 0;
    while idx + window <= n {
        let mut s = 0.0_f64;
        for &v in &samples[idx..idx + window] {
            s += (v as f64) * (v as f64);
        }
        let r = (s / window as f64).sqrt() as f32;
        if r < noise_floor {
            noise_floor = r;
        }
        idx += window;
    }
    if !noise_floor.is_finite() {
        noise_floor = rms;
    }

    let low_db = band_rms_db(&samples, sr, 30.0, 200.0);
    let mid_db = band_rms_db(&samples, sr, 200.0, 4000.0);
    let high_db = band_rms_db(&samples, sr, 4000.0, 10000.0);

    Ok(PhaseStats {
        peak_db: to_db(peak),
        rms_db: to_db(rms),
        noise_floor_db: to_db(noise_floor),
        low_band_db: low_db,
        mid_band_db: mid_db,
        high_band_db: high_db,
        sibilance_ratio_db: high_db - mid_db,
        sample_count: n as u32,
    })
}

fn band_rms_db(samples: &[f32], sample_rate: u32, low_hz: f32, high_hz: f32) -> f32 {
    let sr = sample_rate.max(8000);
    let nyq = sr as f32 * 0.499;
    let lo = low_hz.clamp(20.0, nyq);
    let hi = high_hz.clamp(20.0, nyq);
    if hi <= lo {
        return -120.0;
    }
    let centre = ((lo * hi).sqrt()).clamp(20.0, nyq);
    let bandwidth = hi - lo;
    let q = (centre / bandwidth).clamp(0.3, 5.0);
    let Ok(coeffs) =
        Coefficients::<f32>::from_params(BiquadType::BandPass, (sr as f32).hz(), centre.hz(), q)
    else {
        return -120.0;
    };
    let mut bp = DirectForm2Transposed::<f32>::new(coeffs);
    let mut sumsq = 0.0_f64;
    for &s in samples {
        let y = bp.run(s);
        sumsq += (y as f64) * (y as f64);
    }
    let rms = (sumsq / samples.len().max(1) as f64).sqrt() as f32;
    to_db(rms)
}

fn to_db(x: f32) -> f32 {
    if x <= 1.0e-6 {
        -120.0
    } else {
        20.0 * x.log10()
    }
}

fn apply_recommendations(
    silence: &PhaseStats,
    normal: &PhaseStats,
    loud: &PhaseStats,
    modules: &mut ProfileModules,
    recs: &mut Vec<String>,
) {
    // 1. Input gain: target normal speech RMS to ~-18 dB.
    let target_rms_db = -18.0_f32;
    let gain_offset = target_rms_db - normal.rms_db;
    let gain_db = gain_offset.clamp(-12.0, 12.0);
    if gain_db.abs() >= 0.5 {
        modules.input_gain.params.gain_db = gain_db;
        modules.input_gain.enabled = true;
        if gain_db > 0.5 {
            recs.push(format!(
                "Your mic ran quiet — added +{:.1} dB input gain so normal speech sits around -18 dB.",
                gain_db
            ));
        } else if gain_db < -0.5 {
            recs.push(format!(
                "Your mic ran hot — pulled input down by {:.1} dB so it stops near -18 dB.",
                gain_db
            ));
        }
    }

    // 2. High-pass: if low-band noise floor is comparable to mid-band, enable HP.
    let low_excess = silence.low_band_db - silence.mid_band_db;
    if low_excess > -3.0 {
        modules.high_pass.enabled = true;
        modules.high_pass.params.mode = miclayer_audio::dsp_params::HighPassMode::Medium;
        modules.high_pass.params.cutoff_hz = 80.0;
        modules.high_pass.params.order = 2;
        recs.push(
            "Detected low-end rumble in your room (HVAC, traffic). Enabled an 80 Hz high-pass."
                .into(),
        );
    } else {
        modules.high_pass.enabled = true;
        modules.high_pass.params.mode = miclayer_audio::dsp_params::HighPassMode::Low;
        modules.high_pass.params.cutoff_hz = 60.0;
    }

    // 3. Noise suppression: based on signal-to-noise.
    let snr = normal.rms_db - silence.rms_db;
    if snr < 10.0 {
        modules.noise_suppression.enabled = true;
        modules.noise_suppression.params.amount = 0.9;
        recs.push(format!(
            "Background noise is loud (SNR ~{:.0} dB). Set noise suppression to high.",
            snr
        ));
    } else if snr < 20.0 {
        modules.noise_suppression.enabled = true;
        modules.noise_suppression.params.amount = 0.6;
        recs.push("Some background noise. Set noise suppression to medium.".into());
    } else if snr < 30.0 {
        modules.noise_suppression.enabled = true;
        modules.noise_suppression.params.amount = 0.35;
        recs.push("Quiet room. Light noise suppression engaged.".into());
    } else {
        modules.noise_suppression.enabled = false;
        recs.push("Room is quiet enough that noise suppression isn't needed.".into());
    }

    // 4. Gate: threshold between silence ceiling and normal floor.
    let gate_thresh = ((silence.rms_db + 8.0) + (normal.rms_db - 14.0)) * 0.5;
    let gate_thresh = gate_thresh.clamp(-70.0, -28.0);
    modules.gate.enabled = silence.rms_db < -45.0;
    if modules.gate.enabled {
        modules.gate.params.threshold_db = gate_thresh;
        recs.push(format!(
            "Set a gate at {:.0} dB to mute the room between sentences.",
            gate_thresh
        ));
    }

    // 5. Compressor: threshold a few dB above normal RMS.
    modules.compressor.enabled = true;
    let comp_thresh = (normal.rms_db + 2.0).clamp(-30.0, -10.0);
    modules.compressor.params.threshold_db = comp_thresh;
    modules.compressor.params.ratio = 3.0;
    modules.compressor.params.auto_makeup = true;
    recs.push(format!(
        "Compressor threshold set to {:.0} dB (just above normal speech) for consistent loudness.",
        comp_thresh
    ));

    // 6. De-esser: if sibilance ratio in normal speech is unusually high.
    if normal.sibilance_ratio_db > -8.0 {
        modules.de_esser.enabled = true;
        modules.de_esser.params.amount_db = 6.0;
        recs.push("Detected strong sibilance. De-esser turned on.".into());
    } else {
        modules.de_esser.enabled = false;
    }

    // 7. Limiter: ceiling -1 if loud peak gets near full scale.
    modules.limiter.enabled = true;
    modules.limiter.params.ceiling_db = -1.0;
    if loud.peak_db > -3.0 {
        recs.push("Loud bursts approached clipping. Safety limiter engaged at -1 dB.".into());
    }

    // 8. Output gain: leave at 0; user can adjust later.
    modules.output_gain.enabled = true;
    modules.output_gain.params.gain_db = 0.0;
}
