//! Allocation-free DSP helpers shared across modules.

#[inline]
pub fn db_to_lin(db: f32) -> f32 {
    10.0_f32.powf(db * 0.05) // 10^(db/20)
}

/// One-pole smoother used to ramp gain-like params over `time_const_ms`.
/// Sample-rate independent: the coefficient is recomputed when sr changes.
#[derive(Debug, Clone, Copy)]
pub struct OnePoleSmoother {
    state: f32,
    target: f32,
    coeff: f32,
    last_sr: u32,
    time_const_ms: f32,
}

impl OnePoleSmoother {
    pub fn new(initial: f32, time_const_ms: f32) -> Self {
        Self {
            state: initial,
            target: initial,
            coeff: 0.0,
            last_sr: 0,
            time_const_ms,
        }
    }

    #[inline]
    pub fn set_target(&mut self, target: f32) {
        self.target = target;
    }

    #[inline]
    pub fn reset(&mut self, value: f32) {
        self.state = value;
        self.target = value;
    }

    #[inline]
    pub fn next(&mut self, sample_rate: u32) -> f32 {
        if sample_rate != self.last_sr {
            self.coeff = coeff_for_tau(self.time_const_ms, sample_rate);
            self.last_sr = sample_rate;
        }
        self.state += (self.target - self.state) * self.coeff;
        self.state
    }
}

/// Compute a one-pole filter coefficient for a desired time constant in ms.
/// Standard formula: coeff = 1 - exp(-1 / (tau_samples)).
#[inline]
pub fn coeff_for_tau(tau_ms: f32, sample_rate: u32) -> f32 {
    if tau_ms <= 0.0 || sample_rate == 0 {
        return 1.0;
    }
    let tau_samples = tau_ms * 0.001 * sample_rate as f32;
    1.0 - (-1.0 / tau_samples).exp()
}

/// Convert an attack/release time-in-ms to a one-pole envelope coefficient.
#[inline]
pub fn env_coeff(time_ms: f32, sample_rate: u32) -> f32 {
    if time_ms <= 0.0 || sample_rate == 0 {
        return 1.0;
    }
    let n = time_ms * 0.001 * sample_rate as f32;
    (-1.0 / n).exp()
}

/// Flush a denormal float to zero. Cheap, branchless on most CPUs.
#[inline(always)]
pub fn flush_denormal(x: f32) -> f32 {
    if x.abs() < 1e-30 { 0.0 } else { x }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_round_trip() {
        assert!((db_to_lin(0.0) - 1.0).abs() < 1e-6);
        assert!((db_to_lin(6.020599) - 2.0).abs() < 1e-3);
        assert!((db_to_lin(-6.020599) - 0.5).abs() < 1e-3);
    }

    #[test]
    fn smoother_approaches_target() {
        let mut s = OnePoleSmoother::new(0.0, 10.0);
        s.set_target(1.0);
        for _ in 0..1000 {
            s.next(48_000);
        }
        // After many sample periods, state should be very close to target.
        assert!((s.state - 1.0).abs() < 1e-3);
    }

    #[test]
    fn smoother_no_glide_on_same_value() {
        let mut s = OnePoleSmoother::new(0.5, 10.0);
        s.set_target(0.5);
        let v1 = s.next(48_000);
        let v2 = s.next(48_000);
        assert_eq!(v1, 0.5);
        assert_eq!(v2, 0.5);
    }
}
