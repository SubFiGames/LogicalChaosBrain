export default function createPatchView (patchConnection)
{
    const root = document.createElement ('div');
    root.attachShadow ({ mode: 'open' });

    // ----- State -----
    const state = {
        steps: Array.from ({ length: 32 }, () => ({ note: 48, active: 0, glide: 0, randomise: 0 })),
        length: 16,
        selectedStep: 0,
        playingStep: -1,

        // MIDI playback state.
        lastMidiNote: -1,
        lastMidiStep: -1,
        midiPlaybackEnabled: true
    };

    // ----- Helpers -----
    const send = (name, value) =>
    {
        if (patchConnection)
            patchConnection.sendEventOrValue (name, value);
    };

    const clampInt = (v, lo, hi) => Math.max (lo, Math.min (hi, Math.floor (Number (v))));

    const packStep = (i) =>
    {
        const s = state.steps[i];
        return (2 << 28)
             | ((i        & 255) << 20)
             | ((s.note   & 127) << 13)
             | ((s.active &   1) <<  2)
             | ((s.glide  &   1) <<  1)
             |  (s.randomise & 1);
    };

    const sendStep = (i) => send ('setStepPacked', packStep (i));

    const midiNoteName = (note) =>
    {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        return names[note % 12] + (Math.floor (note / 12) - 1);
    };

    const noteToBottomPct = (note) =>
        Math.max (18, Math.min (74, ((note - 36) / 60) * 74));

    // ----- Shadow DOM HTML + CSS -----
    root.shadowRoot.innerHTML = `
        <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            :host {
                display: block;
                font-family: 'Inter', system-ui, sans-serif;
                font-size: 13px;
                color: #d9fff7;
                background: #021111;
            }

            .app {
                min-height: 100%;
                padding: 16px;
                background: #021111;
                overflow-y: auto;
            }

            /* ---- Header ---- */
            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }

            .title {
                font-size: 26px;
                font-weight: 900;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: #00ffcc;
                text-shadow: 0 0 16px rgba(0,255,204,0.35);
            }

            .subtitle {
                margin-top: 4px;
                font-size: 11px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: rgba(217,255,247,0.55);
            }

            .badge {
                padding: 6px 12px;
                border: 1px solid rgba(255,0,255,0.45);
                border-radius: 999px;
                color: #ff7cff;
                background: rgba(255,0,255,0.08);
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.1em;
            }

            /* ---- Panel ---- */
            .panel {
                background: rgba(5,16,16,0.85);
                border: 1px solid rgba(0,255,204,0.16);
                border-radius: 16px;
                padding: 16px;
                margin-bottom: 14px;
            }

            /* ---- Transport ---- */
            .transport {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }

            button {
                border: none;
                border-radius: 10px;
                padding: 10px 14px;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.06em;
                cursor: pointer;
                transition: filter 0.15s;
            }
            button:hover { filter: brightness(1.12); }

            .btn-primary  { color: #021111; background: #00ffcc; }
            .btn-secondary { color: #d9fff7; background: rgba(255,255,255,0.07); border: 1px solid rgba(0,255,204,0.22); }
            .btn-danger   { color: #fff0fb; background: rgba(255,0,96,0.22); border: 1px solid rgba(255,0,96,0.38); }

            /* ---- Controls row ---- */
            .controls {
                display: grid;
                grid-template-columns: repeat(5, minmax(110px, 1fr));
                gap: 10px;
                margin-top: 14px;
            }

            label {
                display: grid;
                gap: 5px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(217,255,247,0.62);
            }

            input, select {
                min-height: 36px;
                border-radius: 9px;
                border: 1px solid rgba(0,255,204,0.22);
                background: rgba(0,0,0,0.25);
                color: #d9fff7;
                padding: 0 9px;
                font-size: 13px;
                outline: none;
            }
            input[type="range"] {
                min-height: 20px;
                padding: 0;
                cursor: pointer;
                accent-color: #00ffcc;
            }
            .knob-wrap {
                display: grid;
                justify-items: center;
                gap: 6px;
                min-height: 76px;
                padding: 8px 6px;
                border-radius: 12px;
                border: 1px solid rgba(0,255,204,0.18);
                background: rgba(0,0,0,0.18);
                touch-action: none;
                user-select: none;
            }

            .knob {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                position: relative;
                background:
                    radial-gradient(circle at 35% 28%, rgba(255,255,255,0.25), transparent 22%),
                    radial-gradient(circle at center, rgba(0,255,204,0.18), rgba(0,0,0,0.42));
                border: 2px solid rgba(0,255,204,0.42);
                box-shadow: 0 0 18px rgba(0,255,204,0.12), inset 0 0 18px rgba(0,0,0,0.55);
                cursor: ns-resize;
            }

            .knob::after {
                content: "";
                position: absolute;
                left: 50%;
                top: 7px;
                width: 3px;
                height: 15px;
                border-radius: 999px;
                background: #00ffcc;
                box-shadow: 0 0 8px rgba(0,255,204,0.8);
                transform: translateX(-50%);
                transform-origin: 50% 17px;
            }

            .knob-value {
                min-width: 66px;
                padding: 4px 8px;
                border-radius: 999px;
                text-align: center;
                color: #00ffcc;
                background: rgba(0,255,204,0.08);
                border: 1px solid rgba(0,255,204,0.18);
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.04em;
            }

            .knob-hint {
                font-size: 9px;
                color: rgba(217,255,247,0.42);
                letter-spacing: 0.06em;
            }
                        .midi-panel {
                display: grid;
                grid-template-columns: repeat(5, minmax(110px, 1fr));
                gap: 10px;
                align-items: end;
            }

            .status-pill {
                grid-column: 1 / -1;
                min-height: 34px;
                display: flex;
                align-items: center;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid rgba(0,255,204,0.18);
                background: rgba(0,0,0,0.20);
                color: rgba(217,255,247,0.72);
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: none;
                overflow-wrap: anywhere;
            }

            .check-row {
                min-height: 36px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 0 9px;
                border-radius: 9px;
                border: 1px solid rgba(0,255,204,0.22);
                background: rgba(0,0,0,0.25);
            }

            .check-row input {
                min-height: 0;
                width: 18px;
                height: 18px;
                accent-color: #00ffcc;
            }

            @media (max-width: 900px) {
                .midi-panel { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
            }
            /* ---- Step Grid ---- */
            .grid {
                display: grid;
                grid-template-columns: repeat(16, minmax(30px, 1fr));
                gap: 6px;
            }

            .step {
                position: relative;
                height: 78px;
                border-radius: 10px;
                border: 1px solid rgba(0,255,204,0.14);
                background: rgba(255,255,255,0.04);
                cursor: pointer;
                overflow: hidden;
                transition: box-shadow 0.1s;
            }
            .step.active  { background: rgba(0,255,204,0.08); border-color: rgba(0,255,204,0.32); }
            .step.selected { outline: 2px solid rgba(0,255,204,0.72); box-shadow: 0 0 14px rgba(0,255,204,0.2); }
            .step.playing  { background: rgba(255,0,255,0.18); border-color: rgba(255,0,255,0.72); box-shadow: 0 0 18px rgba(255,0,255,0.28); }

            .step-num {
                position: absolute;
                top: 5px; left: 6px;
                font-size: 9px;
                font-weight: 900;
                color: rgba(217,255,247,0.5);
            }
            .step-note {
                position: absolute;
                left: 6px; right: 6px; bottom: 6px;
                font-size: 11px;
                font-weight: 900;
                text-align: center;
                color: #d9fff7;
            }
            .note-bar {
                position: absolute;
                left: 18%; right: 18%;
                height: 3px;
                border-radius: 999px;
                background: #00ffcc;
            }
            .flags {
                position: absolute;
                top: 5px; right: 6px;
                display: flex; gap: 3px;
            }
            .flag {
                width: 7px; height: 7px;
                border-radius: 999px;
                opacity: 0.25;
                background: rgba(217,255,247,0.4);
            }
            .flag.on.glide    { opacity: 1; background: #ff00ff; }
            .flag.on.randomise { opacity: 1; background: #ffee55; }

            /* ---- Step Editor ---- */
            .editor {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr 1fr;
                gap: 10px;
                align-items: end;
            }
            .editor-header {
                grid-column: 1 / -1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }
            .editor-header h3 {
                color: #00ffcc;
                font-size: 13px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .toggle-row { display: flex; flex-wrap: wrap; gap: 8px; }

            /* ---- Responsive ---- */
            @media (max-width: 900px) {
                .controls { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
                .grid     { grid-template-columns: repeat(8, minmax(30px, 1fr)); }
                .editor   { grid-template-columns: 1fr 1fr; }
            }
            @media (max-width: 480px) {
                .grid  { grid-template-columns: repeat(4, minmax(30px, 1fr)); }
            }
        </style>

        <div class="app">
            <div class="header">
                <div>
                    <div class="title">Logical Chaos</div>
                    <div class="subtitle">Melody Machine &middot; Cmajor</div>
                </div>
                <div class="badge">v4.0.0</div>
            </div>

            <div class="panel">
                <div class="transport">
                    <button id="btnGenerate" class="btn-primary">GENERATE</button>
                    <button id="btnPlay"     class="btn-primary">PLAY</button>
                    <button id="btnMutate"   class="btn-secondary">MUTATE</button>
                    <button id="btnStop"     class="btn-danger">STOP</button>
                    <button id="btnClear"    class="btn-secondary">CLEAR</button>
                    <button id="btnDump"     class="btn-secondary">REFRESH UI</button>
                </div>
                <div class="controls">
                    <label>Steps
                        <select id="patternLength">
                            <option value="8">8</option>
                            <option value="12">12</option>
                            <option value="14">14</option>
                            <option value="16" selected>16</option>
                            <option value="18">18</option>
                            <option value="20">20</option>
                            <option value="24">24</option>
                            <option value="32">32</option>
                        </select>
                    </label>
                    <label>Time Sig
                        <select id="timeSignature">
                            <option value="4/4/16" selected>4/4 - 16 steps</option>
                            <option value="3/4/12">3/4 - 12 steps</option>
                            <option value="5/4/20">5/4 - 20 steps</option>
                            <option value="6/8/12">6/8 - 12 steps</option>
                            <option value="7/8/14">7/8 - 14 steps</option>
                            <option value="9/8/18">9/8 - 18 steps</option>
                            <option value="12/8/24">12/8 - 24 steps</option>
                        </select>
                    </label>
                    <label>Root Note
                        <select id="rootNote">
                            <option value="36">C2</option>
                            <option value="37">C#2</option>
                            <option value="38">D2</option>
                            <option value="39">D#2</option>
                            <option value="40">E2</option>
                            <option value="41">F2</option>
                            <option value="42">F#2</option>
                            <option value="43">G2</option>
                            <option value="44">G#2</option>
                            <option value="45">A2</option>
                            <option value="46">A#2</option>
                            <option value="47">B2</option>

                            <option value="48" selected>C3</option>
                            <option value="49">C#3</option>
                            <option value="50">D3</option>
                            <option value="51">D#3</option>
                            <option value="52">E3</option>
                            <option value="53">F3</option>
                            <option value="54">F#3</option>
                            <option value="55">G3</option>
                            <option value="56">G#3</option>
                            <option value="57">A3</option>
                            <option value="58">A#3</option>
                            <option value="59">B3</option>

                            <option value="60">C4</option>
                            <option value="61">C#4</option>
                            <option value="62">D4</option>
                            <option value="63">D#4</option>
                            <option value="64">E4</option>
                            <option value="65">F4</option>
                            <option value="66">F#4</option>
                            <option value="67">G4</option>
                            <option value="68">G#4</option>
                            <option value="69">A4</option>
                            <option value="70">A#4</option>
                            <option value="71">B4</option>

                            <option value="72">C5</option>
                        </select>
                    </label>

                    <label>Tempo
                        <div id="tempoKnob" class="knob-wrap" data-min="50" data-max="220" data-step="1" data-value="120" data-suffix=" BPM">
                            <div class="knob"></div>
                            <div class="knob-value">120 BPM</div>
                            <div class="knob-hint">drag up/down</div>
                        </div>
                    </label>

                    <label>Master
                        <div id="masterVolumeKnob" class="knob-wrap" data-min="0" data-max="100" data-step="1" data-value="80" data-suffix="%">
                            <div class="knob"></div>
                            <div class="knob-value">80%</div>
                            <div class="knob-hint">drag up/down</div>
                        </div>
                    </label>

                    <label>Style
                        <select id="styleType">
                            <option value="0" selected>Auto</option>
                            <option value="1">Classical</option>
                            <option value="2">Pop</option>
                            <option value="3">Ambient</option>
                            <option value="4">Synthwave</option>
                            <option value="5">Techno</option>
                            <option value="6">House</option>
                            <option value="7">Hip Hop / Trap</option>
                            <option value="8">Cinematic</option>
                            <option value="9">Experimental</option>
                        </select>
                    </label>

                    <label>Scale
                        <select id="scaleType">
                            <option value="0" selected>Major</option>
                            <option value="1">Natural Minor</option>
                            <option value="2">Harmonic Minor</option>
                            <option value="3">Dorian</option>
                            <option value="4">Phrygian</option>
                            <option value="5">Lydian</option>
                            <option value="6">Mixolydian</option>
                            <option value="7">Minor Pentatonic</option>
                            <option value="8">Major Pentatonic</option>
                            <option value="9">Blues</option>
                            <option value="10">Chromatic</option>
                        </select>
                    </label>

                    <label>Complexity
                        <select id="complexityType">
                            <option value="0">Simple</option>
                            <option value="1" selected>Nice</option>
                            <option value="2">Advanced</option>
                            <option value="3">Wild</option>
                        </select>
                    </label>

                    <label>Progression
                        <select id="progressionType">
                            <option value="0" selected>Auto</option>
                            <option value="1">I - V - vi - IV</option>
                            <option value="2">I - IV - V - I</option>
                            <option value="3">i - VI - III - VII</option>
                            <option value="4">i - iv - V - i</option>
                            <option value="5">ii - V - I - vi</option>
                        </select>
                    </label>

                    <label>Shape
                        <select id="shapeType">
                            <option value="0" selected>Auto</option>
                            <option value="1">Rise</option>
                            <option value="2">Fall</option>
                            <option value="3">Arch</option>
                            <option value="4">Wave</option>
                            <option value="5">Call / Response</option>
                        </select>
                    </label>

                    <label>Chaos
                        <input id="chaos" type="range" min="0" max="100" value="35">
                    </label>

                    <label>Mutation
                        <input id="mutation" type="range" min="0" max="100" value="20">
                    </label>
                    <label>Density
                        <input id="density" type="range" min="0" max="100" value="78">
                    </label>
                    <label>Gate
                        <input id="gate" type="range" min="5" max="100" value="72">
                    </label>
                    <label>Waveform
                        <select id="synthWave">
                            <option value="0">Saw</option>
                            <option value="1">Square</option>
                            <option value="2">Triangle</option>
                            <option value="3">Sine</option>
                        </select>
                    </label>
                    <label>Cutoff
                        <input id="synthCutoff" type="range" min="50" max="5000" value="800">
                    </label>
                    <label>Resonance
                        <input id="synthRes" type="range" min="0.1" max="0.95" step="0.05" value="0.6">
                    </label>
                    <label>Env Mod
                        <input id="synthEnvMod" type="range" min="0" max="5000" value="2000">
                    </label>
                    <label>Decay
                        <input id="synthDecay" type="range" min="0.05" max="2.0" step="0.05" value="0.3">
                    </label>
                </div>
            </div>
            <div class="panel">
                <div class="editor-header" style="margin-bottom: 10px;">
                    <h3>MIDI Output</h3>
                </div>

                <div class="midi-panel">
                    <button id="btnMidiRefresh" class="btn-secondary">REFRESH MIDI</button>
                    <button id="btnMidiTest" class="btn-secondary">TEST C3</button>

                    <label>MIDI Send
                        <span class="check-row">
                            <input id="midiEnabled" type="checkbox">
                            <span>Enabled</span>
                        </span>
                    </label>

                    <label>Channel
                        <select id="midiChannel">
                            <option value="1" selected>1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                            <option value="8">8</option>
                            <option value="9">9</option>
                            <option value="10">10</option>
                            <option value="11">11</option>
                            <option value="12">12</option>
                            <option value="13">13</option>
                            <option value="14">14</option>
                            <option value="15">15</option>
                            <option value="16">16</option>
                        </select>
                    </label>

                    <label>Velocity
                        <input id="midiVelocity" type="range" min="1" max="127" value="96">
                    </label>

                    <div id="midiStatus" class="status-pill">MIDI status: not checked yet.</div>
                </div>
            </div>
            <div class="panel">
                <div id="grid" class="grid"></div>
            </div>

            <div class="panel">
                <div id="editor" class="editor"></div>
            </div>
        </div>
    `;

    // ----- DOM helpers -----
    const $ = (id) => root.shadowRoot.getElementById (id);
    const $q = (sel) => root.shadowRoot.querySelector (sel);
    // ----- Knobs -----
    function setupKnob (id, endpoint, formatter)
    {
        const wrap = $(id);
        const knob = wrap.querySelector ('.knob');
        const valueLabel = wrap.querySelector ('.knob-value');

        const min = Number (wrap.dataset.min);
        const max = Number (wrap.dataset.max);
        const step = Number (wrap.dataset.step);
        const suffix = wrap.dataset.suffix || '';

        let value = Number (wrap.dataset.value);
        let startY = 0;
        let startValue = value;
        let pointerActive = false;

        const clampValue = (v) =>
        {
            const stepped = Math.round (v / step) * step;
            return Math.max (min, Math.min (max, stepped));
        };

        const setValue = (v, shouldSend) =>
        {
            value = clampValue (v);
            wrap.dataset.value = String (value);

            const norm = (value - min) / (max - min);
            const angle = -135 + norm * 270;

            knob.style.transform = `rotate(${angle}deg)`;
            valueLabel.textContent = formatter ? formatter (value) : `${value}${suffix}`;

            if (shouldSend)
                send (endpoint, endpoint === 'masterVolume' ? value / 100.0 : value);
        };

        setValue (value, false);

        wrap.addEventListener ('pointerdown', (e) =>
        {
            pointerActive = true;
            startY = e.clientY;
            startValue = value;
            wrap.setPointerCapture (e.pointerId);
            e.preventDefault ();
        });

        wrap.addEventListener ('pointermove', (e) =>
        {
            if (! pointerActive)
                return;

            const drag = startY - e.clientY;
            const distance = Math.abs (drag);

            let sensitivity = 0.18;

            if (distance > 60)
                sensitivity = 0.28;

            if (distance > 130)
                sensitivity = 0.45;

            const next = startValue + drag * sensitivity;
            setValue (next, true);
            e.preventDefault ();
        });

        wrap.addEventListener ('pointerup', (e) =>
        {
            pointerActive = false;
            try { wrap.releasePointerCapture (e.pointerId); } catch {}
            e.preventDefault ();
        });

        wrap.addEventListener ('pointercancel', () =>
        {
            pointerActive = false;
        });

        wrap.addEventListener ('wheel', (e) =>
        {
            const direction = e.deltaY < 0 ? 1 : -1;
            setValue (value + direction * step, true);
            e.preventDefault ();
        }, { passive: false });

        return {
            getValue: () => value,
            setValue
        };
    }

    const tempoKnob = setupKnob ('tempoKnob', 'tempo', (v) => `${Math.round (v)} BPM`);
    const masterVolumeKnob = setupKnob ('masterVolumeKnob', 'masterVolume', (v) => `${Math.round (v)}%`);
        // ----- Android MIDI helpers -----
    const getAndroidHost = () => window.AndroidHost || null;

    function setMidiStatus (text)
    {
        const el = $('midiStatus');
        if (el)
            el.textContent = 'MIDI status: ' + (text || 'unknown');
    }

    function refreshMidiStatus ()
    {
        const host = getAndroidHost();

        if (! host || ! host.getMidiStatus)
        {
            setMidiStatus ('AndroidHost MIDI bridge not available in this environment.');
            return;
        }

        try
        {
            setMidiStatus (host.getMidiStatus());
        }
        catch (e)
        {
            setMidiStatus ('getMidiStatus failed: ' + e);
        }
    }

    function refreshMidiDevices ()
    {
        const host = getAndroidHost();

        if (! host || ! host.refreshMidiDevices)
        {
            setMidiStatus ('AndroidHost MIDI bridge not available.');
            return;
        }

        try
        {
            setMidiStatus (host.refreshMidiDevices());

            // Opening the MIDI device is asynchronous on Android, so ask for
            // the status again shortly after the callback has had time to run.
            setTimeout (refreshMidiStatus, 300);
        }
        catch (e)
        {
            setMidiStatus ('refreshMidiDevices failed: ' + e);
        }
    }

    function setMidiEnabledFromUI ()
    {
        const host = getAndroidHost();
        const enabled = $('midiEnabled').checked;

        if (! enabled)
            sendMidiOffForLastNote();

        if (! host || ! host.setMidiEnabled)
        {
            setMidiStatus ('AndroidHost MIDI bridge not available.');
            return;
        }

        try
        {
            host.setMidiEnabled (enabled);
            refreshMidiStatus ();
        }
        catch (e)
        {
            setMidiStatus ('setMidiEnabled failed: ' + e);
        }
    }

    function sendMidiTestNote ()
    {
        const host = getAndroidHost();

        if (! host || ! host.sendMidiNoteOn || ! host.sendMidiNoteOff)
        {
            setMidiStatus ('AndroidHost MIDI bridge not available.');
            return;
        }

        try
        {
            const note = 48; // C3, same as the app default root note.
            host.sendMidiNoteOn (note);
            setTimeout (() => host.sendMidiNoteOff (note), 240);
            refreshMidiStatus ();
        }
        catch (e)
        {
            setMidiStatus ('MIDI test note failed: ' + e);
        }
    }
    function isMidiSendEnabled ()
    {
        const box = $('midiEnabled');
        return !! (box && box.checked);
    }

    function sendMidiOffForLastNote ()
    {
        const host = getAndroidHost();

        if (! host || ! host.sendMidiNoteOff)
            return;

        if (state.lastMidiNote >= 0)
        {
            try
            {
                host.sendMidiNoteOff (state.lastMidiNote);
            }
            catch (e)
            {
                setMidiStatus ('MIDI note off failed: ' + e);
            }

            state.lastMidiNote = -1;
            state.lastMidiStep = -1;
        }
    }

    function sendMidiForStep (stepIndex)
    {
        if (! isMidiSendEnabled())
        {
            sendMidiOffForLastNote();
            return;
        }

        const host = getAndroidHost();

        if (! host || ! host.sendMidiNoteOn || ! host.sendMidiNoteOff)
            return;

        if (stepIndex < 0 || stepIndex >= state.length)
        {
            sendMidiOffForLastNote();
            return;
        }

        const step = state.steps[stepIndex];

        // Always turn the previous note off before starting the next one.
        // This avoids stuck notes on external synths.
        sendMidiOffForLastNote();

        if (! step || ! step.active)
            return;

        const note = clampInt (step.note, 0, 127);

        try
        {
            host.sendMidiNoteOn (note);
            state.lastMidiNote = note;
            state.lastMidiStep = stepIndex;
        }
        catch (e)
        {
            setMidiStatus ('MIDI note on failed: ' + e);
        }
    }

    function setPlayingStep (stepIndex)
    {
        const nextStep = clampInt (stepIndex, -1, 31);

        if (state.playingStep === nextStep)
            return;

        state.playingStep = nextStep;

        if (nextStep < 0)
            sendMidiOffForLastNote();
        else
            sendMidiForStep (nextStep);

        drawGrid();
    }
    // ----- drawGrid -----
    function drawGrid ()
    {
        const grid = $q ('#grid');
        grid.innerHTML = '';

        for (let i = 0; i < state.length; i++)
        {
            const s = state.steps[i];
            const cell = document.createElement ('button');
            cell.type = 'button';
            cell.className = [
                'step',
                s.active           ? 'active'   : '',
                i === state.selectedStep ? 'selected' : '',
                i === state.playingStep  ? 'playing'  : ''
            ].join (' ').trim ();

            const barStyle = `bottom:${noteToBottomPct (s.note)}%;opacity:${s.active ? 1 : 0.13}`;
            cell.innerHTML = `
                <span class="step-num">${String (i + 1).padStart (2, '0')}</span>
                <span class="flags">
                    <span class="flag glide ${s.glide ? 'on' : ''}"></span>
                    <span class="flag randomise ${s.randomise ? 'on' : ''}"></span>
                </span>
                <span class="note-bar" style="${barStyle}"></span>
                <span class="step-note">${s.active ? midiNoteName (s.note) : 'OFF'}</span>
            `;

            cell.addEventListener ('click', () =>
            {
                state.selectedStep = i;
                drawGrid ();
                drawEditor ();
            });

            grid.appendChild (cell);
        }
    }

    // ----- drawEditor -----
    function drawEditor ()
    {
        const editor = $q ('#editor');
        const idx = state.selectedStep;
        const s = state.steps[idx];

        editor.innerHTML = `
            <div class="editor-header">
                <h3>Step ${idx + 1}</h3>
                <div class="toggle-row">
                    <button id="edActive"  class="${s.active    ? 'btn-primary' : 'btn-secondary'}">${s.active    ? 'ACTIVE' : 'OFF'}</button>
                    <button id="edGlide"   class="${s.glide     ? 'btn-primary' : 'btn-secondary'}">GLIDE ${s.glide     ? 'ON' : 'OFF'}</button>
                    <button id="edRandom"  class="${s.randomise ? 'btn-primary' : 'btn-secondary'}">RANDOM ${s.randomise ? 'ON' : 'OFF'}</button>
                </div>
            </div>
            <label>MIDI Note
                <input id="edNote" type="number" min="0" max="127" value="${s.note}">
            </label>
            <label>Note Name
                <input type="text" value="${midiNoteName (s.note)}" readonly>
            </label>
            <label>Step / Total
                <input type="text" value="${idx + 1} / ${state.length}" readonly>
            </label>
        `;

        editor.querySelector ('#edActive').addEventListener ('click', () =>
        {
            s.active = s.active ? 0 : 1;
            sendStep (idx);
            drawGrid (); drawEditor ();
        });

        editor.querySelector ('#edGlide').addEventListener ('click', () =>
        {
            s.glide = s.glide ? 0 : 1;
            sendStep (idx);
            drawGrid (); drawEditor ();
        });

        editor.querySelector ('#edRandom').addEventListener ('click', () =>
        {
            s.randomise = s.randomise ? 0 : 1;
            sendStep (idx);
            drawGrid (); drawEditor ();
        });

        editor.querySelector ('#edNote').addEventListener ('change', (e) =>
        {
            s.note = clampInt (e.target.value, 0, 127);
            e.target.value = s.note;
            sendStep (idx);
            drawGrid (); drawEditor ();
        });
    }

    // ----- Transport / Pattern controls -----
    $('btnGenerate').addEventListener ('click', () => send ('generate', 1));
    $('btnMutate').addEventListener ('click', () =>
    {
        send ('mutate', 1);
        setTimeout (() => send ('requestPatternDump', 1), 80);
    });
    $('btnPlay').addEventListener ('click', () => send ('play', 1));
        $('btnStop').addEventListener ('click', () =>
    {
        send ('stop', 1);
        setPlayingStep (-1);
    });

        $('btnClear').addEventListener ('click', () =>
    {
        send ('clearPattern', 1);
        setPlayingStep (-1);

        for (let i = 0; i < 32; ++i)
            state.steps[i] = { note: 48, active: 0, glide: 0, randomise: 0 };

        drawGrid ();
        drawEditor ();
    });
    $('btnDump').addEventListener  ('click', () => send ('requestPatternDump', 1));

    $('patternLength').addEventListener ('change', (e) =>
    {
        state.length = clampInt (e.target.value, 8, 32);
        send ('patternLength', state.length);
    
        if (state.selectedStep >= state.length)
            state.selectedStep = state.length - 1;
        if (state.playingStep >= state.length)
            setPlayingStep (-1);
        if (state.playingStep >= state.length)
            setPlayingStep (-1);
    
        drawGrid ();
        drawEditor ();
    });
    $('timeSignature').addEventListener ('change', (e) =>
    {
        const parts = String (e.target.value).split ('/');
        const numerator = clampInt (parts[0], 2, 12);
        const denominator = clampInt (parts[1], 4, 8);
        const steps = clampInt (parts[2], 8, 32);

        send ('timeSigNumerator', numerator);
        send ('timeSigDenominator', denominator);

        state.length = steps;
        $('patternLength').value = String (steps);
        send ('patternLength', steps);

        if (state.selectedStep >= state.length)
            state.selectedStep = state.length - 1;

        drawGrid ();
        drawEditor ();
    });
    $('rootNote').addEventListener ('change', (e) =>
    {
        const v = clampInt (e.target.value, 36, 72);
        send ('rootNote', v);
    });

    $('styleType').addEventListener      ('change', (e) => send ('styleType',       Number (e.target.value)));
    $('scaleType').addEventListener      ('change', (e) => send ('scaleType',       Number (e.target.value)));
    $('complexityType').addEventListener ('change', (e) => send ('complexityType',  Number (e.target.value)));
    $('progressionType').addEventListener('change', (e) => send ('progressionType', Number (e.target.value)));
    $('shapeType').addEventListener      ('change', (e) => send ('shapeType',       Number (e.target.value)));

    $('chaos').addEventListener     ('input', (e) => send ('chaos',      Number (e.target.value)));
    $('mutation').addEventListener  ('input', (e) => send ('mutation',   Number (e.target.value)));
    $('density').addEventListener   ('input', (e) => send ('density',    Number (e.target.value)));
    $('gate').addEventListener      ('input', (e) => send ('gate',       Number (e.target.value)));
    $('synthWave').addEventListener ('change',(e) => send ('synthWave',  Number (e.target.value)));
    $('synthCutoff').addEventListener  ('input', (e) => send ('synthCutoff',  Number (e.target.value)));
    $('synthRes').addEventListener     ('input', (e) => send ('synthRes',     Number (e.target.value)));
    $('synthEnvMod').addEventListener  ('input', (e) => send ('synthEnvMod',  Number (e.target.value)));
    $('synthDecay').addEventListener   ('input', (e) => send ('synthDecay',   Number (e.target.value)));
    $('btnMidiRefresh').addEventListener ('click', refreshMidiDevices);
    $('btnMidiTest').addEventListener    ('click', sendMidiTestNote);

    $('midiEnabled').addEventListener ('change', setMidiEnabledFromUI);

    $('midiChannel').addEventListener ('change', (e) =>
    {
        const host = getAndroidHost();
        if (host && host.setMidiChannel)
        {
            try
            {
                host.setMidiChannel (clampInt (e.target.value, 1, 16));
                refreshMidiStatus ();
            }
            catch (err)
            {
                setMidiStatus ('setMidiChannel failed: ' + err);
            }
        }
    });

    $('midiVelocity').addEventListener ('input', (e) =>
    {
        const host = getAndroidHost();
        if (host && host.setMidiVelocity)
        {
            try
            {
                host.setMidiVelocity (clampInt (e.target.value, 1, 127));
            }
            catch (err)
            {
                setMidiStatus ('setMidiVelocity failed: ' + err);
            }
        }
    });

    // ----- patchConnection listener -----
    if (patchConnection && typeof patchConnection.addEndpointListener === 'function')
    {
        patchConnection.addEndpointListener ('stepToUI', (value) =>
        {
            const kind      = (value >> 28) & 15;
            const stepIndex = (value >> 20) & 255;

            if (kind === 1)
            {
                // Playback position update.
                // Route through setPlayingStep so the MIDI output follows the sequencer.
                setPlayingStep ((stepIndex >= 32) ? -1 : stepIndex);
                return;
            }

            if (kind === 2 && stepIndex >= 0 && stepIndex < 32)
            {
                // Step data update
                state.steps[stepIndex].note      = (value >> 13) & 127;
                state.steps[stepIndex].active    = (value >>  2) &   1;
                state.steps[stepIndex].glide     = (value >>  1) &   1;
                state.steps[stepIndex].randomise =  value        &   1;

                drawGrid ();

                if (stepIndex === state.selectedStep)
                    drawEditor ();
            }
        });
    }

    // ----- Initial render -----
    drawGrid ();
    drawEditor ();
    setTimeout (() => send ('requestPatternDump', 1), 80);
    setTimeout (refreshMidiStatus, 120);

    return root;
}
