/* ------------------------------------------------------------------ *
 *  The battle, on screen.
 *
 *  The logic has already happened by the time anything moves here: the
 *  view drains the battle's event list and plays it back in order,
 *  hop by hop and shot by shot, keeping its own copy of where everyone
 *  stands and how hurt they look. Input is only taken while nothing is
 *  playing and it's the squad's turn.
 *
 *  It also owns the XCOM furniture: the blue/amber movement range, the
 *  path, the cover shields at the tile under the cursor, the eye and
 *  flank markers on enemies, hit chances over targets, and the ring for
 *  anything that lands in an area.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, K = GS.Kit, S = GS.Stage, FX = GS.FX, Au = GS.Audio;

/* a rounded tile square, and the cover shields, drawn once */
const tileTex = (()=>{ const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.22)"; g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3;
  const r = 10; g.beginPath(); g.moveTo(4 + r, 4); g.arcTo(60, 4, 60, 60, r); g.arcTo(60, 60, 4, 60, r); g.arcTo(4, 60, 4, 4, r); g.arcTo(4, 4, 60, 4, r); g.closePath(); g.fill(); g.stroke();
  return new THREE.CanvasTexture(c); })();
const shieldTex = full=>{ const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const path = ()=>{ g.beginPath(); g.moveTo(32, 4); g.lineTo(58, 12); g.lineTo(54, 38); g.quadraticCurveTo(46, 54, 32, 60); g.quadraticCurveTo(18, 54, 10, 38); g.lineTo(6, 12); g.closePath(); };
  g.lineWidth = 5; g.strokeStyle = "#0a0f14"; path(); g.stroke();
  g.fillStyle = "rgba(70,228,255,0.25)"; path(); g.fill();
  g.save(); path(); g.clip(); g.fillStyle = "#46e4ff"; g.fillRect(0, full ? 0 : 32, 64, 64); g.restore();
  g.lineWidth = 3; g.strokeStyle = "#dffcff"; path(); g.stroke();
  return new THREE.CanvasTexture(c); };
const SHIELD = [null, shieldTex(false), shieldTex(true)];

class BattleView {
  constructor(battle, opts){
    this.b = battle; this.o = opts || {};
    this.world = new GS.World(battle.map);
    S.scene.add(this.world.group);
    S.bounds = Math.max(battle.map.w, battle.map.h)*K.T*0.6;
    S.rig.minDist = 14; S.rig.maxDist = 64;
    this.actors = {};
    this.queue = []; this.playing = false; this.speed = 1;
    this.sel = null; this.mode = null; this.hover = null; this.hoverUnit = null; this.preview = null; this.pending = null;
    this.disp = { lumen:battle.lumen, tide:battle.tide, round:battle.round, team:battle.team, concealed:battle.concealed };
    this.labels = document.getElementById("labels");
    this.chips = [];
    battle.units.forEach(u=> this.addActor(u));
    this.buildOverlays();
    this.lamp = new THREE.PointLight(0xa8e6ff, 0.9, 10, 1.5); S.scene.add(this.lamp);
    this.unframe = S.onFrame((dt, t)=> this.frame(dt, t));
    this.bindInput();
    const first = battle.squad()[0];
    const c = this.world.pos(first.x, first.y); S.focus(c.x, c.z - 6, true);
    this.select(first, true);
    this.pump();
  }

  dispose(){
    this.unframe(); this.unbind();
    S.scene.remove(this.world.group); S.scene.remove(this.ov); S.scene.remove(this.lamp);
    Object.values(this.actors).forEach(a=>{ S.scene.remove(a.R.root); a.label.remove(); });
    this.clearChips(); FX.clear();
  }

  /* ---- actors ---- */
  addActor(u){
    const R = GS.Models.build(u);
    const p = this.world.pos(u.x, u.y);
    R.root.position.copy(p);
    R.root.rotation.y = u.team === "squad" ? Math.PI : 0;
    S.scene.add(R.root);
    const label = document.createElement("div"); label.className = "ulabel " + u.team + (u.boss ? " boss" : "");
    this.labels.appendChild(label);
    const a = this.actors[u.id] = { id:u.id, u, R, x:u.x, y:u.y, hp:u.hp, maxHp:u.maxHp, armor:u.armor, team:u.team, statuses:{}, ow:false,
      visible:u.team === "squad", downed:false, dead:false, label, phase:Math.random()*6, flash:0, lunge:0 };
    this.updateLabel(a);
    return a;
  }
  updateLabel(a){
    const pips = [];
    const n = a.maxHp, big = n > 14;
    if(big) pips.push('<i class="hpbar"><b style="width:' + Math.round(100*Math.max(0, a.hp)/n) + '%"></b></i><em>' + Math.max(0, a.hp) + "</em>");
    else for(let i=0;i<n;i++) pips.push('<i class="' + (i < a.hp ? "on" : "") + '"></i>');
    const st = Object.keys(a.statuses).map(s=> '<span class="st ' + s + '" title="' + GS.STATUS[s].name + '">' + GS.STATUS[s].name.slice(0, 1) + "</span>").join("");
    a.label.innerHTML = (a.armor > 0 ? '<span class="arm">' + "◆".repeat(Math.min(3, a.armor)) + "</span>" : "") + '<span class="pips">' + pips.join("") + "</span>" + st +
      (a.ow ? '<span class="ow" title="Overwatch">◉</span>' : "") + (a.downed ? '<span class="down">DOWN</span>' : "");
  }

  /* ---- the overlays ---- */
  buildOverlays(){
    const ov = this.ov = new THREE.Group(); S.scene.add(ov);
    const M = this.b.map;
    const q = new THREE.PlaneGeometry(K.T*0.92, K.T*0.92); q.rotateX(-Math.PI/2);
    this.range = new THREE.InstancedMesh(q, new THREE.MeshBasicMaterial({ map:tileTex, transparent:true, depthWrite:false, opacity:0.75, blending:THREE.AdditiveBlending }), M.w*M.h);
    this.range.count = 0; this.range.frustumCulled = false; ov.add(this.range);
    const d = new THREE.CircleGeometry(0.16, 10); d.rotateX(-Math.PI/2);
    this.dots = new THREE.InstancedMesh(d, new THREE.MeshBasicMaterial({ color:0xbff6ff, transparent:true, depthWrite:false }), 80);
    this.dots.count = 0; this.dots.frustumCulled = false; ov.add(this.dots);
    this.cursor = new THREE.Mesh(q, new THREE.MeshBasicMaterial({ map:tileTex, color:0xffffff, transparent:true, depthWrite:false }));
    this.cursor.visible = false; ov.add(this.cursor);
    this.shields = [0, 1, 2, 3].map(()=>{ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:SHIELD[2], depthTest:false, transparent:true })); s.scale.set(0.8, 0.8, 0.8); s.visible = false; s.renderOrder = 10; ov.add(s); return s; });
    this.area = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color:0xffb050, transparent:true, opacity:0.9, depthWrite:false, side:THREE.DoubleSide }));
    this.area.rotation.x = -Math.PI/2; this.area.visible = false; ov.add(this.area);
    this.areaFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color:0xffb050, transparent:true, opacity:0.12, depthWrite:false }));
    this.areaFill.rotation.x = -Math.PI/2; this.areaFill.visible = false; ov.add(this.areaFill);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.92, 40), new THREE.MeshBasicMaterial({ color:0x9ff4ff, transparent:true, depthWrite:false, side:THREE.DoubleSide }));
    this.selRing.rotation.x = -Math.PI/2; ov.add(this.selRing);
  }
  clearRange(){ this.range.count = 0; this.dots.count = 0; this.cursor.visible = false; this.shields.forEach(s=> s.visible = false); this.area.visible = false; this.areaFill.visible = false; }
  showRange(){
    this.clearRange();
    const u = this.selUnit();
    if(!u || this.busy() || this.b.team !== "squad" || !this.b.able(u) || this.mode) return;
    this.R = this.b.reach(u);
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), keep = Math.max(0, u.ap - (u.weapon ? u.weapon.ap : 2));
    let n = 0;
    for(let i=0;i<this.R.cost.length;i++){
      const cost = this.R.cost[i]; if(cost === Infinity || cost === 0) continue;
      const x = i % this.b.map.w, y = (i - x)/this.b.map.w, ap = this.b.apForCost(u, cost);
      if(ap > u.ap) continue;
      const p = this.world.pos(x, y);
      m4.makeTranslation(p.x, p.y + 0.05, p.z); this.range.setMatrixAt(n, m4);
      this.range.setColorAt(n, c.setHex(ap <= keep ? 0x2fc8ff : 0xffb43a)); n++;
    }
    this.range.count = n; this.range.instanceMatrix.needsUpdate = true; if(this.range.instanceColor) this.range.instanceColor.needsUpdate = true;
  }

  /* ---- selection and modes ---- */
  selUnit(){ return this.sel ? this.b.unit(this.sel) : null; }
  select(u, quiet){
    if(!u || u.team !== "squad" || u.dead) return;
    this.sel = u.id; this.mode = null; this.preview = null; this.pending = null;
    if(!quiet) Au.play("select");
    const a = this.actors[u.id], p = a.R.root.position; S.focus(p.x, p.z);
    this.refresh();
  }
  nextUnit(dir){
    const list = this.b.squad().filter(u=> this.b.able(u));
    if(!list.length) return;
    const ready = list.filter(u=> u.ap > 0);
    const pool = ready.length ? ready : list;
    const i = pool.findIndex(u=> u.id === this.sel);
    this.select(pool[((i + (dir || 1)) % pool.length + pool.length) % pool.length]);
  }
  setMode(id){
    const u = this.selUnit();
    if(!u || this.busy() || this.b.team !== "squad") return;
    const D = this.b.defOfAction(id);
    if(!D) return;
    const why = this.b.cannot(u, id, D);
    if(why){ Au.play("error"); this.o.toast && this.o.toast(why); return; }
    if(D.target === "self" || D.target === "adjacent"){ Au.play("click"); this.b.act(u, id, u); this.mode = null; this.pump(); return; }
    if(this.mode && this.mode.id === id){ this.cancel(); return; }
    this.mode = { id, D }; this.preview = null; this.pending = null;
    Au.play("click");
    this.clearRange();
    // anything with exactly one target: aim at it straight away
    const ts = D.target !== "tile" ? this.b.targetsFor(u, id) : [];
    if(ts.length === 1) this.setPreview(ts[0]);
    this.refresh();
  }
  cancel(){ if(!this.mode) return; this.mode = null; this.preview = null; this.pending = null; this.refresh(); }
  setPreview(t){
    const u = this.selUnit(); if(!u) return;
    const id = this.mode ? this.mode.id : "fire", D = this.b.defOfAction(id);
    if(t && t.team !== undefined && (D.attack)) this.preview = { t, info:this.b.hitInfo(u, t, { ability:id }), id };
    else this.preview = t ? { t, id } : null;
    this.o.onChange && this.o.onChange();
  }
  refresh(){ this.showRange(); this.updateHover(); this.updateChips(); this.o.onChange && this.o.onChange(); }
  busy(){ return this.playing || this.queue.length > 0 || !!this.b.over; }

  /* ---- doing things ---- */
  confirm(target){
    const u = this.selUnit(); if(!u || this.busy()) return;
    const id = this.mode ? this.mode.id : "fire";
    if(this.b.act(u, id, target)){ this.mode = null; this.preview = null; this.pending = null; this.clearChips(); this.pump(); }
    else { Au.play("error"); }
  }
  moveTo(x, y){
    const u = this.selUnit(); if(!u || this.busy()) return;
    if(this.b.move(u, x, y)){ this.clearRange(); this.pump(); }
  }
  endTurn(){
    if(this.busy() || this.b.team !== "squad") return;
    this.mode = null; this.preview = null; this.clearRange(); this.clearChips();
    this.b.endTurn(); this.pump();
  }
  sing(id){ if(this.busy()) return; if(this.b.sing(id)) this.pump(); }

  /* ---- playback ---- */
  pump(){
    const ev = this.b.drain();
    if(ev.length){ this.queue.push(...ev); this.play(); }
    else this.idle();
  }
  async play(){
    if(this.playing) return;
    this.playing = true; this.clearRange(); this.clearChips(); this.o.onChange && this.o.onChange();
    while(this.queue.length){
      const e = this.queue.shift();
      try{ await this.handle(e); }catch(err){ console.error("event", e.type, err); }
    }
    this.playing = false;
    this.idle();
  }
  idle(){
    if(this.b.over){ this.o.onChange && this.o.onChange(); if(!this.ended){ this.ended = true; setTimeout(()=> this.o.onEnd && this.o.onEnd(this.b.summary()), 900); } return; }
    const u = this.selUnit();
    if(this.b.team === "squad" && (!u || !this.b.able(u) || u.ap <= 0)){
      const next = this.b.squad().find(v=> this.b.able(v) && v.ap > 0);
      if(next){ this.select(next, true); return; }
    }
    this.refresh();
  }
  t(ms){ return FX.wait(ms/this.speed); }
  actorPos(a, up){ const p = a.R.root.position.clone(); p.y += up === undefined ? 1 : up; return p; }
  muzzle(a){ const v = new THREE.Vector3(); a.R.muzzle.getWorldPosition(v); return v; }
  face(a, x, y){ const p = this.world.pos(x, y), r = a.R.root.position; if(Math.abs(p.x - r.x) + Math.abs(p.z - r.z) < 0.01) return; a.R.root.rotation.y = Math.atan2(p.x - r.x, p.z - r.z); }
  seen(a){ return a && (a.team === "squad" || a.visible); }

  async handle(e){
    const A = e.id ? this.actors[e.id] : null;
    switch(e.type){
      case "log": this.o.onLog && this.o.onLog(e.text, e.cls); return;
      case "turn":
        this.disp.team = e.team; this.disp.round = e.round;
        Au.setMode(e.team === "squad" ? "battle" : "gloom");
        Au.play(e.team === "squad" ? "turn" : "gloomturn");
        this.o.onBanner && this.o.onBanner(e.team === "squad" ? "SQUAD TURN" : "GLOOM TURN", "ROUND " + e.round, e.team);
        Object.values(this.actors).forEach(a=>{ if(a.team === e.team && a.ow){ a.ow = false; this.updateLabel(a); } });
        this.o.onChange && this.o.onChange();
        await this.t(e.team === "squad" ? 650 : 750); return;
      case "vis": {
        this.world.setFog(e.fog);
        const seen = new Set(e.seen);
        Object.values(this.actors).forEach(a=>{ if(a.team === "gloom"){ a.visible = seen.has(a.id); } });
        return; }
      case "focus": if(this.seen(A)){ const p = A.R.root.position; S.focus(p.x, p.z); await this.t(380); } return;
      case "step": {
        if(!A) return;
        const from = A.R.root.position.clone(), to = this.world.pos(e.x, e.y);
        this.face(A, e.x, e.y); A.x = e.x; A.y = e.y;
        if(!this.seen(A)){ A.R.root.position.copy(to); return; }
        if(A.team === "squad" || A.visible) S.focus(to.x, to.z);
        Au.play("step");
        await FX.tween(0.15/this.speed, k=>{ A.R.root.position.lerpVectors(from, to, Math.max(0, k)); A.R.root.position.y += Math.sin(Math.max(0, k)*Math.PI)*0.28; });
        return; }
      case "attack": return this.playAttack(e);
      case "damage": {
        if(!A) return;
        A.hp = e.hp; A.flash = 1; this.updateLabel(A);
        if(this.seen(A)) FX.float(this.actorPos(A, A.R.head*0.8 + 0.3), (e.crit ? "CRIT " : "") + "-" + e.amount, e.crit ? "crit" : (e.kind === "poison" ? "poison" : "dmg"));
        if(e.kind === "poison" && this.seen(A)){ FX.burst(this.actorPos(A), 0xc6ff4a, 12, 2, 0.3, 0.6); await this.t(350); }
        return; }
      case "heal": if(A){ A.hp = e.hp; this.updateLabel(A); if(e.amount > 0){ FX.rise(this.actorPos(A, 0.2), 0x9fffc0, 24); FX.float(this.actorPos(A, A.R.head*0.8 + 0.3), "+" + e.amount, "heal"); Au.play("heal"); await this.t(350); } } return;
      case "status": if(A){ if(e.on) A.statuses[e.s] = 1; else delete A.statuses[e.s]; this.updateLabel(A);
        if(e.on && this.seen(A)) FX.float(this.actorPos(A, A.R.head + 0.5), GS.STATUS[e.s].name.toUpperCase(), GS.STATUS[e.s].bad ? "bad" : "buff"); } return;
      case "overwatch": if(A){ A.ow = e.on; this.updateLabel(A); if(e.on){ Au.play("overwatch"); if(this.seen(A)) FX.float(this.actorPos(A, A.R.head + 0.4), "OVERWATCH", "buff"); await this.t(250); } } return;
      case "reload": Au.play("reload"); if(A) FX.float(this.actorPos(A, A.R.head + 0.4), "RELOAD", "buff"); await this.t(300); return;
      case "overclock": if(A){ FX.burst(this.actorPos(A), 0x7ff0ff, 30, 4, 0.3, 0.5, { up:2 }); Au.play("lumen"); FX.float(this.actorPos(A, A.R.head + 0.4), "+AP", "buff"); await this.t(300); } return;
      case "downed": if(A){ A.downed = true; this.updateLabel(A); Au.play("death"); FX.death(this.actorPos(A, 0.6), "squad");
        await FX.tween(0.5/this.speed, k=>{ A.R.body.rotation.x = -k*1.4; A.R.body.position.y = -k*0.1; }); } return;
      case "stabilized": if(A){ FX.rise(this.actorPos(A, 0.2), 0x9fffc0, 18); FX.float(this.actorPos(A, 1.2), "STABLE", "heal"); A.stable = true; } return;
      case "revive": if(A){ A.downed = false; A.hp = e.hp; this.updateLabel(A); FX.rise(this.actorPos(A, 0.2), 0xbff6ff, 60, 1.2); Au.play("heal");
        await FX.tween(0.5/this.speed, k=>{ A.R.body.rotation.x = -(1 - k)*1.4; A.R.body.position.y = 0; }); } return;
      case "death": return this.playDeath(A);
      case "aoe": {
        const p = this.world.pos(e.x, e.y);
        if(e.fx === "pod"){ await this.podDrop(p); return; }
        FX.aoe(p, e.radius, e.fx); Au.play(e.fx === "blast" ? "blast" : e.fx === "glow" ? "glowbolt" : "squish");
        await this.t(420); return; }
      case "cast": return this.playCast(e);
      case "smash": this.world.smash(e.x, e.y); FX.burst(this.world.pos(e.x, e.y), 0x8a6a4a, 18, 4, 0.3, 0.8, { up:2, grav:-8 }); return;
      case "spawn": {
        const a = this.addActor(e.unit);
        a.visible = false;
        const to = a.R.root.position.clone(); a.R.root.position.y += 9;
        await FX.tween(0.35/this.speed, k=>{ a.R.root.position.y = to.y + 9*(1 - k)*(1 - k); });
        if(this.seen(a)) FX.burst(to, 0x9cff3a, 20, 3, 0.35, 0.6, { col2:0xff4fd8 });
        return; }
      case "activate":
        Au.play("reveal");
        e.ids.forEach(id=>{ const a = this.actors[id]; if(this.seen(a)) FX.float(this.actorPos(a, a.R.head + 0.6), "!", "alert"); });
        if(e.ids.some(id=> this.seen(this.actors[id]))){ const a = this.actors[e.ids[0]], p = a.R.root.position; S.focus(p.x, p.z); await this.t(700); }
        return;
      case "reveal": this.disp.concealed = false; Au.play("reveal"); this.o.onBanner && this.o.onBanner("CONCEALMENT BROKEN", "THE GLOOM KNOWS YOU'RE HERE", "warn"); this.o.onChange && this.o.onChange(); await this.t(600); return;
      case "harvest": { this.world.harvest(e.x, e.y); const p = this.world.pos(e.x, e.y); FX.rise(p, 0x7ff0ff, 70, 1.2); FX.ring(p, 0x7ff0ff, 3, 0.8); Au.play("lumen"); await this.t(500); return; }
      case "lumen": this.disp.lumen = e.value; this.o.onChange && this.o.onChange(); if(e.delta > 0 && e.why !== "harvest") Au.play("lumen"); return;
      case "tide": this.disp.tide = e.value; this.o.onChange && this.o.onChange(); return;
      case "tideStep": Au.play("tide"); this.o.onBanner && this.o.onBanner("GLOOM TIDE · " + e.name.toUpperCase(), e.desc, "tide"); S.shake(0.4); await this.t(1100); return;
      case "bark": if(A) FX.float(this.actorPos(A, A.R.head + 0.6), e.text, "bark"); await this.t(500); return;
      case "chorus": {
        Au.play("chorus");
        this.b.squad().forEach(u=>{ const a = this.actors[u.id]; if(a && !a.downed){ FX.rise(this.actorPos(a, 0.2), 0xffe6a0, 30); FX.ring(a.R.root.position, 0xffe6a0, 1.6, 0.9); } });
        this.o.onBanner && this.o.onBanner(GS.CHORUS[e.id].name.toUpperCase(), GS.CHORUS[e.id].desc, "chorus");
        await this.t(900); return; }
      case "end":
        Au.play(e.result === "victory" ? "victory" : "defeat");
        this.o.onBanner && this.o.onBanner(e.result === "victory" ? "VICTORY" : e.result === "retreat" ? "RETREAT" : "DEFEAT", e.result === "victory" ? "THE CLEARING IS CLEANSED" : "", e.result === "victory" ? "win" : "lose", true);
        await this.t(600); return;
    }
  }

  async playAttack(e){
    const A = this.actors[e.id], T = this.actors[e.target];
    if(!A || !T) return;
    const show = this.seen(A) || this.seen(T);
    this.face(A, T.x, T.y);
    if(e.reaction){ FX.float(this.actorPos(A, A.R.head + 0.5), e.reaction === "overwatch" ? "OVERWATCH" : e.reaction === "thornWard" ? "THORN WARD" : "RIPOSTE", "bad"); }
    if(!show){ return; }
    const tp = this.actorPos(T, Math.min(1.1, T.R.head*0.5));
    if(A.team === "gloom" || T.team === "squad") S.focus((A.R.root.position.x + T.R.root.position.x)/2, (A.R.root.position.z + T.R.root.position.z)/2);
    if(e.melee){
      Au.play(e.fx === "slash" ? "slash" : "claw");
      const from = A.R.root.position.clone(), dir = T.R.root.position.clone().sub(from); const L = dir.length(); dir.normalize();
      const reach = Math.max(0, L - 1.1);
      await FX.tween(0.14/this.speed, k=>{ A.R.root.position.copy(from).addScaledVector(dir, (0.5 + reach)*k); });
      if(e.hit) FX.impact(tp, e.fx === "slash" ? "blade" : "rot", e.crit); else FX.miss(tp);
      Au.play(e.hit ? (T.team === "gloom" ? "squish" : "hit") : "miss"); if(e.crit) Au.play("crit");
      if(!e.hit) FX.float(tp.clone().add(new THREE.Vector3(0, 0.6, 0)), "MISS", "miss");
      await FX.tween(0.2/this.speed, k=>{ A.R.root.position.copy(from).addScaledVector(dir, (0.5 + reach)*(1 - k)); });
      A.R.root.position.copy(from);
      await this.t(140);
      return;
    }
    const m = this.muzzle(A);
    Au.play({ pellets:"pellets", needle:"needle", glowbolt:"glowbolt", burst:"burst", acid:"acid", hex:"hex" }[e.fx] || "pellets");
    FX.burst(m, 0xfff0c0, 8, 3, 0.25, 0.2);
    A.lunge = -1;
    let aim = tp.clone();
    if(!e.hit){ const off = new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5)).normalize().multiplyScalar(0.9 + Math.random()*0.6); aim.add(off); aim.y += (Math.random() - 0.3)*0.8; }
    await FX.shot(m, aim, e.fx);
    if(e.hit){ FX.impact(tp, e.dmgType === "glow" ? "glow" : e.dmgType === "spore" ? "spore" : "kinetic", e.crit); Au.play(T.team === "gloom" ? "squish" : "hit"); if(e.crit){ Au.play("crit"); S.shake(0.35); } }
    else { FX.miss(aim); Au.play("miss"); FX.float(tp.clone().add(new THREE.Vector3(0, 0.6, 0)), "MISS", "miss"); }
    await this.t(220);
  }
  async playCast(e){
    const A = this.actors[e.id]; if(!A) return;
    const D = this.b.defOfAction(e.ability) || {};
    if(e.x !== A.x || e.y !== A.y) this.face(A, e.x, e.y);
    const show = this.seen(A) || (this.b.fog && this.b.map);
    if(D.target === "self" || !show){ FX.rise(this.actorPos(A, 0.2), 0x7ff0ff, 16); Au.play("cast"); await this.t(250); return; }
    const to = this.world.pos(e.x, e.y); to.y += 0.6;
    if(D.target === "tile" || D.target === "enemy"){
      const kind = e.ability === "mortar" ? "mortar" : e.ability.startsWith("item:") ? "throw" : e.ability === "sporeStorm" ? "storm" : "spell";
      Au.play(kind === "mortar" ? "launch" : "cast");
      if(e.ability === "suppress"){ for(let i=0;i<4;i++){ FX.shot(this.muzzle(A), to.clone().add(new THREE.Vector3((Math.random() - 0.5)*1.5, Math.random(), (Math.random() - 0.5)*1.5)), "burst"); Au.play("burst"); await this.t(110); } await this.t(200); return; }
      await FX.shot(this.muzzle(A), to, kind);
      if(D.target === "enemy") FX.impact(to, "glow");
      return;
    }
    // on an ally: a ribbon of light to them
    Au.play("cast");
    await FX.shot(this.muzzle(A), to, "spell");
    FX.rise(to.clone().setY(to.y - 0.6), 0xbff6ff, 24);
  }
  async playDeath(A){
    if(!A) return;
    A.dead = true;
    const p = A.R.root.position.clone();
    if(this.seen(A) || A.team === "squad"){
      FX.death(p.clone().setY(p.y + 0.6), A.team); Au.play(A.team === "squad" ? "death" : "squish");
      await FX.tween(0.45/this.speed, k=>{ A.R.root.scale.setScalar(Math.max(0.01, 1 - k)); A.R.root.position.y = p.y - k*0.4; });
    }
    S.scene.remove(A.R.root); A.label.remove();
  }
  async podDrop(p){
    const pod = new THREE.Mesh(K.lump(0.8, 1, 0.3), new THREE.MeshLambertMaterial({ color:0x3a1640, emissive:0x2a0a2a }));
    pod.position.copy(p); pod.position.y += 30; S.scene.add(pod);
    S.focus(p.x, p.z);
    await FX.tween(0.7/this.speed, k=>{ pod.position.y = p.y + 30*(1 - k*k) + 0.6; pod.rotation.x += 0.1; });
    S.scene.remove(pod);
    FX.aoe(p, 1.5, "pod"); Au.play("blast"); S.shake(0.6);
    await this.t(300);
  }

  /* ---- input ---- */
  bindInput(){
    const el = S.renderer.domElement, ptrs = new Map();
    let down = null, pinch = 0;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (cx, cy)=>{
      ndc.set(cx/window.innerWidth*2 - 1, -(cy/window.innerHeight)*2 + 1);
      ray.setFromCamera(ndc, S.camera);
      const hits = Object.values(this.actors).filter(a=> !a.dead && this.seen(a)).map(a=> a.R.hit);
      const hu = ray.intersectObjects(hits, false)[0];
      if(hu){ const a = Object.values(this.actors).find(a=> a.R.hit === hu.object); if(a) return { unit:this.b.unit(a.id), x:a.x, y:a.y }; }
      const hg = ray.intersectObjects(this.world.pickables, false)[0];
      if(!hg) return null;
      const t = this.world.tileAt(hg.point.x, hg.point.z);
      if(!GS.Grid.inBounds(this.b.map, t.x, t.y)) return null;
      const u = this.b.unitAt(t.x, t.y);
      return { unit:u && (u.team === "squad" || this.b.visible(u)) ? u : null, x:t.x, y:t.y };
    };
    const onMove = e=>{
      if(ptrs.has(e.pointerId)){ const p = ptrs.get(e.pointerId); p.lx = p.x; p.ly = p.y; p.x = e.clientX; p.y = e.clientY; }
      if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if(pinch) S.zoom(pinch/d); pinch = d; return;
      }
      if(down && ptrs.has(e.pointerId)){
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if(Math.hypot(dx, dy) > 7) down.drag = true;
        if(down.drag){ const p = ptrs.get(e.pointerId), f = S.rig.dist/600; S.pan(-(p.x - p.lx)*f, -(p.y - p.ly)*f*1.3); return; }
      }
      if(e.pointerType !== "touch"){ this.hoverAt = pick(e.clientX, e.clientY); this.updateHover(); }
    };
    const onDown = e=>{
      Au.start();
      ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY, lx:e.clientX, ly:e.clientY });
      if(ptrs.size === 1) down = { x:e.clientX, y:e.clientY, drag:false, button:e.button, touch:e.pointerType === "touch" };
      else { down = null; pinch = 0; }
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    };
    const onUp = e=>{
      ptrs.delete(e.pointerId); if(ptrs.size < 2) pinch = 0;
      if(!down) return;
      const d = down; down = null;
      if(d.drag) return;
      if(d.button === 2){ this.cancel(); return; }
      const h = pick(e.clientX, e.clientY);
      this.hoverAt = h; this.updateHover();
      this.click(h, d.touch);
    };
    const onWheel = e=>{ e.preventDefault(); S.zoom(e.deltaY > 0 ? 1.1 : 0.9); };
    const noMenu = e=> e.preventDefault();
    el.addEventListener("pointermove", onMove); el.addEventListener("pointerdown", onDown); el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp); el.addEventListener("wheel", onWheel, { passive:false }); el.addEventListener("contextmenu", noMenu);
    this.unbind = ()=>{ el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp); el.removeEventListener("wheel", onWheel); el.removeEventListener("contextmenu", noMenu); };
  }

  click(h, touch){
    if(!h || this.busy() || this.b.team !== "squad") return;
    const u = this.selUnit(), M = this.mode;
    // touch: the first tap aims, the second fires
    const confirmTap = key=>{ if(!touch) return true; if(this.pending === key) return true; this.pending = key; this.o.toast && this.o.toast("Tap again to confirm"); return false; };
    if(M){
      const D = M.D;
      if(D.target === "tile"){
        if(this.b.tileOK(u, M.id, h.x, h.y)){ Au.play("error"); return; }
        if(confirmTap("t" + h.x + "," + h.y)) this.confirm({ x:h.x, y:h.y });
        return;
      }
      if(D.target === "node"){ const n = this.b.targetsFor(u, M.id).find(n=> n.x === h.x && n.y === h.y) || this.b.targetsFor(u, M.id)[0]; if(n) this.confirm(n); return; }
      const t = h.unit;
      if(t && this.b.targetsFor(u, M.id).includes(t)){ this.setPreview(t); if(confirmTap("u" + t.id)) this.confirm(t); return; }
      if(t && t.team === "squad" && D.target === "enemy"){ this.select(t); return; }
      Au.play("error"); return;
    }
    if(h.unit && h.unit.team === "squad"){ if(h.unit.id !== this.sel) this.select(h.unit); return; }
    if(h.unit && h.unit.team === "gloom"){
      if(!this.b.cannot(u, "fire") && this.b.targetsFor(u, "fire").includes(h.unit)){
        this.setPreview(h.unit);
        if(confirmTap("u" + h.unit.id)) this.confirm(h.unit);
      } else { Au.play("error"); this.o.toast && this.o.toast(this.b.attackBlock(u, h.unit, "fire") || this.b.cannot(u, "fire") || "Can't reach"); }
      return;
    }
    if(this.R && u){
      const c = this.R.cost[h.y*this.b.map.w + h.x];
      if(c !== Infinity && c > 0 && this.b.apForCost(u, c) <= u.ap){ if(confirmTap("m" + h.x + "," + h.y)) this.moveTo(h.x, h.y); return; }
    }
    Au.play("error");
  }

  /* what the cursor is over: the path there, cover, who'd see you, the area of effect */
  updateHover(){
    const h = this.hoverAt, u = this.selUnit();
    this.dots.count = 0; this.cursor.visible = false; this.shields.forEach(s=> s.visible = false); this.area.visible = false; this.areaFill.visible = false;
    this.hoverInfo = null;
    if(!h || !u || this.busy() || this.b.team !== "squad"){ this.world.setHover(-99, -99); this.updateChips(); this.o.onChange && this.o.onChange(); return; }
    this.world.setHover(h.x, h.y);
    const p = this.world.pos(h.x, h.y);
    this.cursor.position.set(p.x, p.y + 0.06, p.z); this.cursor.visible = true;
    this.cursor.material.color.setHex(0xffffff);
    const M = this.mode;
    if(M && M.D.target === "tile"){
      const bad = this.b.tileOK(u, M.id, h.x, h.y), r = (M.D.radius || 0.5)*K.T + K.T*0.5;
      this.area.position.set(p.x, p.y + 0.08, p.z); this.area.scale.setScalar(r); this.area.visible = true;
      this.areaFill.position.set(p.x, p.y + 0.07, p.z); this.areaFill.scale.setScalar(r); this.areaFill.visible = true;
      const col = bad ? 0xff4040 : (M.D.friendly === false ? 0x7ff0ff : 0xffb050);
      this.area.material.color.setHex(col); this.areaFill.material.color.setHex(col);
      this.hoverInfo = { area:true, bad, hits:bad ? [] : this.b.unitsInRadius(h.x, h.y, M.D.radius || 0).filter(v=> !v.downed && (M.D.friendly !== false || v.team !== u.team) && (v.team === "squad" || this.b.visible(v))) };
    } else if(M){
      if(h.unit && this.b.targetsFor(u, M.id).includes(h.unit)) this.setPreview(h.unit);
    } else if(h.unit && h.unit.team === "gloom"){
      if(!this.b.cannot(u, "fire") && this.b.targetsFor(u, "fire").includes(h.unit)) this.setPreview(h.unit); else this.preview = null;
    } else if(this.R){
      this.preview = null;
      const c = this.R.cost[h.y*this.b.map.w + h.x];
      if(c !== Infinity && c > 0){
        const ap = this.b.apForCost(u, c);
        if(ap <= u.ap){
          const path = GS.Grid.pathFrom(this.R, h.x, h.y), m4 = new THREE.Matrix4();
          let n = 0; const pts = [this.world.pos(u.x, u.y)].concat(path.map(s=> this.world.pos(s.x, s.y)));
          for(let i=0;i<pts.length - 1 && n < 80;i++) for(let f=0.33; f<1 && n < 80; f+=0.33){ const q = pts[i].clone().lerp(pts[i+1], f); m4.makeTranslation(q.x, q.y + 0.1, q.z); this.dots.setMatrixAt(n++, m4); }
          this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
          this.cursor.material.color.setHex(ap <= Math.max(0, u.ap - (u.weapon ? u.weapon.ap : 2)) ? 0x7ff0ff : 0xffc46a);
          // cover shields on the sides that have it
          GS.Grid.coverSides(this.b.map, h.x, h.y).forEach((s, i)=>{ const sh = this.shields[i];
            sh.material.map = SHIELD[s.cover]; sh.material.needsUpdate = true;
            sh.position.set(p.x + s.dx*K.T*0.45, p.y + 0.9, p.z + s.dy*K.T*0.45); sh.visible = true; });
          const hz = this.b.map.at(h.x, h.y).hazard;
          this.hoverInfo = { move:true, ap, hazard:hz, x:h.x, y:h.y };
        }
      }
    }
    this.updateChips();
    this.o.onChange && this.o.onChange();
  }

  /* chips over units: hit chances while aiming, eyes and flank warnings while moving */
  clearChips(){ this.chips.forEach(c=> c.el.remove()); this.chips = []; }
  chip(a, html, cls){ const el = document.createElement("div"); el.className = "chip " + (cls || ""); el.innerHTML = html; this.labels.appendChild(el); this.chips.push({ el, a }); }
  updateChips(){
    this.clearChips();
    const u = this.selUnit();
    if(!u || this.busy() || this.b.team !== "squad") return;
    const M = this.mode;
    if(M && M.D.target !== "tile"){
      this.b.targetsFor(u, M.id).forEach(t=>{
        const a = this.actors[t.id]; if(!a) return;
        if(M.D.attack){ const i = this.b.hitInfo(u, t, { ability:M.id }); this.chip(a, i.chance + "%", "hit" + (this.preview && this.preview.t === t ? " sel" : "")); }
        else this.chip(a, "✦", "tgt" + (this.preview && this.preview.t === t ? " sel" : ""));
      });
      return;
    }
    if(M && this.hoverInfo && this.hoverInfo.area){ this.hoverInfo.hits.forEach(t=> this.chip(this.actors[t.id], t.team === u.team ? "!" : "✦", t.team === u.team ? "flank" : "tgt")); return; }
    if(this.hoverInfo && this.hoverInfo.move){
      const { x, y } = this.hoverInfo;
      this.b.gloom().forEach(g=>{
        if(!this.b.visible(g) || g.structure || !g.weapon) return;
        const range = g.weapon.melee ? g.mob*g.ap/2 + 1.5 : Math.min(g.sight, g.weapon.range);
        if(!GS.Grid.canSee(this.b.map, g.x, g.y, x, y, range)) return;
        const exposed = GS.Grid.coverAgainst(this.b.map, x, y, g.x, g.y) === 0;
        this.chip(this.actors[g.id], exposed ? "FLANK" : "👁", exposed ? "flank" : "los");
      });
    }
  }

  /* ---- every frame ---- */
  frame(dt, t){
    FX.update(dt);
    this.world.update(dt, t);
    const focus = [];
    Object.values(this.actors).forEach(a=>{
      if(a.dead) return;
      const R = a.R, vis = this.seen(a);
      R.root.visible = vis;
      if(!vis){ a.label.style.display = "none"; return; }
      // idle: a breath, a bob
      if(!a.downed){ R.body.position.y = Math.sin(t*2.2 + a.phase)*0.025; if(R.parts.cap) R.parts.cap.rotation.z = Math.sin(t*1.3 + a.phase)*0.04; }
      if(R.idle) R.idle(t);
      if(a.flash > 0){ a.flash = Math.max(0, a.flash - dt*4); R.mats.forEach(m=> m.emissive && m.emissive.setRGB(a.flash*0.9, a.flash*0.5, a.flash*0.5)); }
      if(a.lunge < 0){ a.lunge = Math.min(0, a.lunge + dt*6); R.body.position.z = a.lunge*0.12; }
      const hp = R.root.position;
      const s = S.project(hp.x, hp.y + R.head + 0.15, hp.z);
      a.label.style.display = s.behind ? "none" : "";
      a.label.style.transform = "translate(" + s.x + "px," + s.y + "px) translate(-50%,-100%)";
      if(a.team === "squad" || a.id === this.sel) focus.push(new THREE.Vector3(hp.x, hp.y + 1, hp.z));
      else if(focus.length < 12) focus.push(new THREE.Vector3(hp.x, hp.y + 1, hp.z));
    });
    this.chips.forEach(c=>{ if(!c.a) return; const p = c.a.R.root.position, s = S.project(p.x, p.y + c.a.R.head + 0.75, p.z); c.el.style.transform = "translate(" + s.x + "px," + s.y + "px) translate(-50%,-100%)"; });
    if(this.hoverAt){ const p = this.world.pos(this.hoverAt.x, this.hoverAt.y); focus.push(p.setY(p.y + 0.5)); }
    this.world.updateFade(S.camera, focus, dt);
    // the selected trooper: a ring and a little light to see them by
    const sa = this.sel && this.actors[this.sel];
    if(sa && !sa.dead){ const p = sa.R.root.position; this.selRing.visible = true; this.selRing.position.set(p.x, p.y + 0.05, p.z); this.selRing.scale.setScalar(1 + Math.sin(t*4)*0.05); this.lamp.position.set(p.x, p.y + 3, p.z + 1); this.lamp.intensity = 0.9; }
    else { this.selRing.visible = false; this.lamp.intensity = 0; }
    this.range.material.opacity = 0.6 + Math.sin(t*3)*0.12;
  }
}
GS.BattleView = BattleView;
})();
