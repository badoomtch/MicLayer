//! Engine soak runner.
//!
//! Milestone 2 scope: exercises the audio-thread meter-compute path with
//! synthetic audio for a configurable duration and reports timing stats.
//!
//! Milestone 3+ wires the full DSP chain into this same harness.
//!
//! Allocation-on-audio-thread detection: NOT YET. Acceptance criterion
//! `zero allocations on the audio thread (asserted by the soak binary)`
//! requires a custom GlobalAlloc that traps allocations from threads
//! tagged `audio`. We have the structure for it but not the trap; that's
//! a tracked follow-up before declaring Milestone 2 done end-to-end.
//!
//! Usage:
//!   cargo run --release -p miclayer-soak -- --minutes 5

use std::time::{Duration, Instant};

use miclayer_audio::meters;
use tracing_subscriber::EnvFilter;

const SAMPLE_RATE_HZ: u32 = 48_000;
const BLOCK_SAMPLES: usize = 480; // 10 ms at 48 kHz

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let minutes = parse_minutes_arg().unwrap_or(1);
    let total = Duration::from_secs(60 * u64::from(minutes));
    let block_duration = Duration::from_secs_f64(BLOCK_SAMPLES as f64 / SAMPLE_RATE_HZ as f64);

    tracing::info!(
        "soak: {} minutes, block {} samples ({:.2} ms)",
        minutes,
        BLOCK_SAMPLES,
        block_duration.as_secs_f64() * 1000.0
    );

    // Pre-allocate the input buffer outside the loop. Inside the loop we
    // only fill it and call meters::compute — the same allocation-free
    // path the real audio callback uses.
    let mut buf = vec![0.0_f32; BLOCK_SAMPLES];
    let mut phase = 0.0_f32;
    let phase_inc = 2.0 * std::f32::consts::PI * 440.0 / SAMPLE_RATE_HZ as f32;

    let start = Instant::now();
    let mut block_count: u64 = 0;
    let mut dropout_count: u64 = 0;
    let mut max_block_ns: u128 = 0;
    let mut total_block_ns: u128 = 0;

    while start.elapsed() < total {
        // Fill the buffer with a 440 Hz sine (no allocation).
        for s in buf.iter_mut() {
            *s = (phase.sin()) * 0.5;
            phase += phase_inc;
            if phase > std::f32::consts::TAU {
                phase -= std::f32::consts::TAU;
            }
        }

        // Time the audio-thread work.
        let t = Instant::now();
        let _ = meters::compute(&buf);
        let elapsed_ns = t.elapsed().as_nanos();

        total_block_ns += elapsed_ns;
        if elapsed_ns > max_block_ns {
            max_block_ns = elapsed_ns;
        }
        block_count += 1;

        // Treat anything taking more than 90% of the block budget as a dropout.
        let budget_ns = (block_duration.as_secs_f64() * 1e9 * 0.9) as u128;
        if elapsed_ns > budget_ns {
            dropout_count += 1;
        }

        std::thread::sleep(block_duration);
    }

    let avg_block_ns = if block_count > 0 {
        total_block_ns / block_count as u128
    } else {
        0
    };

    println!(
        "soak done: blocks={} dropouts={} max_block={}us avg_block={}us",
        block_count,
        dropout_count,
        max_block_ns / 1000,
        avg_block_ns / 1000,
    );

    if dropout_count > 0 {
        std::process::exit(1);
    }
}

fn parse_minutes_arg() -> Option<u32> {
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--minutes" {
            return args.next().and_then(|s| s.parse().ok());
        }
    }
    None
}
