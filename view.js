export default function createPatchView (patchConnection) {
    const root = document.createElement('div');

    const clampInt = (value, min, max) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
    };

    const state = {
        length: 16,
        playingStep: -1,
        selectedStep: 0,
        steps: Array.from({ length: 32 }, (_, i) => ({
            note: [60, 63, 67, 70][i] ?? 60,
            active: i < 16 ? 1 : 0,
            glide: 0,
            randomise: 0
        }))
    };

    const send = (endpoint, value) => {
        if (!patchConnection || typeof patchConnection.sendEventOrValue !== 'function') {
            console.warn(`[Logical Chaos] Cannot send ${endpoint}; patchConnection is unavailable.`);
            return;
        }

        patchConnection.sendEventOrValue(endpoint, value);
    };

    const packStep = (stepIndex) => {
        const step = state.steps[stepIndex];

        return ((stepIndex & 255) << 20)
            | ((step.note & 127) << 13)
            | ((step.active & 1) << 2)
            | ((step.glide & 1) << 1)
            | (step.randomise & 1);
    };

    const sendStep = (stepIndex) => {
        send('setStepPacked', packStep(stepIndex));
    };

    root.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }

            .logical-chaos {
                box-sizing: border-box;
                width: 100%;
                min-height: 100%;
                padding: 22px;
                background:
                    radial-gradient(circle at 20% 10%, rgba(0, 255, 204, 0.14), transparent 32%),
                    radial-gradient(circle at 80% 20%, rgba(255, 0, 255, 0.10), transparent 28%),
                    linear-gradient(135deg, #050808, #081111 58%, #030505);
                color: #d9fff7;
                font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                overflow: auto;
            }

            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                margin-bottom: 18px;
            }

            .title {
                margin: 0;
                font-size: 30px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #00ffcc;
                text-shadow: 0 0 18px rgba(0, 255, 204, 0.35);
            }

            .subtitle {
                margin-top: 6px;
                color: rgba(217, 255, 247, 0.64);
                font-size: 13px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            .badge {
                display: inline-flex;
                align-items: center;
                padding: 7px 12px;
                border: 1px solid rgba(255, 0, 255, 0.42);
                border-radius: 999px;
                color: #ff7cff;
                background: rgba(255, 0, 255, 0.08);
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.12em;
            }

            .panel {
                background: rgba(5, 16, 16, 0.84);
                border: 1px solid rgba(0, 255, 204, 0.18);
                border-radius: 18px;
                padding: 18px;
                margin-bottom: 18px;
                box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24), inset 0 0 30px rgba(0, 255, 204, 0.035);
                backdrop-filter: blur(8px);
            }

            .transport {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
            }

            button {
                border: 0;
                border-radius: 12px;
                padding: 11px 16px;
                color: #021111;
                background: #00ffcc;
                font-weight: 900;
                letter-spacing: 0.05em;
                cursor: pointer;
                box-shadow: 0 0 20px rgba(0, 255, 204, 0.16);
            }

            button.secondary {
                color: #d9fff7;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(0, 255, 204, 0.24);
            }

            button.danger {
                color: #fff2fb;
                background: rgba(255, 0, 96, 0.22);
                border: 1px solid rgba(255, 0, 96, 0.35);
            }

            button:hover {
                filter: brightness(1.08);
            }

            label {
                display: grid;
                gap: 6px;
                color: rgba(217, 255, 247, 0.68);
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            input,
            select {
                min-height: 38px;
                border-radius: 10px;
                border: 1px solid rgba(0, 255, 204, 0.25);
                color: #d9fff7;
                background: rgba(0, 0, 0, 0.22);
                padding: 0 10px;
                outline: none;
            }

            .controls {
                display: grid;
                grid-template-columns: repeat(5, minmax(120px, 1fr));
                gap: 12px;
                margin-top: 16px;
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(16, minmax(34px, 1fr));
                gap: 7px;
            }

            .step {
                position: relative;
                height: 82px;
                border-radius: 12px;
                border: 1px solid rgba(0, 255, 204, 0.16);
                background: rgba(255, 255, 255, 0.045);
                cursor: pointer;
                overflow: hidden;
            }

            .step.active {
                background: rgba(0, 255, 204, 0.09);
                border-color: rgba(0, 255, 204, 0.34);
            }

            .step.selected {
                outline: 2px solid rgba(0, 255, 204, 0.78);
                box-shadow: 0 0 18px rgba(0, 255, 204, 0.22);
            }

            .step.playing {
                background: rgba(255, 0, 255, 0.20);
                border-color: rgba(255, 0, 255, 0.75);
                box-shadow: 0 0 22px rgba(255, 0, 255, 0.30);
            }

            .step-number {
                position: absolute;
                top: 6px;
                left: 7px;
                font-size: 10px;
                color: rgba(217, 255, 247, 0.58);
                font-weight: 900;
            }

            .note-label {
                position: absolute;
                left: 7px;
                right: 7px;
                bottom: 7px;
                font-size: 13px;
                color: #d9fff7;
                font-weight: 900;
                text-align: center;
            }

            .note-bar {
                position: absolute;
                left: 18%;
                right: 18%;
                height: 4px;
                border-radius: 999px;
                background: #00ffcc;
                box-shadow: 0 0 12px rgba(0, 255, 204, 0.42);
            }

            .flags {
                position: absolute;
                top: 6px;
                right: 7px;
                display: flex;
                gap: 4px;
            }

            .flag {
                width: 8px;
                height: 8px;
                border-radius: 999px;
                opacity: 0.28;
                background: rgba(217, 255, 247, 0.45);
            }

            .flag.on.glide {
                opacity: 1;
                background: #ff00ff;
                box-shadow: 0 0 10px rgba(255, 0, 255, 0.65);
            }

            .flag.on.randomise {
                opacity: 1;
                background: #ffee55;
                box-shadow: 0 0 10px rgba(255, 238, 85, 0.55);
            }

            .editor {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr 1fr;
                gap: 12px;
                align-items: end;
            }

            .editor-title {
                grid-column: 1 / -1;
                display: flex;
                justify-content: space-between;
                gap: 12px;
                align-items: center;
            }

            .editor-title h3 {
                margin: 0;
                color: #00ffcc;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            .toggle-row {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }

            @media (max-width: 900px) {
                .controls {
                    grid-template-columns: repeat(2, minmax(120px, 1fr));
                }

                .grid {
                    grid-template-columns: repeat(8, minmax(34px, 1fr));
                }

                .editor {
                    grid-template-columns: 1fr 1fr;
                }
            }
        </style>

        <div class="logical-chaos">
            <div class="header">
                <div>
                    <h1 class="title">Logical Chaos</h1>
                    <div class="subtitle">Melody Machine · Cmajor VST3</div>
                </div>
                <div class="badge">PROTOTYPE</div>
            </div>

            <div class="panel">
                <div class="transport">
                    <button id="generate">GENERATE</button>
                    <button id="play">PLAY</button>
                    <button id="stop" class="danger">STOP</button>
                    <button id="clear" class="secondary">CLEAR</button>
                    <button id="dump" class="secondary">REFRESH UI</button>
                </div>

                <div class="controls">
                    <label>
                        Steps
                        <select id="patternLength">
                            <option value="8">8</option>
                            <option value="16" selected>16</option>
                            <option value="32">32</option>
                        </select>
                    </label>

                    <label>
                        Root
                        <input id="rootNote" type="number" min="36" max="72" value="60">
                    </label>

                    <label>
                        Chaos
                        <input id="chaos" type="range" min="0" max="100" value="35">
                    </label>

                    <label>
                        Density
                        <input id="density" type="range" min="0" max="100" value="78">
                    </label>

                    <label>
                        Gate
                        <input id="gate" type="range" min="5" max="100" value="72">
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

    const midiNoteName = (note) => {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(note / 12) - 1;
        return `${names[note % 12]}${octave}`;
    };

    const noteToBottomPercent = (note) => {
        const normalised = (note - 36) / 60;
        return Math.max(18, Math.min(74, normalised * 74));
    };

    function drawGrid() {
        const grid = root.querySelector('#grid');
        grid.innerHTML = '';

        for (let i = 0; i < state.length; i++) {
            const step = state.steps[i];

            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = [
                'step',
                step.active ? 'active' : '',
                i === state.selectedStep ? 'selected' : '',
                i === state.playingStep ? 'playing' : ''
            ].join(' ').trim();

            cell.innerHTML = `
                <span class="step-number">${String(i + 1).padStart(2, '0')}</span>
                <span class="flags">
                    <span title="Glide" class="flag glide ${step.glide ? 'on' : ''}"></span>
                    <span title="Randomise" class="flag randomise ${step.randomise ? 'on' : ''}"></span>
                </span>
                <span class="note-bar" style="bottom:${noteToBottomPercent(step.note)}%; opacity:${step.active ? 1 : 0.14}"></span>
                <span class="note-label">${step.active ? midiNoteName(step.note) : 'OFF'}</span>
            `;

            cell.addEventListener('click', () => {
                state.selectedStep = i;
                drawGrid();
                drawEditor();
            });

            grid.appendChild(cell);
        }
    }

    function drawEditor() {
        const editor = root.querySelector('#editor');
        const index = state.selectedStep;
        const step = state.steps[index];

        editor.innerHTML = `
            <div class="editor-title">
                <h3>Step ${index + 1}</h3>
                <div class="toggle-row">
                    <button id="toggleActive" class="${step.active ? '' : 'secondary'}">${step.active ? 'ACTIVE' : 'OFF'}</button>
                    <button id="toggleGlide" class="${step.glide ? '' : 'secondary'}">GLIDE ${step.glide ? 'ON' : 'OFF'}</button>
                    <button id="toggleRandom" class="${step.randomise ? '' : 'secondary'}">RANDOM ${step.randomise ? 'ON' : 'OFF'}</button>
                </div>
            </div>

            <label>
                MIDI Note
                <input id="stepNote" type="number" min="0" max="127" value="${step.note}">
            </label>

            <label>
                Note Name
                <input id="noteName" type="text" value="${midiNoteName(step.note)}" readonly>
            </label>

            <label>
                Selected Step
                <input type="text" value="${index + 1} / ${state.length}" readonly>
            </label>

            <label>
                Packed Value
                <input type="text" value="${packStep(index)}" readonly>
            </label>
        `;

        editor.querySelector('#toggleActive').addEventListener('click', () => {
            step.active = step.active ? 0 : 1;
            sendStep(index);
            drawGrid();
            drawEditor();
        });

        editor.querySelector('#toggleGlide').addEventListener('click', () => {
            step.glide = step.glide ? 0 : 1;
            sendStep(index);
            drawGrid();
            drawEditor();
        });

        editor.querySelector('#toggleRandom').addEventListener('click', () => {
            step.randomise = step.randomise ? 0 : 1;
            sendStep(index);
            drawGrid();
            drawEditor();
        });

        editor.querySelector('#stepNote').addEventListener('change', (event) => {
            step.note = clampInt(event.target.value, 0, 127);
            event.target.value = step.note;
            sendStep(index);
            drawGrid();
            drawEditor();
        });
    }

    root.querySelector('#generate').addEventListener('click', () => send('generate', 1));
    root.querySelector('#play').addEventListener('click', () => send('play', 1));
    root.querySelector('#stop').addEventListener('click', () => {
        state.playingStep = -1;
        send('stop', 1);
        drawGrid();
    });
    root.querySelector('#clear').addEventListener('click', () => send('clearPattern', 1));
    root.querySelector('#dump').addEventListener('click', () => send('requestPatternDump', 1));

    root.querySelector('#patternLength').addEventListener('change', (event) => {
        state.length = clampInt(event.target.value, 8, 32);
        send('patternLength', state.length);

        if (state.selectedStep >= state.length) {
            state.selectedStep = state.length - 1;
        }

        drawGrid();
        drawEditor();
    });

    root.querySelector('#rootNote').addEventListener('change', (event) => {
        const value = clampInt(event.target.value, 36, 72);
        event.target.value = value;
        send('rootNote', value);
    });

    root.querySelector('#chaos').addEventListener('input', (event) => send('chaos', Number(event.target.value)));
    root.querySelector('#density').addEventListener('input', (event) => send('density', Number(event.target.value)));
    root.querySelector('#gate').addEventListener('input', (event) => send('gate', Number(event.target.value)));

    if (patchConnection && typeof patchConnection.addEndpointListener === 'function') {
        patchConnection.addEndpointListener('stepToUI', (value) => {
            const kind = (value >> 28) & 15;
            const stepIndex = (value >> 20) & 255;

            if (kind === 1) {
                state.playingStep = stepIndex >= 32 ? -1 : stepIndex;
                drawGrid();
                return;
            }

            if (kind === 2 && stepIndex >= 0 && stepIndex < 32) {
                state.steps[stepIndex].note = (value >> 13) & 127;
                state.steps[stepIndex].active = (value >> 2) & 1;
                state.steps[stepIndex].glide = (value >> 1) & 1;
                state.steps[stepIndex].randomise = value & 1;

                drawGrid();

                if (stepIndex === state.selectedStep) {
                    drawEditor();
                }
            }
        });
    }

    drawGrid();
    drawEditor();

    setTimeout(() => send('requestPatternDump', 1), 50);

    return root;
}