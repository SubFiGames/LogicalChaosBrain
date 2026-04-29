export default function createPatchView (patchConnectionOrContext)
{
    const connection = patchConnectionOrContext && patchConnectionOrContext.patchConnection
        ? patchConnectionOrContext.patchConnection
        : patchConnectionOrContext;

    const root = document.createElement('div');
    root.style.cssText = [
        'width:100%',
        'height:100%',
        'overflow:auto',
        'box-sizing:border-box',
        'padding:20px',
        'background:radial-gradient(circle at top, #10231d 0%, #08110f 35%, #050807 100%)',
        'color:#eafff5',
        'font-family:Inter,Segoe UI,Arial,sans-serif'
    ].join(';');

    const state = {
        length: 16,
        rootNote: 60,
        scaleMode: 1,
        octaveSpan: 2,
        transpose: 0,
        chaos: 35,
        density: 78,
        gate: 72,
        swing: 0,
        tempo: 120,
        steps: Array.from({ length: 32 }, (_, i) => ({
            note: 60,
            active: i < 16 ? 1 : 0,
            glide: 0,
            random: 0
        })),
        playingStep: -1,
        isPlaying: false,
        selectedStep: 0,
        log: 'Ready. Generate a melody, tweak steps, then press Play.'
    };

    function safeSend(id, value)
    {
        try
        {
            if (connection && connection.sendEventOrValue)
                connection.sendEventOrValue(id, value);
        }
        catch (e)
        {
            setStatus('Send failed for ' + id + ': ' + e.message);
        }
    }

    function setStatus(msg)
    {
        state.log = msg;
        const el = root.querySelector('#lc-status');
        if (el) el.textContent = msg;
    }

    function noteName(midi)
    {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const n = ((midi % 12) + 12) % 12;
        return names[n] + (Math.floor(midi / 12) - 1);
    }

    function clamp(v, min, max)
    {
        return Math.max(min, Math.min(max, v));
    }

    function rng(seed)
    {
        let s = seed >>> 0;
        return function ()
        {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967295;
        };
    }

    function getScaleIntervals(mode)
    {
        switch (mode)
        {
            case 0: return [0, 2, 4, 5, 7, 9, 11];
            case 1: return [0, 2, 3, 5, 7, 8, 10];
            case 2: return [0, 3, 5, 7, 10];
            case 3: return [0, 2, 3, 5, 7, 9, 10];
            case 4: return [0, 1, 3, 5, 7, 8, 10];
            default: return [0, 2, 3, 5, 7, 8, 11];
        }
    }

    function snapToScale(note, root, mode)
    {
        const scale = getScaleIntervals(mode);
        let best = root;
        let bestDist = 9999;

        for (let octave = -3; octave <= 4; octave++)
        {
            for (let i = 0; i < scale.length; i++)
            {
                const candidate = root + scale[i] + octave * 12;
                const dist = Math.abs(candidate - note);
                if (dist < bestDist)
                {
                    best = candidate;
                    bestDist = dist;
                }
            }
        }

        return clamp(best, 0, 127);
    }

    function resolveExportNote(step, seedOffset)
    {
        const stepData = state.steps[step];
        let note = stepData.note;

        if (stepData.random)
        {
            const r = rng(((Date.now() + seedOffset + 1) * 2654435761) >>> 0);
            const chaos01 = state.chaos / 100;
            const wander = Math.round((r() * 2 - 1) * (2 + chaos01 * 10));
            const octave = r() < (0.12 + chaos01 * 0.25) ? (r() < 0.5 ? -12 : 12) : 0;
            note = snapToScale(note + wander + octave, state.rootNote + state.transpose, state.scaleMode);
        }

        return clamp(note, 0, 127);
    }

    function packStep(stepIndex)
    {
        const s = state.steps[stepIndex];
        return ((stepIndex & 0xFF) << 20)
             | ((s.note & 0x7F) << 13)
             | ((s.active & 1) << 2)
             | ((s.glide & 1) << 1)
             | (s.random & 1);
    }

    root.innerHTML = `
        <style>
            .lc-shell { max-width: 1480px; margin: 0 auto; }
            .lc-hero {
                position: relative;
                padding: 22px;
                border-radius: 22px;
                background: linear-gradient(180deg, rgba(20,45,38,0.95), rgba(8,14,12,0.9));
                border: 1px solid rgba(0,255,183,0.22);
                box-shadow: 0 25px 60px rgba(0,0,0,0.38), 0 0 40px rgba(0,255,183,0.08) inset;
                margin-bottom: 18px;
            }
            .lc-hero::before {
                content:'';
                position:absolute;
                inset:0;
                background: radial-gradient(circle at 18% 10%, rgba(0,255,183,0.16), transparent 40%),
                            radial-gradient(circle at 80% 30%, rgba(108,92,231,0.18), transparent 32%),
                            radial-gradient(circle at 65% 75%, rgba(0,181,255,0.14), transparent 28%);
                pointer-events:none;
                border-radius:22px;
            }
            .lc-title { margin:0; font-size:40px; line-height:1.05; letter-spacing:0.04em; font-weight:900; text-transform:uppercase; }
            .lc-title span { color:#6dffe0; text-shadow:0 0 25px rgba(109,255,224,0.35); }
            .lc-sub { margin-top:8px; color:rgba(232,255,248,0.72); font-size:14px; max-width:760px; line-height:1.5; }
            .lc-hero-row { position:relative; z-index:1; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:18px; }
            .lc-actions { display:flex; flex-wrap:wrap; gap:10px; }
            .lc-btn {
                border:none;
                border-radius:14px;
                padding:12px 18px;
                font-weight:800;
                letter-spacing:0.03em;
                cursor:pointer;
                transition:transform .12s ease, box-shadow .12s ease, opacity .12s ease;
                color:#06100d;
                background:linear-gradient(180deg, #8effdf, #28dfb2);
                box-shadow:0 10px 24px rgba(0,255,183,0.18);
            }
            .lc-btn:hover { transform: translateY(-1px); box-shadow:0 14px 30px rgba(0,255,183,0.24); }
            .lc-btn.secondary { color:#dbfff7; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); box-shadow:none; }
            .lc-btn.danger { background:linear-gradient(180deg, #ff8cb0, #ff5578); color:#1a0710; }
            .lc-status {
                margin-top: 14px;
                color: rgba(230,255,248,0.82);
                font-size: 13px;
                padding: 10px 14px;
                border-radius: 12px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.06);
            }
            .lc-grid-2 { display:grid; grid-template-columns: 430px 1fr; gap:18px; }
            .lc-panel {
                background: linear-gradient(180deg, rgba(12,17,16,0.94), rgba(6,9,9,0.96));
                border: 1px solid rgba(0,255,183,0.16);
                border-radius: 20px;
                padding: 18px;
                box-shadow: 0 12px 35px rgba(0,0,0,0.28);
            }
            .lc-panel h3 { margin:0 0 14px; font-size:16px; letter-spacing:0.05em; text-transform:uppercase; color:#9cfce1; }
            .lc-controls { display:grid; grid-template-columns:1fr 1fr; gap:14px 12px; }
            .lc-control { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:12px; border-radius:16px; }
            .lc-label { display:flex; justify-content:space-between; gap:10px; margin-bottom:8px; font-size:12px; color:rgba(233,255,249,0.78); }
            .lc-label strong { color:#ffffff; font-weight:700; }
            .lc-control input[type=range], .lc-control select, .lc-control input[type=number] { width:100%; }
            .lc-control input[type=range] { accent-color:#47e8be; }
            .lc-control select, .lc-control input[type=number] {
                background:#0b1513;
                color:#edfff9;
                border:1px solid rgba(109,255,224,0.22);
                border-radius:10px;
                padding:10px;
                box-sizing:border-box;
            }
            .lc-mode-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:14px; }
            .lc-chip {
                text-align:center;
                padding:10px 8px;
                border-radius:12px;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(255,255,255,0.06);
                color:rgba(239,255,251,0.88);
                font-size:12px;
            }
            .lc-chip strong { display:block; color:#7ff8d8; font-size:17px; margin-bottom:4px; }
            .lc-editor-top { display:flex; justify-content:space-between; gap:14px; align-items:center; margin-bottom:16px; }
            .lc-editor-top .hint { color:rgba(230,255,248,0.72); font-size:12px; }
            .lc-step-grid { display:grid; grid-template-columns:repeat(8, minmax(120px, 1fr)); gap:12px; }
            .lc-step {
                position:relative;
                min-height:210px;
                border-radius:18px;
                border:1px solid rgba(255,255,255,0.08);
                background:linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
                padding:12px;
                box-sizing:border-box;
                overflow:hidden;
                transition:border-color .12s ease, transform .12s ease, box-shadow .12s ease, opacity .12s ease;
            }
            .lc-step::before {
                content:'';
                position:absolute;
                inset:auto -20px -45px auto;
                width:110px;
                height:110px;
                background: radial-gradient(circle, rgba(88,255,219,0.16), transparent 70%);
                pointer-events:none;
            }
            .lc-step:hover { transform:translateY(-1px); }
            .lc-step.inactive { opacity:0.55; }
            .lc-step.selected { border-color:rgba(109,255,224,0.65); box-shadow:0 0 0 1px rgba(109,255,224,0.18), 0 12px 25px rgba(0,255,183,0.09); }
            .lc-step.playing { border-color:#ffffff; box-shadow:0 0 0 1px rgba(255,255,255,0.24), 0 0 25px rgba(109,255,224,0.28); }
            .lc-step-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:12px; }
            .lc-step-index { font-size:12px; color:rgba(234,255,248,0.65); }
            .lc-note-big { font-size:24px; font-weight:900; color:#88ffe0; letter-spacing:0.02em; }
            .lc-mini { font-size:11px; color:rgba(234,255,248,0.58); }
            .lc-step input[type=range] { width:100%; margin: 14px 0 10px; }
            .lc-toggle-row { display:flex; gap:8px; flex-wrap:wrap; }
            .lc-toggle {
                flex:1;
                min-width:52px;
                border:none;
                border-radius:11px;
                padding:9px 8px;
                background:rgba(255,255,255,0.06);
                color:#eafff5;
                cursor:pointer;
                font-size:11px;
                font-weight:700;
                border:1px solid rgba(255,255,255,0.06);
            }
            .lc-toggle.active-toggle { background:rgba(109,255,224,0.18); border-color:rgba(109,255,224,0.34); color:#9bffe5; }
            .lc-piano {
                position:relative;
                height:110px;
                margin-top:16px;
                border-radius:16px;
                overflow:hidden;
                border:1px solid rgba(255,255,255,0.06);
                background:linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
            }
            .lc-piano-line { position:absolute; left:0; right:0; height:1px; background:rgba(255,255,255,0.06); }
            .lc-piano-dot {
                position:absolute;
                width:22px;
                height:10px;
                border-radius:999px;
                background:linear-gradient(90deg, #88ffe0, #6f8cff);
                box-shadow:0 0 12px rgba(109,255,224,0.28);
                transform:translate(-50%, -50%);
            }
            .lc-piano-dot.random-dot { background:linear-gradient(90deg, #fbc2eb, #6f8cff); }
            .lc-piano-dot.glide-dot { box-shadow:0 0 15px rgba(255,112,182,0.45); border:1px solid rgba(255,255,255,0.3); }
            .lc-footer { margin-top:16px; display:flex; justify-content:space-between; gap:10px; color:rgba(231,255,249,0.68); font-size:12px; }
            @media (max-width: 1280px) {
                .lc-grid-2 { grid-template-columns:1fr; }
                .lc-step-grid { grid-template-columns:repeat(4, minmax(120px, 1fr)); }
            }
            @media (max-width: 760px) {
                .lc-controls { grid-template-columns:1fr; }
                .lc-step-grid { grid-template-columns:repeat(2, minmax(120px, 1fr)); }
                .lc-mode-strip { grid-template-columns:1fr 1fr; }
            }
        </style>
        <div class="lc-shell">
            <div class="lc-hero">
                <div class="lc-hero-row">
                    <div>
                        <h1 class="lc-title">Logical <span>Chaos</span> Melody Machine</h1>
                        <div class="lc-sub">Build beautiful phrases, surprising motifs, or wild generative runs. Each step can be normal, gliding, or randomised. Turn Chaos down for musical elegance, or push it up for unstable and intricate melodies.</div>
                    </div>
                    <div class="lc-actions">
                        <button class="lc-btn" id="generateBtn">Generate</button>
                        <button class="lc-btn secondary" id="surpriseBtn">Surprise Me</button>
                        <button class="lc-btn secondary" id="playBtn">Play</button>
                        <button class="lc-btn danger" id="stopBtn">Stop</button>
                        <button class="lc-btn secondary" id="clearBtn">Clear</button>
                        <button class="lc-btn secondary" id="exportBtn">Export MIDI</button>
                    </div>
                </div>
                <div class="lc-status" id="lc-status"></div>
            </div>
            <div class="lc-grid-2">
                <div class="lc-panel">
                    <h3>Melody Engine</h3>
                    <div class="lc-controls">
                        <div class="lc-control">
                            <div class="lc-label"><span>Tempo</span><strong id="tempoVal">120</strong></div>
                            <input id="tempo" type="range" min="50" max="220" value="120">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Chaos</span><strong id="chaosVal">35</strong></div>
                            <input id="chaos" type="range" min="0" max="100" value="35">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Density</span><strong id="densityVal">78</strong></div>
                            <input id="density" type="range" min="0" max="100" value="78">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Gate</span><strong id="gateVal">72</strong></div>
                            <input id="gate" type="range" min="5" max="100" value="72">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Swing</span><strong id="swingVal">0</strong></div>
                            <input id="swing" type="range" min="0" max="65" value="0">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Steps</span><strong id="patternLengthVal">16</strong></div>
                            <select id="patternLength">
                                <option value="8">8</option>
                                <option value="16" selected>16</option>
                                <option value="32">32</option>
                            </select>
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Root MIDI Note</span><strong id="rootNoteLabel">60 / C4</strong></div>
                            <input id="rootNote" type="number" min="36" max="72" value="60">
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Scale</span><strong id="scaleModeLabel">Minor</strong></div>
                            <select id="scaleMode">
                                <option value="0">Major</option>
                                <option value="1" selected>Minor</option>
                                <option value="2">Pentatonic</option>
                                <option value="3">Dorian</option>
                                <option value="4">Phrygian</option>
                                <option value="5">Harmonic Minor</option>
                            </select>
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Octave Span</span><strong id="octaveSpanVal">2</strong></div>
                            <select id="octaveSpan">
                                <option value="1">1</option>
                                <option value="2" selected>2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                            </select>
                        </div>
                        <div class="lc-control">
                            <div class="lc-label"><span>Transpose</span><strong id="transposeVal">0</strong></div>
                            <input id="transpose" type="number" min="-24" max="24" value="0">
                        </div>
                    </div>
                    <div class="lc-mode-strip">
                        <div class="lc-chip"><strong>Beautiful</strong>Lower chaos + high density + softer movement</div>
                        <div class="lc-chip"><strong>Wild</strong>Higher chaos adds leaps, glide and random notes</div>
                        <div class="lc-chip"><strong>Glide</strong>Steps with glide overlap into the next step</div>
                        <div class="lc-chip"><strong>Random</strong>Random steps can mutate each pass while staying musical</div>
                    </div>
                </div>
                <div class="lc-panel">
                    <div class="lc-editor-top">
                        <div>
                            <h3 style="margin-bottom:6px">32-Step Melody Painter</h3>
                            <div class="hint">Tap a step to edit it. ON enables the step. GLIDE overlaps into the next step. RAND lets Chaos mutate that step each cycle.</div>
                        </div>
                        <div class="hint">Selected step: <strong id="selectedStepText">1</strong></div>
                    </div>
                    <div id="stepGrid" class="lc-step-grid"></div>
                    <div class="lc-piano" id="pianoView"></div>
                    <div class="lc-footer">
                        <div>Tip: set Chaos between 15–35 for beautiful motifs, 40–65 for complex melodies, and above 70 for unstable madness.</div>
                        <div id="playStateText">Stopped</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const scaleNames = ['Major', 'Minor', 'Pentatonic', 'Dorian', 'Phrygian', 'Harmonic Minor'];

    function refreshLabels()
    {
        root.querySelector('#tempoVal').textContent = String(state.tempo);
        root.querySelector('#chaosVal').textContent = String(state.chaos);
        root.querySelector('#densityVal').textContent = String(state.density);
        root.querySelector('#gateVal').textContent = String(state.gate);
        root.querySelector('#swingVal').textContent = String(state.swing);
        root.querySelector('#patternLengthVal').textContent = String(state.length);
        root.querySelector('#rootNoteLabel').textContent = state.rootNote + ' / ' + noteName(state.rootNote);
        root.querySelector('#scaleModeLabel').textContent = scaleNames[state.scaleMode] || 'Minor';
        root.querySelector('#octaveSpanVal').textContent = String(state.octaveSpan);
        root.querySelector('#transposeVal').textContent = String(state.transpose);
        root.querySelector('#selectedStepText').textContent = String(state.selectedStep + 1);
        root.querySelector('#playStateText').textContent = state.isPlaying ? 'Playing' : 'Stopped';
        setStatus(state.log);
    }

    function bindParam(id, parser, onValue)
    {
        const el = root.querySelector('#' + id);
        if (!el) return;

        const handler = () => {
            const value = parser(el.value);
            onValue(value);
            safeSend(id, value);
            refreshLabels();
            drawPiano();
        };

        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        handler();
    }

    bindParam('tempo', v => parseInt(v, 10), v => { state.tempo = v; });
    bindParam('chaos', v => parseInt(v, 10), v => { state.chaos = v; });
    bindParam('density', v => parseInt(v, 10), v => { state.density = v; });
    bindParam('gate', v => parseInt(v, 10), v => { state.gate = v; });
    bindParam('swing', v => parseInt(v, 10), v => { state.swing = v; });
    bindParam('patternLength', v => parseInt(v, 10), v => { state.length = v; drawGrid(); });
    bindParam('rootNote', v => clamp(parseInt(v, 10) || 60, 36, 72), v => { state.rootNote = v; });
    bindParam('scaleMode', v => parseInt(v, 10), v => { state.scaleMode = v; });
    bindParam('octaveSpan', v => parseInt(v, 10), v => { state.octaveSpan = v; });
    bindParam('transpose', v => clamp(parseInt(v, 10) || 0, -24, 24), v => { state.transpose = v; });

    function toggleStepValue(stepIndex, key)
    {
        state.steps[stepIndex][key] = state.steps[stepIndex][key] ? 0 : 1;
        safeSend('setStepPacked', packStep(stepIndex));
        drawGrid();
        drawPiano();
    }

    function drawGrid()
    {
        const grid = root.querySelector('#stepGrid');
        grid.innerHTML = '';

        for (let i = 0; i < state.length; i++)
        {
            const step = state.steps[i];
            const card = document.createElement('div');
            card.className = 'lc-step'
                + (step.active ? '' : ' inactive')
                + (state.selectedStep === i ? ' selected' : '')
                + (state.playingStep === i && state.isPlaying ? ' playing' : '');

            card.innerHTML = `
                <div class="lc-step-head">
                    <div>
                        <div class="lc-step-index">Step ${i + 1}</div>
                        <div class="lc-note-big">${noteName(step.note)}</div>
                        <div class="lc-mini">MIDI ${step.note}</div>
                    </div>
                    <div class="lc-mini">${step.random ? 'Mutation' : (step.glide ? 'Legato' : 'Stable')}</div>
                </div>
                <input class="note-range" type="range" min="36" max="96" value="${step.note}">
                <div class="lc-toggle-row">
                    <button class="lc-toggle ${step.active ? 'active-toggle' : ''}" data-action="active">${step.active ? 'ON' : 'OFF'}</button>
                    <button class="lc-toggle ${step.glide ? 'active-toggle' : ''}" data-action="glide">GLIDE</button>
                    <button class="lc-toggle ${step.random ? 'active-toggle' : ''}" data-action="random">RAND</button>
                </div>
            `;

            card.addEventListener('click', (event) => {
                if (event.target && event.target.classList.contains('lc-toggle')) return;
                if (event.target && event.target.classList.contains('note-range')) return;
                state.selectedStep = i;
                refreshLabels();
                drawGrid();
            });

            const slider = card.querySelector('.note-range');
            slider.addEventListener('input', () => {
                step.note = parseInt(slider.value, 10);
                safeSend('setStepPacked', packStep(i));
                if (state.selectedStep !== i)
                    state.selectedStep = i;
                drawGrid();
                drawPiano();
            });

            card.querySelectorAll('.lc-toggle').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    state.selectedStep = i;
                    toggleStepValue(i, action);
                    refreshLabels();
                });
            });

            grid.appendChild(card);
        }
    }

    function drawPiano()
    {
        const piano = root.querySelector('#pianoView');
        piano.innerHTML = '';

        const visible = state.steps.slice(0, state.length);
        const low = 36;
        const high = 96;
        const range = high - low;

        for (let i = 0; i <= 12; i++)
        {
            const line = document.createElement('div');
            line.className = 'lc-piano-line';
            line.style.top = (i / 12 * 100) + '%';
            piano.appendChild(line);
        }

        visible.forEach((step, index) => {
            if (!step.active) return;
            const dot = document.createElement('div');
            dot.className = 'lc-piano-dot'
                + (step.random ? ' random-dot' : '')
                + (step.glide ? ' glide-dot' : '');
            dot.title = `Step ${index + 1}: ${noteName(step.note)}${step.random ? ' / random' : ''}${step.glide ? ' / glide' : ''}`;
            dot.style.left = ((index + 0.5) / state.length * 100) + '%';
            dot.style.top = (100 - ((clamp(step.note, low, high) - low) / range * 100)) + '%';
            piano.appendChild(dot);
        });
    }

    function exportMidi()
    {
        const ppq = 480;
        const stepTicksBase = 120;
        const gateTicks = Math.max(8, Math.floor(stepTicksBase * (state.gate / 100)));
        const swingAmount = (state.swing / 100) * 0.45;
        const mpqn = Math.floor(60000000 / Math.max(1, state.tempo));
        const tr = [];

        function pushText(a, s) { for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); }
        function push16(a, v) { a.push((v >> 8) & 255, v & 255); }
        function push32(a, v) { a.push((v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255); }
        function pushVar(a, v)
        {
            let buffer = v & 0x7F;
            while ((v >>= 7))
            {
                buffer <<= 8;
                buffer |= ((v & 0x7F) | 0x80);
            }
            for (;;)
            {
                a.push(buffer & 0xFF);
                if (buffer & 0x80) buffer >>= 8; else break;
            }
        }

        pushVar(tr, 0);
        tr.push(0xFF, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255);

        let pendingDelta = 0;

        for (let i = 0; i < state.length; i++)
        {
            const step = state.steps[i];
            let stepTicks = stepTicksBase;
            if (i % 2 === 0) stepTicks = Math.max(30, Math.round(stepTicksBase * (1 - swingAmount)));
            else stepTicks = Math.max(30, Math.round(stepTicksBase * (1 + swingAmount)));

            if (!step.active)
            {
                pendingDelta += stepTicks;
                continue;
            }

            const note = resolveExportNote(i, i * 97);
            const thisGate = step.glide ? Math.max(stepTicks, gateTicks) : Math.min(stepTicks, gateTicks);
            const noteOffDelta = step.glide ? Math.max(10, stepTicks - 6) : thisGate;

            pushVar(tr, pendingDelta);
            tr.push(0x90, note & 0x7F, 100);
            pushVar(tr, noteOffDelta);
            tr.push(0x80, note & 0x7F, 0);

            pendingDelta = Math.max(0, stepTicks - noteOffDelta);
        }

        pushVar(tr, pendingDelta);
        tr.push(0xFF, 0x2F, 0);

        const out = [];
        pushText(out, 'MThd');
        push32(out, 6);
        push16(out, 0);
        push16(out, 1);
        push16(out, ppq);
        pushText(out, 'MTrk');
        push32(out, tr.length);

        const blob = new Blob([new Uint8Array(out.concat(tr))], { type: 'audio/midi' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'LogicalChaosMelody.mid';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        setStatus('MIDI file exported.');
        refreshLabels();
    }

    function randomiseSeedAndGenerate(stronger)
    {
        const randomValue = Math.floor(Math.random() * 2147483000) + 1;
        safeSend('randomSeed', randomValue);

        if (stronger)
        {
            state.chaos = clamp(state.chaos + 15, 0, 100);
            state.density = clamp(state.density + 3, 0, 100);
            root.querySelector('#chaos').value = String(state.chaos);
            root.querySelector('#density').value = String(state.density);
            safeSend('chaos', state.chaos);
            safeSend('density', state.density);
        }

        safeSend('generate', 1);
        setStatus(stronger
            ? 'Surprise pattern generated — extra chaos applied.'
            : 'Generated a new pattern. Tweak steps or press Play.');
        refreshLabels();
    }

    root.querySelector('#generateBtn').addEventListener('click', () => randomiseSeedAndGenerate(false));
    root.querySelector('#surpriseBtn').addEventListener('click', () => randomiseSeedAndGenerate(true));
    root.querySelector('#playBtn').addEventListener('click', () => {
        state.isPlaying = true;
        safeSend('play', 1);
        setStatus('Playing the current pattern as MIDI output.');
        refreshLabels();
        drawGrid();
    });
    root.querySelector('#stopBtn').addEventListener('click', () => {
        state.isPlaying = false;
        state.playingStep = -1;
        safeSend('stop', 1);
        setStatus('Stopped.');
        refreshLabels();
        drawGrid();
    });
    root.querySelector('#clearBtn').addEventListener('click', () => {
        safeSend('clearPattern', 1);
        setStatus('Cleared the pattern.');
        refreshLabels();
    });
    root.querySelector('#exportBtn').addEventListener('click', exportMidi);

    function handleStepMessage(value)
    {
        const kind = (value >>> 28) & 0xF;
        const step = (value >>> 20) & 0xFF;
        const note = (value >>> 13) & 0x7F;
        const active = (value >>> 2) & 1;
        const glide = (value >>> 1) & 1;
        const random = value & 1;

        if (kind === 1)
        {
            if (step === 255)
            {
                state.playingStep = -1;
                state.isPlaying = false;
            }
            else
            {
                state.playingStep = step;
                state.isPlaying = true;
            }
            drawGrid();
            refreshLabels();
            return;
        }

        if (kind === 2 && step < 32)
        {
            state.steps[step].note = note;
            state.steps[step].active = active;
            state.steps[step].glide = glide;
            state.steps[step].random = random;
            drawGrid();
            drawPiano();
        }
    }

    try
    {
        if (connection && connection.addEndpointListener)
            connection.addEndpointListener('stepToUI', handleStepMessage);
        if (connection && connection.addOutputEventListener)
            connection.addOutputEventListener('stepToUI', handleStepMessage);
    }
    catch (e)
    {
        setStatus('Listener error: ' + e.message);
    }

    refreshLabels();
    drawGrid();
    drawPiano();
    safeSend('requestPatternDump', 1);

    return root;
}
