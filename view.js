export default function createPatchView (patchConnection)
{
    const root = document.createElement ('div');
    root.attachShadow ({ mode: 'open' });

    // ----- State -----
    const state = {
        steps: Array.from ({ length: 32 }, () => ({ note: 48, active: 0, glide: 0, randomise: 0 })),
        length: 16,
        selectedStep: 0,
        playingStep: -1
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
                    <button id="btnStop"     class="btn-danger">STOP</button>
                    <button id="btnClear"    class="btn-secondary">CLEAR</button>
                    <button id="btnDump"     class="btn-secondary">REFRESH UI</button>
                </div>
                <div class="controls">
                    <label>Steps
                        <select id="patternLength">
                            <option value="8">8</option>
                            <option value="16" selected>16</option>
                            <option value="24">24</option>
                            <option value="32">32</option>
                        </select>
                    </label>
                    <label>Root Note
                        <input id="rootNote" type="number" min="36" max="72" value="48">
                    </label>
                    <label>Tempo
                        <input id="tempo" type="number" min="50" max="220" value="120">
                    </label>
                    <label>Chaos
                        <input id="chaos" type="range" min="0" max="100" value="35">
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

    $('btnPlay').addEventListener ('click', () => send ('play', 1));

    $('btnStop').addEventListener ('click', () =>
    {
        state.playingStep = -1;
        send ('stop', 1);
        drawGrid ();
    });

    $('btnClear').addEventListener ('click', () => send ('clearPattern', 1));
    $('btnDump').addEventListener  ('click', () => send ('requestPatternDump', 1));

    $('patternLength').addEventListener ('change', (e) =>
    {
        state.length = clampInt (e.target.value, 8, 32);
        send ('patternLength', state.length);
        if (state.selectedStep >= state.length)
            state.selectedStep = state.length - 1;
        drawGrid (); drawEditor ();
    });

    $('rootNote').addEventListener ('change', (e) =>
    {
        const v = clampInt (e.target.value, 36, 72);
        e.target.value = v;
        send ('rootNote', v);
    });

    $('tempo').addEventListener ('change', (e) =>
    {
        const v = clampInt (e.target.value, 50, 220);
        e.target.value = v;
        send ('tempo', v);
    });

    $('chaos').addEventListener     ('input', (e) => send ('chaos',      Number (e.target.value)));
    $('density').addEventListener   ('input', (e) => send ('density',    Number (e.target.value)));
    $('gate').addEventListener      ('input', (e) => send ('gate',       Number (e.target.value)));
    $('synthWave').addEventListener ('change',(e) => send ('synthWave',  Number (e.target.value)));
    $('synthCutoff').addEventListener  ('input', (e) => send ('synthCutoff',  Number (e.target.value)));
    $('synthRes').addEventListener     ('input', (e) => send ('synthRes',     Number (e.target.value)));
    $('synthEnvMod').addEventListener  ('input', (e) => send ('synthEnvMod',  Number (e.target.value)));
    $('synthDecay').addEventListener   ('input', (e) => send ('synthDecay',   Number (e.target.value)));

    // ----- patchConnection listener -----
    if (patchConnection && typeof patchConnection.addEndpointListener === 'function')
    {
        patchConnection.addEndpointListener ('stepToUI', (value) =>
        {
            const kind      = (value >> 28) & 15;
            const stepIndex = (value >> 20) & 255;

            if (kind === 1)
            {
                // Playback position update
                state.playingStep = (stepIndex >= 32) ? -1 : stepIndex;
                drawGrid ();
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

    return root;
}
