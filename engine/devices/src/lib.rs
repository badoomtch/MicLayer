//! Windows audio capture device enumeration via cpal (WASAPI backend).
//!
//! Stable IDs: cpal does not expose a stable device ID, so we use the
//! device name. On Windows this is the friendly name and is typically
//! unique across plugged devices. Duplicate names are extremely rare on
//! consumer hardware; if they occur, the first match wins. We revisit
//! when a real bug report demonstrates the problem.

#![forbid(unsafe_op_in_unsafe_fn)]

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default_communications: bool,
    pub is_default_console: bool,
    pub supported_formats: Vec<DeviceFormat>,
    pub default_sample_rate_hz: Option<u32>,
    pub default_channels: Option<u16>,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct DeviceFormat {
    pub sample_rate_hz: u32,
    pub channels: u16,
}

/// Enumerate all input devices visible to WASAPI right now.
///
/// Returns an empty Vec on enumeration failure rather than an error —
/// the UI shows "no devices" and the user can plug something in.
pub fn enumerate_inputs() -> Vec<AudioDevice> {
    let host = cpal::default_host();

    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let Ok(devices) = host.input_devices() else {
        tracing::warn!("cpal: failed to enumerate input devices");
        return Vec::new();
    };

    devices
        .filter_map(|device| describe(&device, default_name.as_deref()))
        .collect()
}

fn describe(device: &cpal::Device, default_name: Option<&str>) -> Option<AudioDevice> {
    let name = device.name().ok()?;

    let default_cfg = device.default_input_config().ok();
    let default_sample_rate_hz = default_cfg.as_ref().map(|c| c.sample_rate().0);
    let default_channels = default_cfg.as_ref().map(|c| c.channels());

    // Build a compact set of (sample_rate, channels) pairs from each
    // supported config range. We expose just the round-number rates the
    // device claims to support; the user doesn't need the full range.
    let mut formats: BTreeSet<(u32, u16)> = BTreeSet::new();
    if let Ok(configs) = device.supported_input_configs() {
        for cfg in configs {
            let channels = cfg.channels();
            let min = cfg.min_sample_rate().0;
            let max = cfg.max_sample_rate().0;
            for candidate in [44_100, 48_000, 88_200, 96_000, 176_400, 192_000] {
                if candidate >= min && candidate <= max {
                    formats.insert((candidate, channels));
                }
            }
        }
    }

    let supported_formats = formats
        .into_iter()
        .map(|(sample_rate_hz, channels)| DeviceFormat { sample_rate_hz, channels })
        .collect();

    let is_default = default_name.is_some_and(|d| d == name);

    Some(AudioDevice {
        id: name.clone(),
        is_default_communications: is_default,
        is_default_console: is_default,
        name,
        supported_formats,
        default_sample_rate_hz,
        default_channels,
    })
}

/// Look up a device by its stable ID (currently the friendly name).
pub fn find_input(id: &str) -> Option<cpal::Device> {
    let host = cpal::default_host();
    host.input_devices()
        .ok()?
        .find(|d| d.name().ok().as_deref() == Some(id))
}
