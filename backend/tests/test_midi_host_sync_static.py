"""Static regression checks for MIDI I/O, host sync, and waveform surface."""

from pathlib import Path


REPO_ROOT = Path("/app")
MAIN_CMAJOR = REPO_ROOT / "Main.cmajor"
VIEW_JS = REPO_ROOT / "view.js"


def _read(path: Path) -> str:
    assert path.exists(), f"Missing file: {path}"
    return path.read_text(encoding="utf-8")


# Module: Main.cmajor endpoint contract for plugin/DAW MIDI workflows
def test_main_declares_midi_input_and_output_endpoints():
    content = _read(MAIN_CMAJOR)

    assert "input event std::midi::Message midiIn;" in content
    assert "output event std::midi::Message midiOut;" in content


# Module: Main.cmajor host timeline sync endpoint contract
def test_main_declares_host_tempo_and_transport_inputs_and_handlers():
    content = _read(MAIN_CMAJOR)

    assert "input event std::timeline::Tempo hostTempoIn;" in content
    assert "input event std::timeline::TransportState hostTransportIn;" in content
    assert "event hostTempoIn (std::timeline::Tempo t)" in content
    assert "hostBpm = t.bpm;" in content
    assert "hasHostTempo = 1;" in content
    assert "event hostTransportIn (std::timeline::TransportState t)" in content
    assert "hostPlaying = (std::timeline::isPlaying (t) ? 1 : 0);" in content
    assert "hasHostTransport = 1;" in content


# Module: sequencer MIDI realtime + note message emission
def test_main_emits_start_stop_clock_and_note_messages():
    content = _read(MAIN_CMAJOR)

    assert "midiOut <- std::midi::createMessage (0xFA, 0, 0); // Start" in content
    assert "midiOut <- std::midi::createMessage (0xFC, 0, 0); // Stop" in content
    assert "midiOut <- std::midi::createMessage (0xF8, 0, 0); // Clock" in content

    assert "midiOut <- std::midi::createMessage (0x90, noteToPlay, 100);" in content
    assert "midiOut <- std::midi::createMessage (0x80, activeMIDINote, 0);" in content


# Module: synth waveform range in Main.cmajor parameter definition and oscillator branch
def test_main_synth_wave_range_supports_four_waveforms():
    content = _read(MAIN_CMAJOR)

    assert "input value int   synthWave    [[ name: \"Waveform\",  min: 0,     max: 3,      init: 0      ]];" in content
    assert "if (synthWave == 0)" in content
    assert "else if (synthWave == 1)" in content
    assert "else if (synthWave == 2)" in content
    assert "else" in content


# Module: UI waveform selector options should mirror the 4-wave engine contract
def test_view_waveform_selector_exposes_four_options():
    content = _read(VIEW_JS)

    assert '<option value="0">Saw</option>' in content
    assert '<option value="1">Square</option>' in content
    assert '<option value="2">Triangle</option>' in content
    assert '<option value="3">Sine</option>' in content


# Module: host-sync fallback safety should preserve internal tempo/transport behavior
def test_main_host_sync_logic_has_internal_fallback_guards():
    content = _read(MAIN_CMAJOR)

    # Transport guard: host transport only drives play/stop after host transport observed.
    assert "if (syncToHost != 0 && hasHostTransport != 0)" in content

    # Tempo guard: fall back to internal tempo unless host tempo is available.
    assert "float safeTempo = tempo;" in content
    assert "if (syncToHost != 0 && hasHostTempo != 0)" in content
    assert "safeTempo = hostBpm;" in content
