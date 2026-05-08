#import "LCViewController.h"
#import "LCAudioEngine.h"

#import <WebKit/WebKit.h>

#include "LogicalChaosEngine.h"

#include <sstream>
#include <string>

using logicalchaos::LogicalChaosEngine;

@interface LCViewController () <WKScriptMessageHandler>
@property (nonatomic, strong) WKWebView* webView;
@property (nonatomic, strong) LCAudioEngine* audioEngine;
@property (nonatomic, strong) NSTimer* pollTimer;
@end

@implementation LCViewController
{
    LogicalChaosEngine engine_;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    self.view.backgroundColor = [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0];

    engine_.resetToDefaults();
    self.audioEngine = [[LCAudioEngine alloc] initWithEngine:&engine_];

    WKWebViewConfiguration* config = [[WKWebViewConfiguration alloc] init];
    config.allowsInlineMediaPlayback = YES;
    [config.userContentController addScriptMessageHandler:self name:@"lc"];

    self.webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.opaque = NO;
    self.webView.backgroundColor = [UIColor clearColor];
    self.webView.scrollView.backgroundColor = [UIColor clearColor];
    self.webView.scrollView.bounces = YES;
    [self.view addSubview:self.webView];

    [NSLayoutConstraint activateConstraints:@[
        [self.webView.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor]
    ]];

    [self.webView loadHTMLString:[self htmlString] baseURL:nil];

    self.pollTimer = [NSTimer scheduledTimerWithTimeInterval:0.05
                                                      target:self
                                                    selector:@selector(pollEngineEvents)
                                                    userInfo:nil
                                                     repeats:YES];
}

- (void)dealloc
{
    [self.pollTimer invalidate];
    [self.audioEngine stop];
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"lc"];
}

- (void)userContentController:(WKUserContentController*)userContentController didReceiveScriptMessage:(WKScriptMessage*)message
{
    if (![message.name isEqualToString:@"lc"] || ![message.body isKindOfClass:[NSDictionary class]])
        return;

    NSDictionary* body = (NSDictionary*) message.body;
    NSString* type = body[@"type"];
    NSString* name = body[@"name"];
    NSNumber* value = body[@"value"];

    if ([type isEqualToString:@"param"] && name.length > 0)
    {
        const float v = value ? value.floatValue : 0.0f;
        engine_.setParameter(name.UTF8String, v);

        if ([name isEqualToString:@"tempo"])
            [self.audioEngine setTempo:v];
        else if ([name isEqualToString:@"masterVolume"])
            [self.audioEngine setMasterVolume:v];
        else if ([name isEqualToString:@"synthWave"])
            [self.audioEngine setSynthWave:(int) lroundf(v)];
        else if ([name isEqualToString:@"synthCutoff"])
            [self.audioEngine setSynthCutoff:v];
        else if ([name isEqualToString:@"synthRes"])
            [self.audioEngine setSynthResonance:v];
        else if ([name isEqualToString:@"synthDecay"])
            [self.audioEngine setSynthDecay:v];
        return;
    }

    if ([type isEqualToString:@"event"] && name.length > 0)
    {
        const double v = value ? value.doubleValue : 1.0;

        if ([name isEqualToString:@"play"])
        {
            NSError* error = nil;
            if (![self.audioEngine startAndReturnError:&error])
                [self sendStatus:[NSString stringWithFormat:@"Audio error: %@", error.localizedDescription]];
        }
        else if ([name isEqualToString:@"stop"])
        {
            [self.audioEngine stop];
            [self.audioEngine resetPlayback];
        }

        engine_.triggerEvent(name.UTF8String, v);
        [self pollEngineEvents];
        return;
    }

    if ([type isEqualToString:@"step"] && value)
    {
        engine_.setStepPacked(value.intValue);
        [self pollEngineEvents];
        return;
    }
}

- (void)pollEngineEvents
{
    std::string events = engine_.popQueuedUiEvents();
    if (events.empty() || self.webView == nil)
        return;

    NSMutableArray<NSString*>* parts = [NSMutableArray array];
    std::stringstream ss(events);
    std::string line;
    while (std::getline(ss, line))
    {
        if (!line.empty())
            [parts addObject:[NSString stringWithUTF8String:line.c_str()]];
    }

    NSString* joined = [parts componentsJoinedByString:@","];
    NSString* js = [NSString stringWithFormat:@"window.logicalChaosReceiveEvents && window.logicalChaosReceiveEvents([%@]);", joined];
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)sendStatus:(NSString*)status
{
    NSData* data = [status dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return;

    NSString* json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:@[status] options:0 error:nil]
                                           encoding:NSUTF8StringEncoding];
    NSString* js = [NSString stringWithFormat:@"window.logicalChaosStatus && window.logicalChaosStatus(%@);", json ?: @"[\"Unknown status\"]"];
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (NSString*)htmlString
{
    return @R"HTML(
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
*{box-sizing:border-box} html,body{margin:0;min-height:100%;background:#021111;color:#d9fff7;font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif} body{overflow:auto}.app{padding:18px 14px 34px}.header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.title{font-size:28px;font-weight:900;letter-spacing:.13em;color:#00ffcc;text-shadow:0 0 18px rgba(0,255,204,.32)}.subtitle{margin-top:3px;color:rgba(217,255,247,.55);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.badge{border:1px solid rgba(255,0,255,.45);border-radius:999px;padding:6px 10px;color:#ff7cff;background:rgba(255,0,255,.08);font-weight:900;font-size:11px}.panel{border:1px solid rgba(0,255,204,.16);background:rgba(5,16,16,.88);border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 16px 40px rgba(0,0,0,.18)}.transport,.row{display:flex;flex-wrap:wrap;gap:8px}button{border:0;border-radius:11px;padding:11px 13px;font-weight:900;letter-spacing:.06em;color:#021111;background:#00ffcc}.secondary{color:#d9fff7;background:rgba(255,255,255,.07);border:1px solid rgba(0,255,204,.22)}.danger{color:#fff0fb;background:rgba(255,0,96,.22);border:1px solid rgba(255,0,96,.38)}.controls{display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:10px;margin-top:12px}label{display:grid;gap:5px;color:rgba(217,255,247,.62);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}select,input{width:100%;min-height:38px;border-radius:10px;border:1px solid rgba(0,255,204,.22);background:rgba(0,0,0,.25);color:#d9fff7;padding:0 9px;outline:none}.grid{display:grid;grid-template-columns:repeat(8,minmax(30px,1fr));gap:6px}.step{position:relative;height:78px;padding:0;border:1px solid rgba(0,255,204,.14);background:rgba(255,255,255,.04);overflow:hidden}.step.active{background:rgba(0,255,204,.08);border-color:rgba(0,255,204,.32)}.step.selected{outline:2px solid rgba(0,255,204,.72);box-shadow:0 0 14px rgba(0,255,204,.2)}.step.playing{background:rgba(255,0,255,.18);border-color:rgba(255,0,255,.72);box-shadow:0 0 18px rgba(255,0,255,.28)}.step-num{position:absolute;top:5px;left:6px;font-size:9px;color:rgba(217,255,247,.5)}.step-note{position:absolute;left:4px;right:4px;bottom:6px;text-align:center;font-size:11px;color:#d9fff7}.note-bar{position:absolute;left:18%;right:18%;height:3px;border-radius:99px;background:#00ffcc}.flags{position:absolute;top:5px;right:6px;display:flex;gap:3px}.flag{width:7px;height:7px;border-radius:50%;background:rgba(217,255,247,.35);opacity:.25}.flag.on.glide{opacity:1;background:#ff00ff}.flag.on.randomise{opacity:1;background:#ffee55}.editor{display:grid;grid-template-columns:1fr 1fr;gap:10px}.editor h3{grid-column:1/-1;color:#00ffcc;font-size:13px;letter-spacing:.08em}.status{font-size:12px;color:rgba(217,255,247,.68);line-height:1.4}@media(min-width:760px){.controls{grid-template-columns:repeat(4,minmax(120px,1fr))}.grid{grid-template-columns:repeat(16,minmax(30px,1fr))}.editor{grid-template-columns:repeat(4,1fr)}}
</style>
</head>
<body><div class="app">
<div class="header"><div><div class="title">LOGICAL CHAOS</div><div class="subtitle">Melody Machine · iOS WebView</div></div><div class="badge">iOS v1</div></div>
<div class="panel"><div class="transport"><button id="play">PLAY</button><button class="danger" id="stop">STOP</button><button class="secondary" id="generate">GENERATE</button><button class="secondary" id="mutate">MUTATE</button><button class="secondary" id="clear">CLEAR</button><button class="secondary" id="dump">REFRESH</button></div>
<div class="controls">
<label>Steps<select id="patternLength"><option>8</option><option selected>16</option><option>32</option><option>64</option></select></label>
<label>Time Sig<select id="timeSignature"><option value="4/4/16" selected>4/4 - 16 steps</option><option value="3/4/12">3/4 - 12 steps</option><option value="6/8/12">6/8 - 12 steps</option><option value="7/8/14">7/8 - 14 steps</option><option value="12/8/24">12/8 - 24 steps</option></select></label>
<label>Root<select id="rootNote"><option value="36">C2</option><option value="38">D2</option><option value="40">E2</option><option value="41">F2</option><option value="43">G2</option><option value="45">A2</option><option value="48" selected>C3</option><option value="50">D3</option><option value="52">E3</option><option value="55">G3</option><option value="60">C4</option></select></label>
<label>Style<select id="styleType"><option value="0">Auto</option><option value="1">Classical</option><option value="2">Pop</option><option value="3">Ambient</option><option value="4">Synthwave</option><option value="5">Techno</option><option value="6">House</option><option value="7">Hip Hop / Trap</option><option value="8">Cinematic</option><option value="9">Experimental</option></select></label>
<label>Scale<select id="scaleType"><option value="0">Major</option><option value="1">Natural Minor</option><option value="2">Harmonic Minor</option><option value="3">Dorian</option><option value="5">Lydian</option><option value="7">Minor Pentatonic</option><option value="9">Blues</option><option value="10">Chromatic</option></select></label>
<label>Complexity<select id="complexityType"><option value="0">Simple</option><option value="1" selected>Nice</option><option value="2">Advanced</option><option value="3">Wild</option></select></label>
<label>Tempo <span id="tempoVal">120 BPM</span><input id="tempo" type="range" min="50" max="220" value="120"></label>
<label>Master <span id="masterVal">80%</span><input id="masterVolume" type="range" min="0" max="100" value="80"></label>
<label>Chaos<input id="chaos" type="range" min="0" max="100" value="35"></label>
<label>Mutation<input id="mutation" type="range" min="0" max="100" value="20"></label>
<label>Density<input id="density" type="range" min="0" max="100" value="78"></label>
<label>Gate<input id="gate" type="range" min="5" max="100" value="72"></label>
<label>Wave<select id="synthWave"><option value="0">Saw</option><option value="1">Square</option><option value="2">Triangle</option><option value="3">Sine</option></select></label>
<label>Cutoff<input id="synthCutoff" type="range" min="50" max="5000" value="800"></label>
<label>Resonance<input id="synthRes" type="range" min="0.1" max="0.95" step="0.05" value="0.6"></label>
<label>Decay<input id="synthDecay" type="range" min="0.05" max="2" step="0.05" value="0.3"></label>
</div></div>
<div class="panel"><div id="grid" class="grid"></div></div>
<div class="panel"><div id="editor" class="editor"></div><div id="status" class="status">Ready.</div></div>
</div>
<script>
const state={steps:Array.from({length:64},()=>({note:48,active:0,glide:0,randomise:0})),length:16,selectedStep:0,playingStep:-1};
const post=o=>window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.lc.postMessage(o);
const param=(name,value)=>post({type:'param',name,value:Number(value)}); const event=(name,value=1)=>post({type:'event',name,value});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Math.floor(Number(v))));
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; const noteName=n=>names[n%12]+(Math.floor(n/12)-1); const notePct=n=>Math.max(18,Math.min(74,((n-36)/60)*74));
function pack(i){const s=state.steps[i];return (2<<28)|((i&255)<<20)|((s.note&127)<<13)|((s.active&1)<<2)|((s.glide&1)<<1)|(s.randomise&1)}
function sendStep(i){post({type:'step',value:pack(i)})}
function drawGrid(){const grid=document.getElementById('grid');grid.innerHTML='';for(let i=0;i<state.length;i++){const s=state.steps[i];const b=document.createElement('button');b.className=['step',s.active?'active':'',i===state.selectedStep?'selected':'',i===state.playingStep?'playing':''].join(' ');b.innerHTML=`<span class="step-num">${String(i+1).padStart(2,'0')}</span><span class="flags"><span class="flag glide ${s.glide?'on':''}"></span><span class="flag randomise ${s.randomise?'on':''}"></span></span><span class="note-bar" style="bottom:${notePct(s.note)}%;opacity:${s.active?1:.13}"></span><span class="step-note">${s.active?noteName(s.note):'OFF'}</span>`;b.onclick=()=>{state.selectedStep=i;drawGrid();drawEditor()};grid.appendChild(b)}}
function drawEditor(){const s=state.steps[state.selectedStep];document.getElementById('editor').innerHTML=`<h3>Step ${state.selectedStep+1}</h3><button id="edActive" class="${s.active?'':'secondary'}">${s.active?'ACTIVE':'OFF'}</button><button id="edGlide" class="secondary">GLIDE ${s.glide?'ON':'OFF'}</button><button id="edRandom" class="secondary">RANDOM ${s.randomise?'ON':'OFF'}</button><label>MIDI Note<input id="edNote" type="number" min="0" max="127" value="${s.note}"></label><label>Note Name<input readonly value="${noteName(s.note)}"></label>`;document.getElementById('edActive').onclick=()=>{s.active=s.active?0:1;sendStep(state.selectedStep);drawGrid();drawEditor()};document.getElementById('edGlide').onclick=()=>{s.glide=s.glide?0:1;sendStep(state.selectedStep);drawGrid();drawEditor()};document.getElementById('edRandom').onclick=()=>{s.randomise=s.randomise?0:1;sendStep(state.selectedStep);drawGrid();drawEditor()};document.getElementById('edNote').onchange=e=>{s.note=clamp(e.target.value,0,127);sendStep(state.selectedStep);drawGrid();drawEditor()}}
function setPlayingStep(i){state.playingStep=clamp(i,-1,63);drawGrid()}
window.logicalChaosReceiveEvents=(events)=>{events.forEach(value=>{const kind=(value>>28)&15, step=(value>>20)&255;if(kind===1){setPlayingStep(step>=64?-1:step)}else if(kind===2&&step<64){state.steps[step].note=(value>>13)&127;state.steps[step].active=(value>>2)&1;state.steps[step].glide=(value>>1)&1;state.steps[step].randomise=value&1;if(step===state.selectedStep)drawEditor();drawGrid()}})};
window.logicalChaosStatus=(arr)=>{document.getElementById('status').textContent=arr[0]||'Ready.'};
document.getElementById('play').onclick=()=>event('play'); document.getElementById('stop').onclick=()=>{event('stop');setPlayingStep(-1)}; document.getElementById('generate').onclick=()=>event('generate'); document.getElementById('mutate').onclick=()=>{event('mutate');setTimeout(()=>event('requestPatternDump'),80)}; document.getElementById('clear').onclick=()=>event('clearPattern'); document.getElementById('dump').onclick=()=>event('requestPatternDump');
document.getElementById('patternLength').onchange=e=>{state.length=clamp(e.target.value,8,64);param('patternLength',state.length);drawGrid();drawEditor()};
document.getElementById('timeSignature').onchange=e=>{const p=e.target.value.split('/');param('timeSigNumerator',p[0]);param('timeSigDenominator',p[1]);state.length=clamp(p[2],8,64);document.getElementById('patternLength').value=String(state.length);param('patternLength',state.length);drawGrid();drawEditor()};
['rootNote','styleType','scaleType','complexityType','chaos','mutation','density','gate','synthWave','synthCutoff','synthRes','synthDecay'].forEach(id=>document.getElementById(id).oninput=e=>param(id,e.target.value));
document.getElementById('tempo').oninput=e=>{document.getElementById('tempoVal').textContent=e.target.value+' BPM';param('tempo',e.target.value)}; document.getElementById('masterVolume').oninput=e=>{document.getElementById('masterVal').textContent=e.target.value+'%';param('masterVolume',Number(e.target.value)/100)};
drawGrid();drawEditor();setTimeout(()=>event('requestPatternDump'),150);
</script></body></html>
)HTML";
}

@end
