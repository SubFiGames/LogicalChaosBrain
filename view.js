export default function createPatchView (patchConnection) {
    const root = document.createElement('div');

    const state = {
        length: 16, playingStep: -1, selectedStep: 0,
        steps: Array.from({ length: 32 }, (_, i) => ({ note: 48, active: i < 16 ? 1 : 0, glide: 0, randomise: 0 }))
    };

    const send = (endpoint, value) => {
        if (patchConnection) patchConnection.sendEventOrValue(endpoint, value);
    };

    const loadPreset = (cutoff, res, envMod, decay, wave) => {
        send('synthCutoff', cutoff); document.getElementById('synthCutoff').value = cutoff;
        send('synthRes', res); document.getElementById('synthRes').value = res;
        send('synthEnvMod', envMod); document.getElementById('synthEnvMod').value = envMod;
        send('synthDecay', decay); document.getElementById('synthDecay').value = decay;
        send('synthWave', wave); document.getElementById('synthWave').value = wave;
    };

    root.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; }
            .app { background: linear-gradient(135deg, #050808, #111); color: #00ffcc; font-family: sans-serif; padding: 20px; overflow: auto; min-height: 100vh;}
            .panel { background: rgba(5, 16, 16, 0.9); border: 1px solid #00ffcc44; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
            h1 { margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 2px; }
            h3 { margin: 0 0 10px 0; color: #ff7cff; }
            button { background: #00ffcc; color: #000; border: none; padding: 10px 15px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-right: 5px; }
            button:hover { background: #fff; }
            .preset-btn { background: #ff7cff; color: #000; }
            .grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 5px; margin-top: 15px;}
            .step { height: 60px; background: #222; border: 1px solid #444; border-radius: 6px; cursor: pointer; position: relative; }
            .step.active { background: #00ffcc33; border-color: #00ffcc; }
            .step.playing { background: #ff7cff55; border-color: #ff7cff; box-shadow: 0 0 15px #ff7cff; }
            .step .glide-dot { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; background: #ff7cff; border-radius: 50%; display: none; }
            .step.glide .glide-dot { display: block; }
            .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
            label { display: flex; flex-direction: column; font-size: 11px; text-transform: uppercase; color: #aaa; }
            input[type="range"] { margin-top: 5px; }
        </style>
        <div class="app">
            <h1>Groove & Synth Machine</h1>
            <div class="panel">
                <button id="play">PLAY</button>
                <button id="stop">STOP</button>
                <button id="generate">RANDOMIZE MELODY</button>
                <button id="clear">CLEAR</button>
            </div>

            <div class="panel">
                <h3>Synthesizer</h3>
                <div style="margin-bottom: 15px;">
                    <button class="preset-btn" id="preAcid">Preset: Acid Bass</button>
                    <button class="preset-btn" id="prePluck">Preset: Pluck</button>
                    <button class="preset-btn" id="preLead">Preset: Techno Lead</button>
                </div>
                <div class="controls">
                    <label>Waveform (0=Saw, 1=Sq) <input type="range" id="synthWave" min="0" max="1" step="1" value="0"></label>
                    <label>Cutoff <input type="range" id="synthCutoff" min="50" max="5000" value="800"></label>
                    <label>Resonance <input type="range" id="synthRes" min="0.1" max="0.95" step="0.05" value="0.6"></label>
                    <label>Env Mod <input type="range" id="synthEnvMod" min="0" max="5000" value="2000"></label>
                    <label>Decay <input type="range" id="synthDecay" min="0.05" max="2.0" step="0.05" value="0.3"></label>
                </div>
            </div>

            <div class="panel">
                <h3>Sequencer Grid</h3>
                <div class="controls">
                    <label>Root Note <input type="number" id="rootNote" value="48"></label>
                    <label>Tempo <input type="number" id="tempo" value="120"></label>
                    <label>Chaos % <input type="range" id="chaos" min="0" max="100" value="35"></label>
                </div>
                <div id="grid" class="grid"></div>
            </div>
        </div>
    `;

    // Presets
    root.querySelector('#preAcid').onclick = () => loadPreset(200, 0.85, 3000, 0.3, 1);
    root.querySelector('#prePluck').onclick = () => loadPreset(800, 0.2, 4000, 0.1, 0);
    root.querySelector('#preLead').onclick = () => loadPreset(2500, 0.6, 1000, 0.8, 0);

    // Synth Event Listeners
    ['synthWave', 'synthCutoff', 'synthRes', 'synthEnvMod', 'synthDecay', 'rootNote', 'tempo', 'chaos'].forEach(id => {
        root.querySelector(`#${id}`).addEventListener('input', e => send(id, Number(e.target.value)));
    });

    // Transport Listeners
    root.querySelector('#play').onclick = () => send('play', 1);
    root.querySelector('#stop').onclick = () => { state.playingStep = -1; send('stop', 1); drawGrid(); };
    root.querySelector('#generate').onclick = () => send('generate', 1);
    root.querySelector('#clear').onclick = () => send('clearPattern', 1);

    function drawGrid() {
        const grid = root.querySelector('#grid');
        grid.innerHTML = '';
        for (let i = 0; i < state.length; i++) {
            const step = state.steps[i];
            const div = document.createElement('div');
            div.className = `step ${step.active ? 'active' : ''} ${i === state.playingStep ? 'playing' : ''} ${step.glide ? 'glide' : ''}`;
            div.innerHTML = `<div class="glide-dot"></div>`;
            div.onclick = () => {
                step.active = step.active ? 0 : 1; // Toggle active
                send('setStepPacked', (i << 20) | (step.note << 13) | (step.active << 2) | (step.glide << 1));
                drawGrid();
            };
            grid.appendChild(div);
        }
    }

    if (patchConnection) {
        patchConnection.addEndpointListener('stepToUI', (value) => {
            const kind = (value >> 28) & 15;
            const stepIndex = (value >> 20) & 255;
            if (kind === 1) {
                state.playingStep = stepIndex >= 32 ? -1 : stepIndex;
                drawGrid();
            } else if (kind === 2 && stepIndex < 32) {
                state.steps[stepIndex].note = (value >> 13) & 127;
                state.steps[stepIndex].active = (value >> 2) & 1;
                state.steps[stepIndex].glide = (value >> 1) & 1;
                drawGrid();
            }
        });
    }

    drawGrid();
    setTimeout(() => send('requestPatternDump', 1), 100);
    return root;
}
