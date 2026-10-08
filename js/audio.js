/* ------------------------------------------------------------------ *
 *  Audio, all synthesised (as in Pine Hollow): two buses, music and
 *  effects, into one compressor so a mortar over the music never clips.
 *
 *  The music is a slow loop in D minor, i - VI - III - VII, sequenced
 *  ahead of the clock. The menus get the full tune, battle gets the
 *  pulse underneath, and the Gloom's turn drops it a fifth and darker.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS;
const A = GS.Audio = { ctx:null, muted:false, mode:"menu", step:0, next:0 };

A.start = function(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(A.ctx){ if(A.ctx.state === "suspended") A.ctx.resume(); return; }
  if(!AC) return;
  try{ A.muted = localStorage.getItem("gloomshooter.muted") === "1"; }catch(e){}
  const c = A.ctx = new AC();
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(c.destination);
  A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : 0.8; A.master.connect(comp);
  A.sfx = c.createGain(); A.sfx.connect(A.master);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(A.master);
  A.music = c.createGain(); A.music.gain.value = 0.55; A.music.connect(lp);
  const len = c.sampleRate*2; A.noise = c.createBuffer(1, len, c.sampleRate);
  const d = A.noise.getChannelData(0); for(let i=0;i<len;i++) d[i] = Math.random()*2 - 1;
  // a short synthetic room
  const n = Math.round(c.sampleRate*2.2), ir = c.createBuffer(2, n, c.sampleRate);
  for(let ch=0; ch<2; ch++){ const b = ir.getChannelData(ch); for(let i=0;i<n;i++) b[i] = (Math.random()*2 - 1)*Math.pow(1 - i/n, 3); }
  A.verb = c.createConvolver(); A.verb.buffer = ir; const vb = c.createGain(); vb.gain.value = 0.35; A.verb.connect(vb); vb.connect(A.master);
  A.next = c.currentTime + 0.1;
  setInterval(A.tick, 50);
};
A.toggleMute = function(){
  A.muted = !A.muted;
  try{ localStorage.setItem("gloomshooter.muted", A.muted ? "1" : "0"); }catch(e){}
  if(A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.8, A.ctx.currentTime, 0.05);
  return A.muted;
};

function tone(f, dur, type, vol, at, bus, slide, verb){
  const c = A.ctx; if(!c) return;
  const t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
  o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || A.sfx); if(verb) g.connect(A.verb);
  o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, ftype, freq, vol, q, at, bus, sweep, verb){
  const c = A.ctx; if(!c) return;
  const t = c.currentTime + (at || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.noise; s.playbackRate.value = 0.6 + Math.random()*0.8;
  f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  if(sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus || A.sfx); if(verb) g.connect(A.verb);
  s.start(t, Math.random()*1.5); s.stop(t + dur + 0.05);
}
const mtof = m=> 440*Math.pow(2, (m - 69)/12);

/* ---- effects ---- */
A.play = function(name, o){
  if(!A.ctx || A.muted) return;
  o = o || {};
  switch(name){
    case "click":  tone(880, 0.05, "square", 0.04); break;
    case "select": tone(660, 0.06, "triangle", 0.08); tone(990, 0.08, "triangle", 0.06, 0.05); break;
    case "error":  tone(180, 0.12, "square", 0.06); break;
    case "step":   burst(0.05, "lowpass", 700, 0.05, 1); break;
    case "pellets": burst(0.25, "lowpass", 2400, 0.5, 0.8, 0, 0, 300); tone(90, 0.18, "sine", 0.5, 0, 0, 40); break;
    case "needle": tone(2400, 0.12, "sawtooth", 0.08, 0, 0, 600); burst(0.06, "highpass", 4000, 0.3); break;
    case "glowbolt": tone(500, 0.3, "sine", 0.18, 0, 0, 1600, true); tone(750, 0.3, "triangle", 0.06, 0.02, 0, 2400); break;
    case "burst":  for(let i=0;i<3;i++){ burst(0.08, "bandpass", 1800, 0.35, 1, i*0.07); tone(110, 0.08, "sine", 0.3, i*0.07, 0, 60); } break;
    case "acid":   burst(0.35, "bandpass", 900, 0.3, 4, 0, 0, 300); tone(300, 0.2, "sine", 0.06, 0, 0, 120); break;
    case "hex":    tone(220, 0.4, "sawtooth", 0.08, 0, 0, 110, true); tone(233, 0.4, "sawtooth", 0.06, 0, 0, 116); break;
    case "slash":  burst(0.18, "bandpass", 3000, 0.4, 2, 0, 0, 900); break;
    case "claw":   burst(0.14, "bandpass", 1200, 0.35, 3, 0, 0, 400); tone(140, 0.1, "square", 0.05); break;
    case "hit":    tone(150, 0.12, "sine", 0.4, 0, 0, 60); burst(0.08, "lowpass", 900, 0.25); break;
    case "squish": burst(0.25, "lowpass", 600, 0.4, 3, 0, 0, 120); tone(120, 0.18, "sine", 0.2, 0, 0, 50); break;
    case "crit":   tone(1320, 0.2, "triangle", 0.12, 0.02, 0, 0, true); tone(1760, 0.25, "triangle", 0.08, 0.08, 0, 0, true); break;
    case "miss":   burst(0.2, "highpass", 2500, 0.08, 1, 0, 0, 6000); break;
    case "blast":  burst(0.9, "lowpass", 900, 0.9, 0.7, 0, 0, 80, true); tone(60, 0.6, "sine", 0.7, 0, 0, 30); break;
    case "launch": tone(160, 0.3, "sine", 0.3, 0, 0, 90); burst(0.15, "lowpass", 600, 0.3); break;
    case "cast":   [0, 4, 7, 12].forEach((s, i)=> tone(mtof(74 + s), 0.5, "sine", 0.08, i*0.05, 0, 0, true)); break;
    case "heal":   [0, 4, 7, 11, 14].forEach((s, i)=> tone(mtof(79 + s), 0.5, "triangle", 0.06, i*0.06, 0, 0, true)); break;
    case "lumen":  tone(mtof(86), 0.3, "sine", 0.08, 0, 0, 0, true); tone(mtof(93), 0.4, "sine", 0.06, 0.08, 0, 0, true); break;
    case "overwatch": tone(mtof(69), 0.12, "square", 0.05); tone(mtof(76), 0.18, "square", 0.05, 0.1); break;
    case "reload": burst(0.06, "bandpass", 2500, 0.2, 4); burst(0.06, "bandpass", 1800, 0.2, 4, 0.12); break;
    case "reveal": tone(mtof(50), 0.8, "sawtooth", 0.1, 0, 0, 0, true); tone(mtof(56), 0.8, "sawtooth", 0.08, 0, 0, 0, true); break;
    case "tide":   tone(mtof(38), 1.6, "sine", 0.4, 0, 0, 0, true); tone(mtof(44), 1.6, "triangle", 0.1, 0.05, 0, 0, true); break;
    case "death":  tone(mtof(62), 0.8, "triangle", 0.12, 0, 0, 0, true); tone(mtof(65), 0.8, "triangle", 0.1, 0.15, 0, 0, true); tone(mtof(57), 1.2, "triangle", 0.12, 0.3, 0, 0, true); break;
    case "turn":   [62, 65, 69].forEach((m, i)=> tone(mtof(m), 0.7, "triangle", 0.07, i*0.04, 0, 0, true)); break;
    case "gloomturn": [50, 53, 56].forEach((m, i)=> tone(mtof(m), 0.9, "sawtooth", 0.04, i*0.05, 0, 0, true)); break;
    case "victory": [62, 66, 69, 74, 78, 81].forEach((m, i)=> tone(mtof(m), 0.6, "triangle", 0.09, i*0.11, 0, 0, true)); break;
    case "defeat": [62, 60, 57, 53].forEach((m, i)=> tone(mtof(m), 0.9, "triangle", 0.1, i*0.25, 0, 0, true)); break;
    case "chorus": [62, 69, 74, 77, 81].forEach((m, i)=> { tone(mtof(m), 1.6, "sine", 0.07, i*0.09, 0, 0, true); tone(mtof(m) * 1.003, 1.6, "triangle", 0.03, i*0.09); }); break;
  }
};

/* ---- the loop ---- */
const SONG = {
  bpm:76,
  chords:[[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],   // Dm Bb F C
  lead:[
    [74, -1, -1, 72, -1, -1, 69, -1, -1, -1, 72, -1, 74, -1, -1, -1],
    [70, -1, -1, 69, -1, -1, 65, -1, -1, -1, -1, -1, 62, -1, -1, -1],
    [69, -1, -1, 72, -1, -1, 77, -1, 76, -1, 72, -1, 69, -1, -1, -1],
    [67, -1, -1, 69, -1, 72, -1, -1, 76, -1, 74, -1, -1, -1, -1, -1]
  ]
};
A.setMode = m=>{ A.mode = m; };
A.tick = function(){
  const c = A.ctx; if(!c || c.state !== "running") return;
  const spb = 60/SONG.bpm/4;
  while(A.next < c.currentTime + 0.2){
    const at = A.next - c.currentTime, s = A.step % 16, bar = Math.floor(A.step/16) % 4;
    const dark = A.mode === "gloom", ch = SONG.chords[bar].map(n=> n - (dark ? 7 : 0)), B = A.music;
    // the pad: each bar, a slow swell
    if(s === 0) ch.forEach((n, i)=>{ tone(mtof(n), spb*16*0.95, "triangle", 0.035, at + i*0.02, B); tone(mtof(n)*1.004, spb*16*0.95, "sine", 0.03, at, B); });
    // a heartbeat pulse in battle
    if(A.mode !== "menu" && (s === 0 || s === 3)) tone(dark ? 46 : 55, 0.22, "sine", dark ? 0.3 : 0.2, at, B, 35);
    // a glassy arpeggio
    if(s % 2 === 0 && (A.mode === "menu" || s % 4 === 0)) tone(mtof(ch[(s/2) % 3] + 24), 0.5, "sine", 0.018, at, B);
    // the tune, in the menus
    const n = SONG.lead[bar][s];
    if(n > 0 && A.mode === "menu" && Math.floor(A.step/64) % 2 === 1) tone(mtof(n), spb*5, "triangle", 0.045, at, B);
    A.next += spb; A.step++;
  }
};

})();
