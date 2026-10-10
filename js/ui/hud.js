/* ------------------------------------------------------------------ *
 *  The battle HUD, in the DOM over the canvas.
 *
 *  Top: the mission, the Gloom Tide (12 notches, its thresholds
 *  marked) and the squad's Lumen. Left: the squad. Bottom: the
 *  selected trooper and their abilities (1-9). Right: the to-hit sum
 *  for whatever you're aiming at, laid out line by line the way XCOM
 *  does it, and the log. Everything is redrawn from the battle and the
 *  view's own display state; nothing here keeps rules of its own.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS;
const H = GS.HUD = {};

/* the icon set: tiny inline SVG paths, 24x24, stroked */
const ICONS = {
  cross:  '<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  eye:    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  watch:  '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M12 9v3l2 2"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  bolt:   '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  gem:    '<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20M12 22L8 9l4-6 4 6z"/>',
  hand:   '<path d="M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3 14a2 2 0 0 1 3.4-2l.6 1"/>',
  blade:  '<path d="M20 4L9 15l-2-2L18 2z"/><path d="M7 13l-3 3 4 4 3-3M5 19l-2 2"/>',
  burst:  '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>',
  heart:  '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>',
  skull:  '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-3M14 20v-3"/>',
  root:   '<path d="M12 2v10M12 12c-3 2-5 5-6 10M12 12c3 2 5 5 6 10M12 15v7"/>',
  star:   '<path d="M12 2l3 7 7 .6-5.4 4.6 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.6 9 9z"/>',
  music:  '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  flag:   '<path d="M4 22V3M4 4h13l-3 4 3 4H4"/>',
  sound:  '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  mute:   '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9l6 6M22 9l-6 6"/>',
  fast:   '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/>',
  rotl:   '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v6h6"/>',
  rotr:   '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/>'
};
H.icon = (k, cls)=> '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[k] || ICONS.cross) + "</svg>";

const esc = s=> String(s).replace(/[&<>"]/g, c=> ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);
H.esc = esc;

H.mount = function(view, opts){
  H.v = view; H.b = view.b; H.o = opts || {};
  const el = H.el = document.getElementById("hud");
  el.innerHTML = [
    // three columns: the mission and the squad on the left, the meters centred, the buttons, target and log on the right
    '<div class="h-left">',
    '  <div class="h-mission plate"><b id="hMission"></b><span id="hObj"></span><span id="hRound"></span></div>',
    '  <div class="h-squad" id="hSquad"></div>',
    '</div>',
    '<div class="h-meters plate"><div class="h-tide"><label>GLOOM TIDE</label><div id="hTide"></div><span id="hTideName"></span></div>',
    '  <div class="h-lumen"><label>LUMEN</label><div id="hLumen"></div></div><div id="hConceal"></div></div>',
    '<div class="h-right">',
    '  <div class="h-sys"><div id="hChorus"></div>',
    '    <button class="hb" id="hRotL" title="Turn camera (Q)">' + H.icon("rotl") + '</button><button class="hb" id="hRotR" title="Turn camera (E)">' + H.icon("rotr") + '</button>',
    '    <button class="hb" id="hFast" title="Fast enemy turns">' + H.icon("fast") + '</button><button class="hb" id="hMute" title="Sound (M)"></button>',
    '    <button class="hb" id="hRetreat" title="Retreat">' + H.icon("flag") + '</button></div>',
    '  <div class="h-target plate" id="hTarget"></div><div class="h-log plate" id="hLog"></div>',
    '</div>',
    '<div class="h-bottom"><div class="h-unit plate" id="hUnit"></div><div class="h-abil" id="hAbil"></div><div class="h-desc" id="hDesc"></div></div>',
    '<button class="h-end" id="hEnd">END TURN <small>↵</small></button>'
  ].join("");
  el.hidden = false;
  if(matchMedia("(max-width:560px)").matches) el.querySelector(".h-left").insertBefore(el.querySelector(".h-meters"), el.querySelector(".h-squad"));
  H.$ = id=> document.getElementById(id);
  H.$("hEnd").onclick = ()=> view.endTurn();
  H.$("hRotL").onclick = ()=> GS.Stage.turn(-1);
  H.$("hRotR").onclick = ()=> GS.Stage.turn(1);
  H.$("hFast").onclick = ()=>{ view.speed = view.speed > 1 ? 1 : 2.2; H.render(); };
  H.$("hMute").onclick = ()=>{ GS.Audio.toggleMute(); H.render(); };
  H.$("hRetreat").onclick = ()=>{ if(view.busy()) return; GS.UI.confirm("Retreat from the mission?", "Troopers who are down are left behind, and the Gloom spreads in this region.", "Retreat", ()=>{ view.b.retreat(); view.pump(); }); };
  H.log = [];
  H.render();
};
H.unmount = function(){ if(H.el){ H.el.hidden = true; H.el.innerHTML = ""; } H.v = null; const b = document.getElementById("banner"); if(b) b.className = "banner"; };

H.addLog = function(text, cls){
  H.log.push({ text, cls }); if(H.log.length > 60) H.log.shift();
  const L = H.$ && H.$("hLog"); if(!L) return;
  L.innerHTML = H.log.slice(-7).map(l=> '<p class="' + (l.cls || "") + '">' + esc(l.text) + "</p>").join("");
};

let queued = false;
H.render = function(){ if(queued) return; queued = true; requestAnimationFrame(()=>{ queued = false; draw(); }); };

function draw(){
  const v = H.v; if(!v) return;
  const b = v.b, d = v.disp, busy = v.busy(), myTurn = b.team === "squad" && !busy;
  // mission
  const MT = GS.MISSION_TYPES[b.mission.type];
  H.$("hMission").textContent = (MT.name + (b.mission.where ? " · " + b.mission.where : "")).toUpperCase();
  H.$("hObj").textContent = MT.desc;
  H.$("hRound").innerHTML = (d.team === "squad" ? '<i class="sq">SQUAD</i>' : '<i class="gl">GLOOM</i>') + " ROUND " + d.round;
  // the tide
  const steps = GS.TIDE.steps, T = GS.TIDE.max;
  let tide = "";
  for(let i=1;i<=T;i++){ const st = steps.find(s=> s.at === i); tide += '<i class="' + (i <= d.tide ? "on " : "") + (st ? "mark" : "") + '"' + (st ? ' title="' + esc(st.name + ": " + st.desc) + '"' : "") + "></i>"; }
  H.$("hTide").innerHTML = tide;
  const cur = steps.filter(s=> s.at <= d.tide).pop(), nxt = steps.find(s=> s.at > d.tide);
  H.$("hTideName").textContent = (cur ? cur.name : "Calm") + (nxt ? " · " + nxt.name + " at " + nxt.at : "");
  let lum = ""; for(let i=0;i<b.lumenMax;i++) lum += '<i class="' + (i < d.lumen ? "on" : "") + '"></i>';
  H.$("hLumen").innerHTML = lum + "<b>" + d.lumen + "</b>";
  H.$("hConceal").innerHTML = d.concealed ? '<span class="conceal">' + H.icon("eye") + " CONCEALED</span>" : "";
  // the chorus
  H.$("hChorus").innerHTML = b.chorusList().map(c=> '<button class="hb chorus' + (c.used ? " used" : "") + '" data-ch="' + c.id + '" title="' + esc(c.def.name + ": " + c.def.desc + " Once a mission.") + '"' + (c.used || !myTurn ? " disabled" : "") + ">" + H.icon("music") + "</button>").join("");
  H.$("hChorus").querySelectorAll("[data-ch]").forEach(x=> x.onclick = ()=> v.sing(x.dataset.ch));
  H.$("hMute").innerHTML = H.icon(GS.Audio.muted ? "mute" : "sound");
  H.$("hFast").classList.toggle("on", v.speed > 1);
  // squad
  H.$("hSquad").innerHTML = b.units.filter(u=> u.team === "squad").map(u=>{
    const a = v.actors[u.id], hp = a ? a.hp : u.hp;
    let ap = ""; for(let i=0;i<Math.max(u.maxAp, u.ap);i++) ap += '<i class="' + (i < u.ap && myTurn ? "on" : "") + '"></i>';
    return '<div class="sq-card' + (u.id === v.sel ? " sel" : "") + (u.dead ? " dead" : u.downed ? " down" : "") + (u.ap <= 0 || u.dead || u.downed ? " spent" : "") + '" data-id="' + u.id + '">' +
      '<img src="' + GS.Models.portrait(u.cls + (u.armorTier || 0), u) + '" alt="">' +
      '<div><b>' + esc(u.name) + '</b><small>' + GS.CLASSES[u.cls].name + " · " + GS.RANKS[u.rank].name + "</small>" +
      '<div class="hpb"><span style="width:' + Math.round(100*Math.max(0, hp)/u.maxHp) + '%"></span><em>' + Math.max(0, hp) + "/" + u.maxHp + "</em></div>" +
      '<div class="appips">' + (u.dead ? "FALLEN" : u.downed ? (u.stable ? "STABLE" : "BLEEDING " + u.bleed) : ap) + "</div></div></div>";
  }).join("");
  H.$("hSquad").querySelectorAll("[data-id]").forEach(x=> x.onclick = ()=>{ const u = b.unit(x.dataset.id); if(u && b.able(u)) v.select(u); });
  // the selected trooper
  const u = v.selUnit();
  if(u){
    const W = u.weapon;
    const st = Object.keys(u.statuses).map(s=> '<span class="tag ' + (GS.STATUS[s].bad ? "bad" : "good") + '" title="' + esc(GS.STATUS[s].desc) + '">' + GS.STATUS[s].name + "</span>").join("");
    let ap = ""; for(let i=0;i<Math.max(u.maxAp, u.ap);i++) ap += '<i class="' + (i < u.ap ? "on" : "") + '"></i>';
    H.$("hUnit").innerHTML = '<img src="' + GS.Models.portrait(u.cls + (u.armorTier || 0), u) + '" alt="">' +
      '<div class="u-main"><b>' + esc(u.name) + '</b><small>' + GS.RANKS[u.rank].name + " " + GS.CLASSES[u.cls].name + " · " + GS.CLASSES[u.cls].role + "</small>" +
      '<div class="u-stats"><span>HP <b>' + u.hp + "/" + u.maxHp + "</b></span><span>ARM <b>" + b.armorOf(u) + "</b></span><span>AIM <b>" + b.aimOf(u) + "</b></span><span>DEF <b>" + b.defOf(u) + "</b></span><span>MOB <b>" + u.mob + "</b></span></div>" +
      '<div class="u-ap"><label>AP</label>' + ap + "</div>" +
      '<div class="u-wpn">' + esc(W.name) + " · " + W.dmg[0] + "-" + W.dmg[1] + " dmg" + (W.clip ? ' · <span class="' + (u.ammo === 0 ? "bad" : "") + '">' + "▮".repeat(u.ammo) + "▯".repeat(Math.max(0, W.clip - u.ammo)) + "</span>" : "") + "</div>" +
      (st ? '<div class="u-st">' + st + "</div>" : "") + "</div>";
    const acts = b.actionsFor(u);
    let k = 0;
    H.actions = [];
    H.$("hAbil").innerHTML = acts.map(a=>{
      if(a.passive) return '<div class="ab passive" title="' + esc(a.name + " (passive): " + a.def.desc) + '">' + H.icon(a.icon || "star") + "</div>";
      const key = ++k; H.actions.push(a.id);
      const on = a.enabled && myTurn, sel = v.mode && v.mode.id === a.id;
      const cost = (typeof a.ap === "number" && a.ap ? a.ap + "AP" : "") + (a.lumen ? " " + a.lumen + "✦" : "");
      const ch = a.id.startsWith("item:") ? u.charges[a.id] : a.def.charges ? u.charges[a.id] : null;
      return '<button class="ab' + (on ? "" : " off") + (sel ? " sel" : "") + '" data-a="' + a.id + '" data-tip="' + esc(a.name + (a.reason ? " — " + a.reason : "") + "|" + a.def.desc + (u.cooldowns[a.id] ? " (ready in " + u.cooldowns[a.id] + ")" : "")) + '">' +
        H.icon(a.icon || "star") + '<span class="k">' + key + "</span>" + (cost ? '<span class="c">' + cost + "</span>" : "") + (ch !== null && ch !== undefined ? '<span class="n">' + ch + "</span>" : "") + (u.cooldowns[a.id] ? '<span class="cd">' + u.cooldowns[a.id] + "</span>" : "") + "</button>";
    }).join("");
    H.$("hAbil").querySelectorAll("[data-a]").forEach(x=>{
      x.onclick = ()=>{ GS.Audio.start(); v.setMode(x.dataset.a); };
      x.onmouseenter = ()=> showDesc(x.dataset.tip);
      x.onmouseleave = ()=> showDesc(v.mode ? tipFor(v.mode) : "");
    });
    if(v.mode) showDesc(tipFor(v.mode)); else if(!H.$("hAbil").matches(":hover")) showDesc("");
  } else { H.$("hUnit").innerHTML = ""; H.$("hAbil").innerHTML = ""; }
  // the target panel
  H.$("hTarget").innerHTML = targetPanel(v, u);
  H.$("hTarget").style.display = H.$("hTarget").innerHTML ? "" : "none";
  // end turn
  const left = b.squad().some(x=> b.able(x) && x.ap > 0);
  const E = H.$("hEnd"); E.disabled = !myTurn; E.classList.toggle("ready", myTurn && !left);
  H.el.classList.toggle("busy", busy);
}
function tipFor(m){ return m.D.name + "|" + m.D.desc + (m.D.target === "tile" ? " Click a tile." : m.D.target === "self" ? "" : " Click a target. Esc cancels."); }
function showDesc(tip){
  const el = H.$("hDesc"); if(!el) return;
  if(!tip){ el.innerHTML = ""; el.style.display = "none"; return; }
  const [a, b] = tip.split("|"); el.innerHTML = "<b>" + esc(a) + "</b> " + esc(b || ""); el.style.display = "";
}
function targetPanel(v, u){
  if(!u) return "";
  const P = v.preview, hi = v.hoverInfo;
  if(P && P.info){
    const i = P.info, t = P.t;
    return '<div class="tg-head"><img src="' + GS.Models.portrait(t.type + (t.armorTier || 0), t) + '" alt=""><div><b>' + esc(t.name) + "</b><small>" + t.hp + "/" + t.maxHp + " HP" + (t.armor ? " · " + t.armor + " armour" : "") +
      (i.exposed && !t.structure ? ' · <span class="bad">' + (i.flanked ? "FLANKED" : "EXPOSED") + "</span>" : "") + '</small></div></div>' +
      '<div class="tg-big"><div><label>HIT</label><b>' + i.chance + '%</b></div><div><label>CRIT</label><b>' + i.crit + '%</b></div><div><label>DMG</label><b>' + i.dmg[0] + "-" + i.dmg[1] + "</b></div></div>" +
      '<div class="tg-rows">' + i.rows.map(r=> '<p><span>' + r[0] + '</span><b class="' + (r[1] >= 0 ? "pos" : "neg") + '">' + (r[1] > 0 && r[0] !== "Aim" ? "+" : "") + r[1] + "</b></p>").join("") +
      (i.armor ? '<p><span>Armour</span><b class="neg">-' + i.armor + " dmg</b></p>" : "") + (i.dmgType === "glow" ? '<p><span>Light</span><b class="pos">ignores armour</b></p>' : "") + "</div>" +
      '<div class="tg-hint">' + (GS.UI.touch ? "Tap again to fire" : "Click to fire") + "</div>";
  }
  if(P && P.t && !P.info){
    const t = P.t;
    return '<div class="tg-head"><div><b>' + esc(v.mode ? v.mode.D.name : "") + "</b><small>on " + esc(t.name || "the node") + "</small></div></div><div class=\"tg-hint\">" + esc(v.mode ? v.mode.D.desc : "") + "</div>";
  }
  if(hi && hi.area){
    if(hi.bad) return '<div class="tg-head"><div><b>Out of reach</b><small>' + esc(v.b.tileOK(u, v.mode.id, v.hoverAt.x, v.hoverAt.y) || "") + "</small></div></div>";
    const foes = hi.hits.filter(t=> t.team !== u.team), friends = hi.hits.filter(t=> t.team === u.team);
    const dmg = (v.mode.D.effects || []).find(e=> e.t === "damage");
    return '<div class="tg-head"><div><b>' + esc(v.mode.D.name) + "</b><small>" + (dmg ? dmg.dmg[0] + "-" + dmg.dmg[1] + " damage, no roll" : "no roll") + "</small></div></div>" +
      '<div class="tg-rows"><p><span>Gloom caught</span><b class="pos">' + foes.length + "</b></p>" + (friends.length ? '<p><span>Wardens caught</span><b class="neg">' + friends.length + "</b></p>" : "") + "</div>";
  }
  if(hi && hi.move){
    const exp = v.chips.filter(c=> c.el.classList.contains("flank")).length, los = v.chips.length;
    const sides = GS.Grid.coverSides(v.b.map, hi.x, hi.y), best = sides.reduce((m, s)=> Math.max(m, s.cover), 0);
    return '<div class="tg-head"><div><b>Move · ' + hi.ap + " AP</b><small>" + (u.ap - hi.ap) + " AP left after" + "</small></div></div>" +
      '<div class="tg-rows"><p><span>Cover here</span><b class="' + (best ? "pos" : "neg") + '">' + (best === 2 ? "Full" : best === 1 ? "Half" : "None") + "</b></p>" +
      '<p><span>Gloom that can see it</span><b>' + los + "</b></p>" + (exp ? '<p><span>Would flank you</span><b class="neg">' + exp + "</b></p>" : "") +
      (hi.hazard ? '<p><span>Rot</span><b class="neg">spores you</b></p>' : "") + "</div>";
  }
  return "";
}

/* ---- banners and toasts ---- */
H.banner = function(title, sub, kind, stay){
  const el = document.getElementById("banner");
  el.className = "banner on " + (kind || "");
  el.innerHTML = "<b>" + esc(title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "");
  clearTimeout(H._bt);
  if(!stay) H._bt = setTimeout(()=> el.className = "banner " + (kind || ""), 1500);
};
H.toast = function(text){
  const el = document.getElementById("toast"); el.textContent = text; el.className = "toast on";
  clearTimeout(H._tt); H._tt = setTimeout(()=> el.className = "toast", 1600);
};

/* ---- keys during battle ---- */
H.key = function(e){
  const v = H.v; if(!v) return false;
  const k = e.key;
  // read the live list, not the last drawn one: a key pressed right after switching wardens must hit the new warden's ability
  if(k >= "1" && k <= "9"){ const u = v.selUnit(); const a = u ? v.b.actionsFor(u).filter(x=> !x.passive)[+k - 1] : null; if(a){ v.setMode(a.id); return true; } }
  if(k === "Tab"){ v.nextUnit(e.shiftKey ? -1 : 1); return true; }
  if(k === "Escape"){ if(v.mode){ v.cancel(); return true; } return false; }
  if(k === "Enter"){ v.endTurn(); return true; }
  if(k === "f" || k === "F"){ const u = v.selUnit(); if(u){ const p = v.actors[u.id].R.root.position; GS.Stage.focus(p.x, p.z); } return true; }
  return false;
};

})();
