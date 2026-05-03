export default function createPatchView (patchConnection) {
    const root = document.createElement('div');
    root.style.cssText = `width:100%; height:100%; background:#050808; color:#00ffcc; font-family:sans-serif; padding:20px; overflow:auto;`;

    const state = {
        length: 16,
        steps: Array.from({length:64}, () => ({ notes: [60,64,67,72], active: [0,0,0,0], glide: 0 })),
        playingStep: -1,
        selectedStep: 0
    };

    const send = (id, val) => patchConnection?.sendEventOrValue(id, val);
    const pack = (i, v) => (2 << 28) | (i << 21) | (v << 18) | (state.steps[i].notes[v] << 11) | (state.steps[i].active[v] << 1) | state.steps[i].glide;

    root.innerHTML = `
        <style>
            .panel { background: #0a1212; border: 1px solid #00ffcc33; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 0 20px #00ffcc0a; }
            .grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 5px; }
            .step { height: 60px; border: 1px solid #00ffcc22; border-radius: 4px; cursor: pointer; position: relative; background: #ffffff05; }
            .step.active-step { border-color: #00ffcc; box-shadow: 0 0 10px #00ffcc44; }
            .step.playing { background: #00ffcc22; }
            .step-num { font-size: 9px; opacity: 0.5; padding: 2px; }
            .glide-indicator { position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; background: #ff00ff; border-radius: 50%; display: none; }
            .mini-note { position: absolute; left: 10%; width: 80%; height: 3px; background: #00ffcc; border-radius: 2px; }
            button { background: #00ffcc; color: #050808; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; margin-right: 10px; }
            button:hover { background: #00ccaa; }
            select, input { background: #101a1a; color: #00ffcc; border: 1px solid #00ffcc44; padding: 5px; border-radius: 4px; }
            .editor-box { display: flex; gap: 20px; align-items: center; background: #101a1a; padding: 15px; border-radius: 8px; margin-top: 15px; }
        </style>

        <div class="panel">
            <h2 style="margin-top:0; letter-spacing:2px;">LOGICAL CHAOS <span style="color:#ff00ff">PRO</span></h2>
            <button id="gen">GENERATE</button>
            <button id="play">PLAY</button>
            <button id="stop">STOP</button>
            <select id="len">
                <option value="8">8 Steps</option>
                <option value="16" selected>16 Steps</option>
                <option value="32">32 Steps</option>
                <option value="64">64 Steps</option>
            </select>
        </div>

        <div class="panel">
            <div id="grid" class="grid"></div>
            <div id="editor" class="editor-box"></div>
        </div>
    `;

    function drawGrid() {
        const g = root.querySelector('#grid');
        g.innerHTML = '';
        for (let i = 0; i < state.length; i++) {
            const s = state.steps[i];
            const div = document.createElement('div');
            div.className = `step ${i === state.selectedStep ? 'active-step' : ''} ${i === state.playingStep ? 'playing' : ''}`;
            div.innerHTML = `<div class="step-num">${i+1}</div><div class="glide-indicator" style="display:${s.glide?'block':'none'}"></div>`;
            s.active.forEach((a, v) => {
                if (a) {
                    const n = document.createElement('div');
                    n.className = 'mini-note';
                    n.style.bottom = `${((s.notes[v]-36)/48)*100}%`;
                    div.appendChild(n);
                }
            });
            div.onclick = () => { state.selectedStep = i; drawGrid(); drawEditor(); };
            g.appendChild(div);
        }
    }

    function drawEditor() {
        const e = root.querySelector('#editor');
        const s = state.steps[state.selectedStep];
        e.innerHTML = `
            <div><strong>Step ${state.selectedStep + 1}</strong></div>
            <button id="tglGlide" style="background:${s.glide?'#ff00ff':'#333'}">GLIDE: ${s.glide?'ON':'OFF'}</button>
            <div id="voices"></div>
        `;
        e.querySelector('#tglGlide').onclick = () => { 
            s.glide = s.glide ? 0 : 1; 
            for(let v=0; v<4; v++) send('setStepPacked', pack(state.selectedStep, v));
            drawGrid(); drawEditor(); 
        };
        
        const vBox = e.querySelector('#voices');
        s.active.forEach((a, v) => {
            const row = document.createElement('div');
            row.style.margin = "5px 0";
            row.innerHTML = `<input type="checkbox" ${a?'checked':''}> Voice ${v}: <input type="number" value="${s.notes[v]}" min="20" max="100" style="width:50px">`;
            const chk = row.querySelector('input[type=checkbox]');
            const num = row.querySelector('input[type=number]');
            chk.onchange = () => { s.active[v] = chk.checked ? 1 : 0; send('setStepPacked', pack(state.selectedStep, v)); drawGrid(); };
            num.onchange = () => { s.notes[v] = parseInt(num.value); send('setStepPacked', pack(state.selectedStep, v)); drawGrid(); };
            vBox.appendChild(row);
        });
    }

    root.querySelector('#gen').onclick = () => send('generate', 1);
    root.querySelector('#play').onclick = () => send('play', 1);
    root.querySelector('#stop').onclick = () => { state.playingStep = -1; send('stop', 1); drawGrid(); };
    root.querySelector('#len').onchange = (e) => { state.length = parseInt(e.target.value); send('patternLength', state.length); drawGrid(); };

    patchConnection.addEndpointListener('stepToUI', (v) => {
        const kind = (v >> 28) & 15;
        const step = (v >> 21) & 127;
        const voice = (v >> 18) & 7;
        const note = (v >> 11) & 127;
        const active = (v >> 1) & 1;
        const glide = v & 1;

        if (kind === 3) { state.playingStep = step; drawGrid(); }
        if (kind === 2) {
            state.steps[step].notes[voice] = note;
            state.steps[step].active[voice] = active;
            state.steps[step].glide = glide;
            drawGrid();
        }
    });

    drawGrid();
    drawEditor();
    return root;
}
            .step.playing { background: #00ffcc22; }
            .step-num { font-size: 9px; opacity: 0.5; padding: 2px; }
            .glide-indicator { position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; background: #ff00ff; border-radius: 50%; display: none; }
            .mini-note { position: absolute; left: 10%; width: 80%; height: 3px; background: #00ffcc; border-radius: 2px; }
            button { background: #00ffcc; color: #050808; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; margin-right: 10px; }
            button:hover { background: #00ccaa; }
            select, input { background: #101a1a; color: #00ffcc; border: 1px solid #00ffcc44; padding: 5px; border-radius: 4px; }
            .editor-box { display: flex; gap: 20px; align-items: center; background: #101a1a; padding: 15px; border-radius: 8px; margin-top: 15px; }
        </style>

        <div class="panel">
            <h2 style="margin-top:0; letter-spacing:2px;">LOGICAL CHAOS <span style="color:#ff00ff">PRO</span></h2>
            <button id="gen">GENERATE</button>
            <button id="play">PLAY</button>
            <button id="stop">STOP</button>
            <select id="len">
                <option value="8">8 Steps</option>
                <option value="16" selected>16 Steps</option>
                <option value="32">32 Steps</option>
                <option value="64">64 Steps</option>
            </select>
        </div>

        <div class="panel">
            <div id="grid" class="grid"></div>
            <div id="editor" class="editor-box"></div>
        </div>
    `;

    function drawGrid() {
        const g = root.querySelector('#grid');
        g.innerHTML = '';
        for (let i = 0; i < state.length; i++) {
            const s = state.steps[i];
            const div = document.createElement('div');
            div.className = `step ${i === state.selectedStep ? 'active-step' : ''} ${i === state.playingStep ? 'playing' : ''}`;
            div.innerHTML = `<div class="step-num">${i+1}</div><div class="glide-indicator" style="display:${s.glide?'block':'none'}"></div>`;
            s.active.forEach((a, v) => {
                if (a) {
                    const n = document.createElement('div');
                    n.className = 'mini-note';
                    n.style.bottom = `${((s.notes[v]-36)/48)*100}%`;
                    div.appendChild(n);
                }
            });
            div.onclick = () => { state.selectedStep = i; drawGrid(); drawEditor(); };
            g.appendChild(div);
        }
    }

    function drawEditor() {
        const e = root.querySelector('#editor');
        const s = state.steps[state.selectedStep];
        e.innerHTML = `
            <div><strong>Step ${state.selectedStep + 1}</strong></div>
            <button id="tglGlide" style="background:${s.glide?'#ff00ff':'#333'}">GLIDE: ${s.glide?'ON':'OFF'}</button>
            <div id="voices"></div>
        `;
        e.querySelector('#tglGlide').onclick = () => { 
            s.glide = s.glide ? 0 : 1; 
            for(let v=0; v<4; v++) send('setStepPacked', pack(state.selectedStep, v));
            drawGrid(); drawEditor(); 
        };
        
        const vBox = e.querySelector('#voices');
        s.active.forEach((a, v) => {
            const row = document.createElement('div');
            row.style.margin = "5px 0";
            row.innerHTML = `<input type="checkbox" ${a?'checked':''}> Voice ${v}: <input type="number" value="${s.notes[v]}" min="20" max="100" style="width:50px">`;
            const chk = row.querySelector('input[type=checkbox]');
            const num = row.querySelector('input[type=number]');
            chk.onchange = () => { s.active[v] = chk.checked ? 1 : 0; send('setStepPacked', pack(state.selectedStep, v)); drawGrid(); };
            num.onchange = () => { s.notes[v] = parseInt(num.value); send('setStepPacked', pack(state.selectedStep, v)); drawGrid(); };
            vBox.appendChild(row);
        });
    }

    root.querySelector('#gen').onclick = () => send('generate', 1);
    root.querySelector('#play').onclick = () => send('play', 1);
    root.querySelector('#stop').onclick = () => { state.playingStep = -1; send('stop', 1); drawGrid(); };
    root.querySelector('#len').onchange = (e) => { state.length = parseInt(e.target.value); send('patternLength', state.length); drawGrid(); };

    patchConnection.addEndpointListener('stepToUI', (v) => {
        const kind = (v >> 28) & 15;
        const step = (v >> 21) & 127;
        const voice = (v >> 18) & 7;
        const note = (v >> 11) & 127;
        const active = (v >> 1) & 1;
        const glide = v & 1;

        if (kind === 3) { state.playingStep = step; drawGrid(); }
        if (kind === 2) {
            state.steps[step].notes[voice] = note;
            state.steps[step].active[voice] = active;
            state.steps[step].glide = glide;
            drawGrid();
        }
    });

    drawGrid();
    drawEditor();
    return root;
}
