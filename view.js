class LogicalChaosMelodyMachine extends HTMLElement
{
    constructor (patchConnectionOrContext)
    {
        super();
        // Cmajor can pass either the PatchConnection directly or an object shaped like { patchConnection }.
        this.patchConnection = patchConnectionOrContext && patchConnectionOrContext.patchConnection
            ? patchConnectionOrContext.patchConnection
            : patchConnectionOrContext;
        this.steps = [];
        this.currentStep = -1;
        this.isPlaying = false;

        for (let i = 0; i < 32; ++i)
            this.steps.push ({ note: 60, active: i < 16, velocity: 96 });

        this.attachShadow ({ mode: "open" });
        this.shadowRoot.innerHTML = this.createHTML();
    }

    getScaleFactorLimits()
    {
        return { minScale: 0.65, maxScale: 1.35 };
    }

    connectedCallback()
    {
        this.cacheElements();
        this.createStepGrid();
        this.bindControls();
        this.bindPatchListeners();
        this.renderAllSteps();
        this.drawScope();

        this.sendValue ("tempo", 120);
        this.sendValue ("chaos", 35);
        this.sendValue ("density", 78);
        this.sendValue ("gate", 72);
        this.sendValue ("patternLength", 16);
        this.sendValue ("rootNote", 60);
        this.sendValue ("scaleMode", 1);
        this.sendValue ("octaveSpan", 2);
        this.sendValue ("transpose", 0);
        this.sendValue ("swing", 0);

        this.patchConnection.sendEventOrValue ("requestPatternDump", 1);
    }

    createHTML()
    {
        return `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                background: radial-gradient(circle at 50% 15%, #14231f 0%, #090b0a 55%, #020303 100%);
                color: #d7fff2;
                font-family: "Courier New", ui-monospace, monospace;
                overflow: hidden;
                user-select: none;
            }
            * { box-sizing: border-box; }
            .machine {
                height: 100%;
                padding: 16px;
                display: grid;
                grid-template-columns: 260px 1fr;
                gap: 14px;
            }
            .panel {
                border: 1px solid rgba(0, 255, 170, 0.36);
                border-radius: 18px;
                background: rgba(0, 0, 0, 0.38);
                box-shadow: 0 0 28px rgba(0, 255, 170, 0.12), inset 0 0 28px rgba(0, 255, 170, 0.04);
                padding: 14px;
                min-height: 0;
            }
            h1 {
                margin: 0;
                color: #00ffaa;
                letter-spacing: 2px;
                font-size: 20px;
                text-align: center;
                text-shadow: 0 0 14px rgba(0,255,170,0.6);
            }
            .subtitle {
                text-align: center;
                color: rgba(215,255,242,0.58);
                font-size: 11px;
                margin: 5px 0 12px;
            }
            canvas {
                display: block;
                width: 210px;
                height: 140px;
                margin: 0 auto 12px;
                border-radius: 16px;
                background: #020504;
                border: 1px solid rgba(0,255,170,0.2);
            }
            .buttons {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin: 12px 0;
            }
            button {
                background: linear-gradient(180deg, rgba(0,255,170,0.18), rgba(0,255,170,0.06));
                color: #d7fff2;
                border: 1px solid rgba(0,255,170,0.5);
                border-radius: 10px;
                padding: 9px 8px;
                font-family: inherit;
                font-weight: 700;
                cursor: pointer;
                box-shadow: inset 0 0 12px rgba(0,255,170,0.06);
            }
            button:hover { border-color: rgba(0,255,170,0.9); color: #00ffaa; }
            button.primary { grid-column: span 2; font-size: 15px; }
            .control {
                margin: 10px 0;
            }
            label {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                font-size: 12px;
                color: rgba(215,255,242,0.82);
                margin-bottom: 5px;
            }
            label b { color: #00ffaa; font-weight: 400; }
            input[type=range], select {
                width: 100%;
            }
            select, input[type=number] {
                background: #04100c;
                color: #d7fff2;
                border: 1px solid rgba(0,255,170,0.35);
                border-radius: 8px;
                padding: 7px;
                font-family: inherit;
            }
            .gridPanel {
                display: grid;
                grid-template-rows: auto 1fr auto;
                min-width: 0;
            }
            .gridHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
            }
            .gridHeader .title {
                color: #00ffaa;
                letter-spacing: 1px;
                font-size: 16px;
                font-weight: 700;
            }
            .stepGrid {
                display: grid;
                grid-template-columns: repeat(16, minmax(24px, 1fr));
                gap: 7px;
                align-content: start;
                overflow: auto;
                padding: 4px;
            }
            .step {
                min-height: 128px;
                border: 1px solid rgba(0,255,170,0.25);
                border-radius: 12px;
                background: rgba(0,255,170,0.045);
                padding: 6px 4px;
                display: grid;
                grid-template-rows: auto 1fr auto;
                gap: 5px;
                position: relative;
            }
            .step.off {
                opacity: 0.38;
                background: rgba(255,255,255,0.025);
            }
            .step.playing {
                border-color: #00ffaa;
                box-shadow: 0 0 18px rgba(0,255,170,0.45);
                transform: translateY(-1px);
            }
            .stepNum {
                text-align: center;
                font-size: 10px;
                color: rgba(215,255,242,0.62);
            }
            .noteSlider {
                writing-mode: vertical-lr;
                direction: rtl;
                width: 100%;
                height: 72px;
                margin: 0 auto;
            }
            .noteName {
                text-align: center;
                color: #00ffaa;
                font-size: 11px;
                min-height: 14px;
            }
            .toggle {
                width: 100%;
                padding: 4px 0;
                font-size: 10px;
                border-radius: 8px;
            }
            .footer {
                margin-top: 10px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                color: rgba(215,255,242,0.58);
                font-size: 11px;
            }
            .status {
                border: 1px solid rgba(0,255,170,0.2);
                border-radius: 12px;
                padding: 8px;
                background: rgba(0,0,0,0.25);
            }
            .warning {
                color: #ffd48a;
            }
        </style>

        <div class="machine">
            <section class="panel">
                <h1>LOGICAL CHAOS</h1>
                <div class="subtitle">MIDI MELODY MACHINE</div>
                <canvas id="scope" width="420" height="280"></canvas>

                <div class="buttons">
                    <button id="generate" class="primary">GENERATE MELODY</button>
                    <button id="play">PLAY</button>
                    <button id="stop">STOP</button>
                    <button id="exportMidi" class="primary">EXPORT MIDI FILE</button>
                </div>

                <div class="control"><label>Steps <b id="stepsText">16</b></label><select id="patternLength"><option value="8">8 steps</option><option value="16" selected>16 steps</option><option value="32">32 steps</option></select></div>
                <div class="control"><label>Scale <b id="scaleText">Minor</b></label><select id="scaleMode"><option value="0">Major</option><option value="1" selected>Minor</option><option value="2">Pentatonic</option><option value="3">Dorian</option><option value="4">Phrygian</option><option value="5">Harmonic Minor</option></select></div>
                <div class="control"><label>Root <b id="rootText">C3</b></label><input id="rootNote" type="range" min="36" max="72" value="60"></div>
                <div class="control"><label>Tempo <b id="tempoText">120 BPM</b></label><input id="tempo" type="range" min="50" max="220" value="120"></div>
                <div class="control"><label>Chaos <b id="chaosText">35%</b></label><input id="chaos" type="range" min="0" max="100" value="35"></div>
                <div class="control"><label>Density <b id="densityText">78%</b></label><input id="density" type="range" min="0" max="100" value="78"></div>
                <div class="control"><label>Gate <b id="gateText">72%</b></label><input id="gate" type="range" min="5" max="95" value="72"></div>
                <div class="control"><label>Swing <b id="swingText">0%</b></label><input id="swing" type="range" min="0" max="65" value="0"></div>
                <div class="control"><label>Octaves <b id="octaveText">2</b></label><input id="octaveSpan" type="range" min="1" max="4" value="2"></div>
                <div class="control"><label>Transpose <b id="transposeText">0</b></label><input id="transpose" type="range" min="-24" max="24" value="0"></div>
            </section>

            <section class="panel gridPanel">
                <div class="gridHeader">
                    <div class="title">STEP MELODY EDITOR</div>
                    <div id="status" class="warning">Generate a melody, then press Play. MIDI is sent from midiOut.</div>
                </div>
                <div id="stepGrid" class="stepGrid"></div>
                <div class="footer">
                    <div class="status">Tip: place this before a VST instrument. Turn plugin monitoring on, then press Play here.</div>
                    <div class="status">Each column has note height + on/off. Export creates a simple MIDI clip from the visible pattern.</div>
                </div>
            </section>
        </div>`;
    }

    cacheElements()
    {
        this.grid = this.shadowRoot.getElementById ("stepGrid");
        this.scope = this.shadowRoot.getElementById ("scope");
        this.ctx = this.scope.getContext ("2d");
        this.status = this.shadowRoot.getElementById ("status");
    }

    bindPatchListeners()
    {
        var self = this;

        this.patchConnection.addEndpointListener ("stepToUI", function (message)
        {
            self.handleStepEndpoint (message);
        });

        this.patchConnection.addEndpointListener ("midiToUI", function (message)
        {
            self.handleMidiEndpoint (message);
        });
    }

    handleStepEndpoint (message)
    {
        if (Array.isArray (message))
        {
            for (let i = 0; i < message.length; ++i)
                this.handleStepEndpoint (message[i]);
            return;
        }

        let packed = typeof message === "number" ? message : Number (message.value || message.message || 0);
        let kind = (packed >> 24) & 255;
        let step = (packed >> 16) & 255;
        let note = (packed >> 8) & 255;
        let active = packed & 255;

        if (kind === 2 && step < 32)
        {
            this.steps[step].note = note;
            this.steps[step].active = active !== 0;
            this.renderStep (step);
        }
        else if (kind === 3)
        {
            this.currentStep = step;
            this.renderAllSteps();
        }
    }

    handleMidiEndpoint (message)
    {
        if (Array.isArray (message))
        {
            for (let i = 0; i < message.length; ++i)
                this.handleMidiEndpoint (message[i]);
            return;
        }

        let packed = typeof message === "number" ? message : Number (message.message || 0);
        let status = (packed >> 16) & 255;
        let note = (packed >> 8) & 127;
        let velocity = packed & 127;

        if ((status & 240) === 144 && velocity > 0)
            this.lastMidi = { note: note, velocity: velocity, time: performance.now() };
    }

    bindControls()
    {
        var self = this;
        this.shadowRoot.getElementById ("generate").addEventListener ("click", function() {
            self.status.textContent = "Generated. Press Play or export the MIDI file.";
            self.patchConnection.sendEventOrValue ("randomSeed", Math.floor (Date.now() & 0x7fffffff));
            self.patchConnection.sendEventOrValue ("generate", 1);
        });

        this.shadowRoot.getElementById ("play").addEventListener ("click", function() {
            self.isPlaying = true;
            self.patchConnection.sendEventOrValue ("play", 1);
        });

        this.shadowRoot.getElementById ("stop").addEventListener ("click", function() {
            self.isPlaying = false;
            self.patchConnection.sendEventOrValue ("stop", 1);
        });

        this.shadowRoot.getElementById ("exportMidi").addEventListener ("click", function() {
            self.exportMidiFile();
        });

        this.bindRange ("tempo", "tempoText", function(v) { return Math.round (v) + " BPM"; }, function(v) { return v; });
        this.bindRange ("chaos", "chaosText", function(v) { return Math.round (v) + "%"; }, function(v) { return v; });
        this.bindRange ("density", "densityText", function(v) { return Math.round (v) + "%"; }, function(v) { return v; });
        this.bindRange ("gate", "gateText", function(v) { return Math.round (v) + "%"; }, function(v) { return v; });
        this.bindRange ("swing", "swingText", function(v) { return Math.round (v) + "%"; }, function(v) { return v; });
        this.bindRange ("octaveSpan", "octaveText", function(v) { return String (Math.round (v)); }, function(v) { return Math.round (v); });
        this.bindRange ("transpose", "transposeText", function(v) { return String (Math.round (v)); }, function(v) { return Math.round (v); });
        this.bindRange ("rootNote", "rootText", function(v) { return self.noteName (Math.round (v)); }, function(v) { return Math.round (v); });

        this.shadowRoot.getElementById ("patternLength").addEventListener ("change", function(e) {
            let v = parseInt (e.target.value, 10);
            self.shadowRoot.getElementById ("stepsText").textContent = String (v);
            self.sendValue ("patternLength", v);
            self.renderAllSteps();
        });

        this.shadowRoot.getElementById ("scaleMode").addEventListener ("change", function(e) {
            self.shadowRoot.getElementById ("scaleText").textContent = e.target.options[e.target.selectedIndex].textContent;
            self.sendValue ("scaleMode", parseInt (e.target.value, 10));
        });
    }

    bindRange (id, textID, format, transform)
    {
        var self = this;
        var el = this.shadowRoot.getElementById (id);
        var text = this.shadowRoot.getElementById (textID);
        var send = function() {
            var raw = parseFloat (el.value);
            text.textContent = format (raw);
            self.sendValue (id, transform (raw));
        };
        el.addEventListener ("input", send);
        send();
    }

    sendValue (id, value)
    {
        this.patchConnection.sendEventOrValue (id, value);
    }

    createStepGrid()
    {
        for (let i = 0; i < 32; ++i)
        {
            let step = document.createElement ("div");
            step.className = "step";
            step.innerHTML = `<div class="stepNum">${i + 1}</div><input class="noteSlider" type="range" min="36" max="84" value="60"><div class="noteName">C3</div><button class="toggle">ON</button>`;
            this.grid.appendChild (step);

            let slider = step.querySelector ("input");
            let toggle = step.querySelector ("button");
            let self = this;

            slider.addEventListener ("input", function() {
                self.steps[i].note = parseInt (slider.value, 10);
                self.sendStep (i);
                self.renderStep (i);
            });

            toggle.addEventListener ("click", function() {
                self.steps[i].active = !self.steps[i].active;
                self.sendStep (i);
                self.renderStep (i);
            });
        }
    }

    sendStep (i)
    {
        let note = this.steps[i].note & 255;
        let active = this.steps[i].active ? 1 : 0;
        let packed = ((i & 255) << 16) | ((note & 255) << 8) | active;
        this.patchConnection.sendEventOrValue ("setStepPacked", packed);
    }

    renderAllSteps()
    {
        for (let i = 0; i < 32; ++i)
            this.renderStep (i);
    }

    renderStep (i)
    {
        let len = parseInt (this.shadowRoot.getElementById ("patternLength").value, 10);
        let el = this.grid.children[i];
        if (!el) return;

        let slider = el.querySelector ("input");
        let label = el.querySelector (".noteName");
        let button = el.querySelector ("button");
        slider.value = this.steps[i].note;
        label.textContent = this.noteName (this.steps[i].note);
        button.textContent = this.steps[i].active ? "ON" : "OFF";

        el.classList.toggle ("off", !this.steps[i].active || i >= len);
        el.classList.toggle ("playing", i === this.currentStep && this.isPlaying);
    }

    noteName (midi)
    {
        let names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        let pc = ((midi % 12) + 12) % 12;
        let oct = Math.floor (midi / 12) - 2;
        return names[pc] + oct;
    }

    drawScope()
    {
        let ctx = this.ctx;
        let w = this.scope.width;
        let h = this.scope.height;
        let now = performance.now();
        ctx.clearRect (0, 0, w, h);
        ctx.fillStyle = "#020504";
        ctx.fillRect (0, 0, w, h);

        ctx.strokeStyle = "rgba(0,255,170,0.16)";
        ctx.lineWidth = 1;
        for (let y = 40; y < h; y += 40)
        {
            ctx.beginPath();
            ctx.moveTo (0, y);
            ctx.lineTo (w, y);
            ctx.stroke();
        }

        let len = parseInt (this.shadowRoot.getElementById ("patternLength") ? this.shadowRoot.getElementById ("patternLength").value : "16", 10);
        for (let i = 0; i < len; ++i)
        {
            let x = 12 + i * ((w - 24) / Math.max (1, len - 1));
            let norm = (this.steps[i].note - 36) / 48;
            let y = h - 20 - norm * (h - 42);
            ctx.fillStyle = this.steps[i].active ? "rgba(0,255,170,0.85)" : "rgba(255,255,255,0.12)";
            ctx.beginPath();
            ctx.arc (x, y, i === this.currentStep && this.isPlaying ? 8 : 5, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.lastMidi && now - this.lastMidi.time < 200)
        {
            ctx.fillStyle = "rgba(0,255,170,0.12)";
            ctx.fillRect (0, 0, w, h);
        }

        let self = this;
        requestAnimationFrame (function() { self.drawScope(); });
    }

    exportMidiFile()
    {
        let bytes = this.makeMidiFileBytes();
        let blob = new Blob ([new Uint8Array (bytes)], { type: "audio/midi" });
        let url = URL.createObjectURL (blob);
        let a = document.createElement ("a");
        a.href = url;
        a.download = "LogicalChaosMelody.mid";
        a.click();
        setTimeout (function() { URL.revokeObjectURL (url); }, 1000);
        this.status.textContent = "MIDI file exported.";
    }

    makeMidiFileBytes()
    {
        let len = parseInt (this.shadowRoot.getElementById ("patternLength").value, 10);
        let ppq = 480;
        let stepTicks = 120;
        let gateTicks = Math.max (10, Math.floor (stepTicks * parseFloat (this.shadowRoot.getElementById ("gate").value) / 100));
        let track = [];

        // tempo meta event, 120 BPM default-ish based on current slider
        let bpm = parseFloat (this.shadowRoot.getElementById ("tempo").value);
        let mpqn = Math.floor (60000000 / Math.max (1, bpm));
        this.pushVar (track, 0); track.push (0xff, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255);

        for (let i = 0; i < len; ++i)
        {
            if (this.steps[i].active)
            {
                this.pushVar (track, i === 0 ? 0 : stepTicks - gateTicks);
                track.push (0x90, this.steps[i].note & 127, 100);
                this.pushVar (track, gateTicks);
                track.push (0x80, this.steps[i].note & 127, 0);
            }
            else
            {
                this.pushVar (track, stepTicks);
            }
        }

        this.pushVar (track, 0); track.push (0xff, 0x2f, 0x00);

        let out = [];
        this.pushText (out, "MThd"); this.push32 (out, 6); this.push16 (out, 0); this.push16 (out, 1); this.push16 (out, ppq);
        this.pushText (out, "MTrk"); this.push32 (out, track.length);
        return out.concat (track);
    }

    pushText (a, s) { for (let i = 0; i < s.length; ++i) a.push (s.charCodeAt (i)); }
    push16 (a, v) { a.push ((v >> 8) & 255, v & 255); }
    push32 (a, v) { a.push ((v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255); }
    pushVar (a, v)
    {
        let buffer = v & 127;
        while ((v >>= 7)) { buffer <<= 8; buffer |= ((v & 127) | 128); }
        for (;;) { a.push (buffer & 255); if (buffer & 128) buffer >>= 8; else break; }
    }
}

export default function createPatchView (patchConnectionOrContext)
{
    return new LogicalChaosMelodyMachine (patchConnectionOrContext);
}
