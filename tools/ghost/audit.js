/* ------------------------------------------------------------------ *
 *  The ghost's eyes: what it checks while it plays.
 *
 *  - invariants: after every action, the battle must still make sense
 *    (no one off the map or inside a boulder, no two units on a tile,
 *    HP and AP in range, the battle over exactly when it should be)
 *  - the event stream: every event the view will animate must be
 *    well formed (steps are one tile, hit chances 5-100, nothing after
 *    the end, nobody dies twice)
 *  - contracts: illegal actions are refused and change nothing
 *  - metrics: who dealt what, which abilities get used, whether the
 *    hit chances shown match what actually happens
 *
 *  Every problem becomes a finding with a fingerprint (so the same bug
 *  across 300 battles is one finding with a count), a severity, and a
 *  seed to reproduce it. Runs in Node and in the page.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS, Grid = GS.Grid;
const Ghost = GS.Ghost = GS.Ghost || {};

const EVENT_TYPES = new Set(["log", "turn", "vis", "focus", "step", "attack", "damage", "heal", "status", "overwatch", "reload", "overclock", "downed",
  "stabilized", "revive", "death", "aoe", "cast", "smash", "spawn", "activate", "reveal", "harvest", "lumen", "tide", "tideStep", "bark", "chorus", "end"]);

/* ---- findings and metrics, shared across every run ---- */
Ghost.Audit = class {
  constructor(){
    this.findings = new Map();
    this.m = { battles:{}, abilities:{}, calib:{}, classes:{}, enemies:{}, rounds:[], tideMax:[], gloomTurnMs:[], campaigns:[], timing:{},
      // how it feels to play: measured from the same events the screen animates
      feel:{ battles:0, contact:[], enemyTurnSec:[], squadTurnSec:[], gloomHits:0, unseenHits:0, streaks:[], owShots:{ squad:{ n:0, hit:0 }, gloom:{ n:0, hit:0 } },
             abilityDmg:{}, earlyLosses:0, revealBy:{ spotted:0, attack:0 }, idleTurns:0, unitTurns:0, firstShotMiss:0, firstShots:0 } };
  }
  /* one finding per fingerprint; repeats just count */
  find(sev, cat, title, detail, repro){
    const key = cat + "|" + title;
    const f = this.findings.get(key);
    if(f){ f.count++; if(f.examples.length < 3 && detail) f.examples.push({ detail, repro }); return f; }
    const n = { key, severity:sev, category:cat, title, count:1, examples:detail || repro ? [{ detail, repro }] : [] };
    this.findings.set(key, n); return n;
  }
  ability(id, ok){ const a = this.m.abilities[id] = this.m.abilities[id] || { tries:0, ok:0, enabled:0 }; a.tries++; if(ok) a.ok++; }
  cls(c){ return this.m.classes[c] = this.m.classes[c] || { deployed:0, dmg:0, kills:0, downs:0, deaths:0 }; }
  enemy(t){ return this.m.enemies[t] = this.m.enemies[t] || { spawned:0, dmg:0, killed:0, downed:0 }; }
};

/* ---- watching one battle ---- */
Ghost.Watch = class {
  constructor(audit, b, repro){
    this.A = audit; this.b = b; this.repro = repro;
    this.pos = {}; this.who = {}; this.dead = new Set(); this.ended = false; this.ends = 0;
    this.lastTide = b.tide; this.lastRound = b.round; this.src = null; this.dmgBy = {};
    // what the player can see, as the screen would show it (from the vis events)
    this.seenNow = new Set(); this.team = "squad"; this.round = 1; this.turnSec = 0; this.streak = 0; this.longest = 0; this.contact = null; this.srcAb = null; this.firstShot = true;
    b.units.forEach(u=> this.know(u));
    b.units.forEach(u=>{ if(u.team === "squad") audit.cls(u.cls).deployed++; else audit.enemy(u.type).spawned++; });
    // read every event in the order the view will play it: as the queue is drained
    const drain = b.drain.bind(b);
    b.drain = ()=>{ const ev = drain(); ev.forEach(e=>{ try{ this.onEvent(e); }catch(err){ this.crash("event check", err); } }); return ev; };
  }
  know(u){ this.pos[u.id] = { x:u.x, y:u.y }; this.who[u.id] = { team:u.team, type:u.type, cls:u.cls, name:u.name }; }
  rp(extra){ return Object.assign({}, this.repro, { round:this.b.round }, extra); }
  crash(where, err){ this.A.find("critical", "crash", "Exception in " + where + ": " + (err && err.message), (err && err.stack || "").split("\n").slice(0, 4).join(" | "), this.rp()); }

  /* the event stream the view animates */
  onEvent(e){
    this.feel(e);
    const A = this.A, b = this.b;
    if(!EVENT_TYPES.has(e.type)) A.find("major", "events", "Unknown event type '" + e.type + "'", "", this.rp());
    if(this.ended && e.type !== "log") A.find("major", "events", "Event '" + e.type + "' after the battle ended", "", this.rp());
    const W = e.id ? this.who[e.id] : null;
    if(e.id && !W && e.type !== "log") A.find("major", "events", "Event '" + e.type + "' names a unit that doesn't exist", e.id, this.rp());
    switch(e.type){
      case "spawn": this.know(e.unit); A.enemy(e.unit.type).spawned++; break;
      case "step": {
        const p = this.pos[e.id];
        if(p && Math.hypot(p.x - e.x, p.y - e.y) > 1.5 + 1e-6) A.find("major", "events", "A unit jumped more than one tile in a single step", W && W.type + " " + p.x + "," + p.y + " -> " + e.x + "," + e.y, this.rp());
        if(!Grid.passable(b.map, e.x, e.y)) A.find("critical", "rules", "A unit stepped onto a blocked tile", W && W.type + " at " + e.x + "," + e.y, this.rp());
        if(this.dead.has(e.id)) A.find("critical", "rules", "A dead unit moved", W && W.type, this.rp());
        this.pos[e.id] = { x:e.x, y:e.y };
        break; }
      case "attack": {
        if(!(e.chance >= 5 && e.chance <= 100)) A.find("major", "rules", "Hit chance outside 5-100", e.chance + "%", this.rp());
        if(this.dead.has(e.id)) A.find("critical", "rules", "A dead unit attacked", W && W.type, this.rp());
        if(this.dead.has(e.target)) A.find("major", "rules", "A dead unit was attacked", "", this.rp());
        const k = Math.min(9, Math.floor(e.chance/10)), c = A.m.calib[k] = A.m.calib[k] || { n:0, hits:0, pred:0 };
        if(e.chance < 100){ c.n++; c.pred += e.chance/100; if(e.hit) c.hits++; }
        this.src = e.id;
        break; }
      case "cast": this.src = e.id; break;
      case "aoe": if(e.fx === "rotburst") this.src = "burst"; else if(e.from) this.src = e.from; break;
      case "turn": this.src = null; break;
      case "damage": {
        if(!(e.amount > 0) || Math.round(e.amount) !== e.amount) A.find("major", "rules", "Damage event with a non-positive or fractional amount", String(e.amount), this.rp());
        const s = e.kind === "poison" ? null : this.src && this.who[this.src];
        if(s){ if(s.team === "squad") A.cls(s.cls).dmg += e.amount; else A.enemy(s.type).dmg += e.amount; }
        this.lastHitBy = s;
        break; }
      case "downed": if(W && W.team === "squad"){ A.cls(W.cls).downs++; if(this.lastHitBy && this.lastHitBy.team === "gloom") A.enemy(this.lastHitBy.type).downed++; } break;
      case "death":
        if(this.dead.has(e.id)) A.find("major", "rules", "A unit died twice", W && W.type, this.rp());
        this.dead.add(e.id);
        if(W && W.team === "squad") A.cls(W.cls).deaths++;
        if(W && W.team === "gloom"){ A.enemy(W.type).killed++; const s = this.src && this.who[this.src]; if(s && s.team === "squad") A.cls(s.cls).kills++; }
        break;
      case "lumen": if(!(e.value >= 0 && e.value <= b.lumenMax)) A.find("major", "rules", "Lumen out of range", String(e.value), this.rp()); break;
      case "tide": if(e.value < this.lastTide) A.find("major", "rules", "The Gloom Tide went down", e.value + " < " + this.lastTide, this.rp()); this.lastTide = e.value; break;
      case "end": this.ended = true; if(++this.ends > 1) A.find("major", "events", "The battle ended twice", "", this.rp()); break;
    }
  }

  /* ---- feel: the experience behind the numbers ----
     Estimated screen time per event mirrors view.js (hidden units' moves are instant). */
  feel(e){
    const F = this.A.m.feel, W = e.id ? this.who[e.id] : null, shown = id=> !id || (this.who[id] && this.who[id].team === "squad") || this.seenNow.has(id);
    const SEC = { turn:0.7, focus:0.38, step:0.15, attack:0.6, death:0.45, aoe:0.42, cast:0.4, heal:0.35, overwatch:0.25, activate:0.7, tideStep:1.1, spawn:0.35, reveal:0.6, chorus:0.9, harvest:0.5 };
    if(SEC[e.type] && (e.type !== "step" && e.type !== "focus" || shown(e.id))) this.turnSec += e.type === "aoe" && e.fx === "pod" ? 1.0 : SEC[e.type];
    switch(e.type){
      case "vis": this.seenNow = new Set(e.seen);
        if(this.contact === null && e.seen.some(id=> this.who[id] && !(GS.ENEMIES[this.who[id].type] || {}).structure)) this.contact = this.round; break;
      case "turn":
        if(this.started) (this.team === "gloom" ? F.enemyTurnSec : F.squadTurnSec).push(this.turnSec);
        this.started = true;
        this.team = e.team; this.round = e.round; this.turnSec = 0; break;
      case "reveal": F.revealBy[this.lastSquadAttack ? "attack" : "spotted"]++; break;
      case "cast": this.srcAb = e.ability; break;
      case "attack": {
        this.srcAb = e.ability;
        const T = this.who[e.target];
        if(W && W.team === "gloom" && T && T.team === "squad"){ F.gloomHits += e.hit ? 1 : 0; if(e.hit && !this.seenNow.has(e.id)) F.unseenHits++; }
        if(W && W.team === "squad"){
          this.lastSquadAttack = true;
          if(e.reaction !== "overwatch" && e.chance < 100){
            if(this.firstShot){ this.firstShot = false; F.firstShots++; if(!e.hit && e.chance >= 60) F.firstShotMiss++; }
            if(!e.hit && e.chance >= 60){ this.streak++; this.longest = Math.max(this.longest, this.streak); } else if(e.hit) this.streak = 0;
          }
        }
        if(e.reaction === "overwatch" && W){ const o = F.owShots[W.team]; o.n++; if(e.hit) o.hit++; }
        if(W && W.team === "squad" && e.hit){ const d = F.abilityDmg[e.ability] = F.abilityDmg[e.ability] || { uses:0, dmg:0 }; d.dmg += e.dmg; }
        if(W && W.team === "squad"){ const d = F.abilityDmg[e.ability] = F.abilityDmg[e.ability] || { uses:0, dmg:0 }; d.uses++; }
        break; }
      case "damage": {
        const S = this.src && this.who[this.src];
        if(S && S.team === "squad" && this.srcAb && this.lastType === "cast-dmg"){ const d = F.abilityDmg[this.srcAb] = F.abilityDmg[this.srcAb] || { uses:0, dmg:0 }; d.dmg += e.amount; }
        break; }
      case "downed": case "death":
        if(W && W.team === "squad" && this.contact !== null && this.round <= this.contact + 1) this.early = true;
        break;
    }
    if(e.type === "cast"){ this.lastType = "cast-dmg"; const S = this.who[e.id]; if(S && S.team === "squad"){ const d = F.abilityDmg[e.ability] = F.abilityDmg[e.ability] || { uses:0, dmg:0 }; d.uses++; } }
    else if(e.type === "attack" || e.type === "turn") this.lastType = e.type;
    if(e.type === "end") this.finish();
  }
  finish(){
    if(this.done) return; this.done = true;
    const F = this.A.m.feel;
    F.battles++; F.contact.push(this.contact === null ? 99 : this.contact); F.streaks.push(this.longest);
    if(this.early) F.earlyLosses++;
  }

  /* the state after every action */
  check(label){
    const A = this.A, b = this.b, seen = new Map();
    for(const u of b.units){
      if(u.dead) continue;
      const tag = (u.cls || u.type) + " (" + label + ")";
      for(const k of ["hp", "maxHp", "ap", "aim", "def", "armor", "mob"]) if(!Number.isFinite(u[k])) A.find("critical", "rules", "A unit's " + k + " is not a number", tag, this.rp());
      if(u.hp > u.maxHp) A.find("major", "rules", "HP above max", tag + " " + u.hp + "/" + u.maxHp, this.rp());
      if(u.hp < 0) A.find("major", "rules", "Negative HP on a living unit", tag, this.rp());
      if(u.hp === 0 && !u.downed && !u.structure) A.find("major", "rules", "A unit at 0 HP is neither down nor dead", tag, this.rp());
      if(u.ap < 0) A.find("major", "rules", "Negative AP", tag, this.rp());
      if(u.ap > u.maxAp + 3) A.find("minor", "rules", "AP piled far above max", tag + " " + u.ap, this.rp());
      if(u.armor < 0) A.find("major", "rules", "Negative armour", tag, this.rp());
      if(!Grid.inBounds(b.map, u.x, u.y)) A.find("critical", "rules", "A unit is off the map", tag, this.rp());
      else if(!Grid.passable(b.map, u.x, u.y)) A.find("critical", "rules", "A unit stands inside a blocked tile", tag, this.rp());
      const k = u.x + "," + u.y;
      if(seen.has(k)) A.find("critical", "rules", "Two units on one tile", tag + " and " + seen.get(k), this.rp());
      seen.set(k, u.cls || u.type);
      Object.keys(u.statuses).forEach(s=>{ if(!GS.STATUS[s]) A.find("major", "rules", "Unknown status '" + s + "'", tag, this.rp()); else if(!(u.statuses[s].turns >= 1)) A.find("minor", "rules", "A status lingering with no turns left", s, this.rp()); });
      Object.keys(u.cooldowns).forEach(c=>{ if(u.cooldowns[c] < 0) A.find("minor", "rules", "Negative cooldown", c, this.rp()); });
      Object.keys(u.charges).forEach(c=>{ if(u.charges[c] < 0) A.find("major", "rules", "Negative charges (used something it didn't have)", c, this.rp()); });
      if(u.weapon && u.weapon.clip && (u.ammo < 0 || u.ammo > u.weapon.clip)) A.find("major", "rules", "Ammo out of range", tag + " " + u.ammo + "/" + u.weapon.clip, this.rp());
    }
    if(!(b.lumen >= 0 && b.lumen <= b.lumenMax)) A.find("major", "rules", "Lumen out of range", String(b.lumen), this.rp());
    if(b.round < this.lastRound) A.find("major", "rules", "The round counter went backwards", "", this.rp());
    this.lastRound = b.round;
    // the battle is over exactly when it should be
    const able = b.squad().some(u=> !u.downed), T = b.mission.type, g = b.gloom();
    const won = T === "purge" ? !g.length : T === "heart" ? !g.some(u=> u.type === "heart") : !g.some(u=> u.type === "sporelord");
    if(!b.over && !able) A.find("critical", "softlock", "Every warden is down but the battle isn't over", label, this.rp());
    if(!b.over && won) A.find("critical", "softlock", "The objective is done but the battle isn't over", label, this.rp());
    if(b.over === "victory" && !won) A.find("critical", "rules", "Victory declared with the objective unfinished", label, this.rp());
  }
};

/* ---- contracts: an illegal move must be refused, and must change nothing ---- */
Ghost.stateHash = function(b){
  return JSON.stringify([b.units.map(u=> [u.id, u.x, u.y, u.hp, u.ap, u.dead, u.downed, u.ammo, u.overwatch, Object.keys(u.statuses).sort(), u.charges, u.cooldowns]),
    b.lumen, b.tide, b.concealed, b.team, b.round, b.over, b.events.length, b.map.tiles.filter(t=> t.prop).length]);
};
Ghost.contract = function(audit, watch){
  return (b, fn)=>{
    const before = Ghost.stateHash(b);
    let r;
    try{ r = fn(); }catch(err){ audit.find("major", "crash", "Illegal action threw instead of being refused: " + err.message, "", watch.rp()); return; }
    const after = Ghost.stateHash(b);
    if(r && r.result) audit.find("critical", "contract", "An illegal action was accepted (#" + r.which + ")", Ghost.ILLEGAL[r.which], watch.rp());
    else if(before !== after) audit.find("major", "contract", "A refused action still changed the battle (#" + r.which + ")", Ghost.ILLEGAL[r.which], watch.rp());
  };
};
Ghost.ILLEGAL = ["shoot a friend", "shoot a corpse or nothing", "shoot a bare tile", "mortar off the map", "use a made-up ability", "move to where you stand",
  "move off the map", "move into a boulder", "move onto another unit", "act for the other side", "heal an enemy", "sing a made-up song", "fire with 0 AP"];

})(typeof window !== "undefined" ? window : globalThis);
