//! Top-level engine API consumed by the Tauri command layer.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread::JoinHandle;

use miclayer_devices::AudioDevice;
use miclayer_dsp::graph::{self, GraphHandles, ProfileModules};
use miclayer_virtual_mic::{self as vmic, SinkStatus};

use crate::capture::{self, ActiveCapture};
use crate::drain;
use crate::engine::{EngineFlags, EngineState};
use crate::events::{Emit, EngineEvent};
use crate::faults::EngineFault;
use crate::meters::MeterSample;
use crate::recorder::{RecorderControl, RecordingHandle};

const METER_RING_CAPACITY: usize = 256;
const FAULT_RING_CAPACITY: usize = 32;

pub struct EngineController {
    emit: Emit,
    flags: Arc<EngineFlags>,
    state: EngineState,
    session: Option<Session>,
    selected_device_id: Option<String>,
    handles: Option<GraphHandles>,
    pending_profile: ProfileModules,
    recordings_dir: PathBuf,
}

struct Session {
    capture: ActiveCapture,
    drain_handle: Option<JoinHandle<()>>,
    recorder: RecorderControl,
    sink: Option<vmic::vb_cable::VbCableSink>,
    sink_status: SinkStatus,
}

impl EngineController {
    pub fn new(emit: Emit, recordings_dir: PathBuf) -> Self {
        Self {
            emit,
            flags: EngineFlags::new(),
            state: EngineState::Stopped,
            session: None,
            selected_device_id: None,
            handles: None,
            pending_profile: ProfileModules::neutral(),
            recordings_dir,
        }
    }

    pub fn state(&self) -> EngineState {
        self.state
    }

    pub fn selected_device_id(&self) -> Option<&str> {
        self.selected_device_id.as_deref()
    }

    pub fn list_devices(&self) -> Vec<AudioDevice> {
        miclayer_devices::enumerate_inputs()
    }

    pub fn select_input(&mut self, device_id: String) {
        self.selected_device_id = Some(device_id);
    }

    pub fn set_muted(&self, muted: bool) {
        self.flags.muted.store(muted, Ordering::Relaxed);
    }

    pub fn set_raw(&self, raw: bool) {
        self.flags.raw_mode.store(raw, Ordering::Relaxed);
    }

    pub fn muted(&self) -> bool {
        self.flags.muted.load(Ordering::Relaxed)
    }

    pub fn raw(&self) -> bool {
        self.flags.raw_mode.load(Ordering::Relaxed)
    }

    pub fn apply_profile(&mut self, modules: ProfileModules) {
        if let Some(h) = self.handles.as_mut() {
            h.apply_profile(&modules);
        }
        self.pending_profile = modules;
    }

    pub fn current_profile(&self) -> &ProfileModules {
        &self.pending_profile
    }

    /// Snapshot of sink status: whether VB-CABLE is installed and whether
    /// our sink stream is currently open.
    pub fn sink_status(&self) -> SinkStatus {
        if let Some(s) = self.session.as_ref() {
            let mut st = s.sink_status.clone();
            st.active = s.sink.is_some();
            return st;
        }
        // Engine stopped: report just installed-vs-not.
        vmic::vb_cable::status()
    }

    pub fn start(&mut self) -> Result<(), EngineFault> {
        if matches!(self.state, EngineState::Running | EngineState::Starting) {
            return Ok(());
        }

        let device_id = self
            .selected_device_id
            .clone()
            .ok_or(EngineFault::InputNoDevice)?;

        self.transition(EngineState::Starting, None);

        let device = match miclayer_devices::find_input(&device_id) {
            Some(d) => d,
            None => {
                let fault = EngineFault::InputDeviceMissing { name: device_id.clone() };
                self.transition(EngineState::Faulted, Some(fault.to_string()));
                (self.emit)(EngineEvent::Error { fault: fault.clone() });
                return Err(fault);
            }
        };

        let (meter_tx, meter_rx) = rtrb::RingBuffer::<MeterSample>::new(METER_RING_CAPACITY);
        let (fault_tx, fault_rx) = rtrb::RingBuffer::<EngineFault>::new(FAULT_RING_CAPACITY);

        self.flags.drain_should_stop.store(false, Ordering::Relaxed);

        let (graph, mut handles) = graph::build();
        handles.apply_profile(&self.pending_profile);

        let (recorder, recorder_taps) = RecorderControl::new(self.recordings_dir.clone());

        // Try to open the virtual-mic sink. Engine still works without it
        // (capture + meters + recording), just no audio to other apps.
        let mut sink_status = vmic::vb_cable::status();
        let (sink_opt, sink_tx) = match vmic::vb_cable::open({
            // On sink stream error, we'd want to push a fault to the engine's
            // fault ring. But this callback can be invoked after we move
            // fault_tx into the capture stream below — instead, just log.
            // The engine's own input fault path catches the more interesting
            // failures (device gone, format mismatch).
            |detail| tracing::warn!("sink stream error: {detail}")
        }) {
            Ok((sink, prod, fmt)) => {
                sink_status.active = true;
                sink_status.format = Some(fmt);
                (Some(sink), Some(prod))
            }
            Err(err) => {
                tracing::info!("virtual-mic sink not opened: {err}");
                sink_status.active = false;
                (None, None)
            }
        };

        let capture = match capture::open(
            &device,
            self.flags.clone(),
            graph,
            recorder_taps,
            sink_tx,
            meter_tx,
            fault_tx,
        ) {
            Ok(c) => c,
            Err(fault) => {
                self.transition(EngineState::Faulted, Some(fault.to_string()));
                (self.emit)(EngineEvent::Error { fault: fault.clone() });
                return Err(fault);
            }
        };

        let drain_handle = drain::spawn(self.flags.clone(), self.emit.clone(), meter_rx, fault_rx);

        self.handles = Some(handles);
        self.session = Some(Session {
            capture,
            drain_handle: Some(drain_handle),
            recorder,
            sink: sink_opt,
            sink_status,
        });
        self.transition(EngineState::Running, None);

        Ok(())
    }

    pub fn stop(&mut self) {
        if matches!(self.state, EngineState::Stopped) {
            return;
        }

        self.transition(EngineState::Stopping, None);
        self.flags.drain_should_stop.store(true, Ordering::Relaxed);

        if let Some(mut session) = self.session.take() {
            if session.recorder.is_active() {
                session.recorder.stop();
            }
            // Drop the input stream first so it stops calling into the sink
            // producer. Then drop the sink stream.
            drop(session.capture);
            drop(session.sink);
            if let Some(h) = session.drain_handle.take() {
                let _ = h.join();
            }
        }
        self.handles = None;
        self.transition(EngineState::Stopped, None);
    }

    // ── Recording API ──

    pub fn recording_start(&self) -> Result<RecordingHandle, EngineFault> {
        let Some(session) = self.session.as_ref() else {
            return Err(EngineFault::InputNoDevice);
        };
        session.recorder.start()
    }

    pub fn recording_stop(&self) -> Option<RecordingHandle> {
        self.session.as_ref().and_then(|s| s.recorder.stop())
    }

    pub fn recording_save(&self, raw_path: &Path) -> bool {
        self.session
            .as_ref()
            .map(|s| s.recorder.mark_saved(raw_path))
            .unwrap_or(false)
    }

    pub fn recording_discard(&self, raw_path: &Path) -> bool {
        self.session
            .as_ref()
            .map(|s| s.recorder.discard(raw_path))
            .unwrap_or(false)
    }

    pub fn recording_active(&self) -> bool {
        self.session
            .as_ref()
            .map(|s| s.recorder.is_active())
            .unwrap_or(false)
    }

    fn transition(&mut self, next: EngineState, reason: Option<String>) {
        self.state = next;
        (self.emit)(EngineEvent::Status { status: next, reason });
    }
}

impl Drop for EngineController {
    fn drop(&mut self) {
        self.stop();
    }
}
