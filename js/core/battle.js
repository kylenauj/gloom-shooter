/* ------------------------------------------------------------------ *
 *  The battle: one clearing, one squad, the Gloom, and the rules.
 *
 *  Everything resolves at once, in logic, and writes what happened to
 *  an event list. The view plays those events back with animation;
 *  the logic never waits on it. That keeps the rules testable headless
 *  and the AI free to think as fast as it likes.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS, Grid = GS.Grid;

/* ---- building units ---------------------------------------------------- */
GS.weaponStats = function(id, tier, mods){
  const W = GS.WEAPONS[id], T = GS.WEAPON_TIERS[tier || 0];
  const w = Object.assign({}, W, { id, tier:tier || 0, dmg:[W.dmg[0] + T.dmg, W.dmg[1] + T.dmg], aim:T.aim, crit:W.crit + T.crit, graze:0,
    name:(tier ? T.name + " " : "") + W.name });
  (mods || []).forEach(m=>{ const M = GS.MODS[m]; if(!M) return;
    if(M.aim) w.aim += M.aim; if(M.clip && w.clip) w.clip += M.clip; if(M.crit) w.crit += M.crit; if(M.graze) w.graze += M.graze; });
  return w;
};

/* a trooper from the roster, kitted out with whatever the Hollow has researched */
GS.makeSquadUnit = function(spec, camp){
  camp = camp || {};
  const C = GS.CLASSES[spec.cls], A = GS.ARMOR_TIERS[camp.armorTier || 0], Q = GS.QUIRKS[spec.quirk] || {};
  const rank = spec.rank || 0;
  const abilities = C.base.slice().concat(spec.picks || []);
  const flags = {}, stats = { hp:0, armor:0, mob:0 };
  abilities.forEach(a=>{ const D = GS.ABILITIES[a]; if(!D) return;
    if(D.flags) Object.keys(D.flags).forEach(k=> flags[k] = (typeof D.flags[k] === "number" ? (flags[k] || 0) + D.flags[k] : D.flags[k]));
    if(D.stats) Object.keys(D.stats).forEach(k=> stats[k] += D.stats[k]); });
  const weapon = GS.weaponStats(C.weapon, camp.weaponTier || 0, spec.mods);
  const maxHp = C.hp + A.hp + rank + stats.hp + (Q.hp || 0);
  const u = {
    id:spec.id || GS.uid("s"), rosterId:spec.rosterId || spec.id, team:"squad", type:spec.cls, cls:spec.cls, name:spec.name || C.name,
    rank, x:0, y:0, maxHp, hp:Math.min(maxHp, spec.hp !== undefined ? spec.hp : maxHp),
    armor:A.armor + stats.armor, aim:C.aim + rank*5 + (Q.aim || 0), def:C.def + A.def + (Q.def || 0), mob:C.mob + stats.mob,
    sight:C.sight, maxAp:4, ap:4, weapon, ammo:weapon.clip, abilities, flags, item:spec.item || null,
    armorTier:camp.armorTier || 0, quirk:spec.quirk || null
  };
  u.charges = {};
  if(abilities.includes("mortar")) u.charges.mortar = 2 + (flags.mortarCharges || 0);
  if(abilities.includes("rebirth")) u.charges.rebirth = 1;
  if(u.item && GS.ITEMS[u.item]) u.charges["item:" + u.item] = GS.ITEMS[u.item].charges;
  return u;
};
GS.makeEnemyUnit = function(type){
  const E = GS.ENEMIES[type];
  return {
    id:GS.uid("g"), team:"gloom", type, name:E.name, x:0, y:0, maxHp:E.hp, hp:E.hp, armor:E.armor, aim:E.aim, def:E.def, mob:E.mob,
    sight:E.sight, maxAp:E.ap, ap:E.ap, weapon:E.weapon ? Object.assign({ aim:0, graze:0, clip:0 }, E.weapon) : null, ammo:0,
    abilities:(E.abilities || []).slice(), flags:{}, charges:{}, ai:E.ai, boss:!!E.boss, structure:!!E.structure, active:true
  };
};
function fresh(u){
  Object.assign(u, { statuses:{}, cooldowns:{}, overwatch:0, moved:false, overclocked:false, reacted:false, refunded:false,
    downed:false, stable:false, bleed:0, dead:false, kills:0, xp:0, secondWindUsed:false });
  return u;
}

/* ---- the battle ---------------------------------------------------------- */
class Battle {
  constructor(cfg){
    this.map = cfg.map;
    this.mission = cfg.mission || { type:"purge", name:"Purge" };
    this.rng = GS.RNG(cfg.seed || 7);
    this.mods = Object.assign({ lumenStart:0, critVsGloom:0, chorus:["glowHymn"], threat:2 }, cfg.mods);
    this.units = [];
    this.events = [];
    this.round = 1;
    this.team = "squad";
    this.over = null;
    this.tide = 0; this.tideAim = 0; this.tideDmg = 0; this.tideStep = 0;
    this.lumenMax = 10;
    this.concealed = cfg.concealed !== false;
    this.chorusUsed = {};
    this.samples = 0;
    this.podsSeen = new Set();
    this.seen = new Set();
    this.fog = new Uint8Array(this.map.w*this.map.h);

    (cfg.squad || []).forEach((u, i)=>{ fresh(u); const s = this.map.spawn[i % this.map.spawn.length]; u.x = s.x; u.y = s.y; this.units.push(u); });
    (cfg.enemies || []).forEach(e=>{ const u = fresh(e.unit || GS.makeEnemyUnit(e.type)); u.x = e.x; u.y = e.y; u.pod = e.pod;
      u.home = { x:e.x, y:e.y }; u.active = e.pod === undefined || e.pod === null ? true : false; if(u.structure) u.active = true; this.units.push(u); });

    let glow = 0; this.squad().forEach(u=>{ if(u.quirk && GS.QUIRKS[u.quirk].lumen) glow += GS.QUIRKS[u.quirk].lumen; });
    this.lumen = Math.min(this.lumenMax, 2 + this.mods.lumenStart + glow);
    this.refreshVision(true);
    this.emit({ type:"turn", team:"squad", round:1 });
    this.log("The squad lands in " + (this.mission.where || "the clearing") + (this.concealed ? ", unseen." : "."), "sys");
  }

  /* ---- bookkeeping ---- */
  emit(e){ this.events.push(e); }
  drain(){ const e = this.events; this.events = []; return e; }
  log(text, cls){ this.emit({ type:"log", text, cls:cls || "" }); }
  unit(id){ return this.units.find(u=> u.id === id); }
  alive(u){ return u && !u.dead; }
  able(u){ return u && !u.dead && !u.downed; }
  squad(){ return this.units.filter(u=> u.team === "squad" && !u.dead); }
  gloom(){ return this.units.filter(u=> u.team === "gloom" && !u.dead); }
  foesOf(u){ return this.units.filter(v=> v.team !== u.team && this.able(v)); }
  friendsOf(u){ return this.units.filter(v=> v.team === u.team && this.able(v)); }
  unitAt(x, y){ return this.units.find(u=> !u.dead && u.x === x && u.y === y); }
  tileH(x, y){ const t = this.map.at(x, y); return t ? t.h : 0; }
  occupiedBy(self){ return (x, y)=> this.units.some(u=> u !== self && !u.dead && u.x === x && u.y === y); }

  /* ---- statuses and derived stats ---- */
  statSum(u, k){ let s = 0; for(const n in u.statuses){ const S = GS.STATUS[n]; if(S && S[k]) s += S[k]; } return s; }
  has(u, s){ return !!u.statuses[s]; }
  addStatus(u, s, turns){
    if(!this.alive(u) || u.structure) return;
    const had = !!u.statuses[s];
    u.statuses[s] = { turns:Math.max(turns, u.statuses[s] ? u.statuses[s].turns : 0) };
    if(!had) this.emit({ type:"status", id:u.id, s, on:true });
  }
  dropStatus(u, s){ if(u.statuses[s]){ delete u.statuses[s]; this.emit({ type:"status", id:u.id, s, on:false }); } }
  aimOf(u){ return u.aim + (u.weapon ? u.weapon.aim : 0) + this.statSum(u, "aim") + (u.team === "gloom" ? this.tideAim : 0); }
  armorOf(u){ return Math.max(0, u.armor + this.statSum(u, "armor")); }
  defOf(u){
    let aura = 0;
    this.friendsOf(u).forEach(v=>{ if(v !== u && v.flags.aura && Math.abs(v.x - u.x) <= 1 && Math.abs(v.y - u.y) <= 1) aura = Math.max(aura, v.flags.aura); });
    return u.def + this.statSum(u, "def") + aura;
  }

  /* ---- vision ----------------------------------------------------------
     The squad sees what any of them can see. The fog grid is for the view:
     2 seen now, 1 seen before, 0 never.                                  */
  sees(a, b, range){ return Grid.canSee(this.map, a.x, a.y, b.x, b.y, range); }
  refreshVision(quiet){
    const eyes = this.squad().filter(u=> !u.downed), M = this.map, old = this.fog.slice();
    for(let i=0;i<this.fog.length;i++) if(this.fog[i] === 2) this.fog[i] = 1;
    eyes.forEach(u=>{
      const r = u.sight;
      for(let y=Math.max(0, u.y-r); y<=Math.min(M.h-1, u.y+r); y++) for(let x=Math.max(0, u.x-r); x<=Math.min(M.w-1, u.x+r); x++){
        const i = y*M.w + x; if(this.fog[i] === 2) continue;
        if(Grid.canSee(M, u.x, u.y, x, y, r)) this.fog[i] = 2;
      }
    });
    const seen = new Set();
    this.gloom().forEach(g=>{ if(g.structure ? this.fog[g.y*M.w + g.x] >= 1 : eyes.some(u=> this.sees(u, g, u.sight))) seen.add(g.id); });
    let changed = seen.size !== this.seen.size || [...seen].some(id=> !this.seen.has(id));
    for(let i=0;i<old.length && !changed;i++) if(old[i] !== this.fog[i]) changed = true;
    this.seen = seen;
    if(quiet || changed) this.emit({ type:"vis", seen:[...seen], fog:Array.from(this.fog) });
  }
  visible(u){ return u.team === "squad" || this.seen.has(u.id); }

  /* ---- concealment and pods (XCOM 2) -------------------------------------
     Dormant pods don't act. While the squad is concealed they only notice
     a trooper who walks right up to them; once concealment breaks, any pod
     that can see a trooper wakes and scrambles for cover.               */
  detect(){
    let woke = false;
    const sq = this.squad().filter(u=> !u.downed);
    if(this.concealed){
      const spotted = this.gloom().some(g=> !g.structure && sq.some(s=> Math.hypot(g.x - s.x, g.y - s.y) <= 3.5 && this.sees(g, s)));
      if(spotted) this.reveal("spotted");
      return;
    }
    const pods = new Set();
    this.gloom().forEach(g=>{ if(!g.active && sq.some(s=> this.sees(g, s, g.sight))) pods.add(g.pod); });
    pods.forEach(p=>{ this.activatePod(p); woke = true; });
    return woke;
  }
  reveal(why){
    if(!this.concealed) return;
    this.concealed = false;
    this.emit({ type:"reveal" });
    this.log(why === "spotted" ? "A Gloom creature spots the squad. Concealment broken!" : "Concealment broken!", "warn");
    this.detect();
  }
  activatePod(pod){
    const members = this.gloom().filter(g=> g.pod === pod && !g.active);
    if(!members.length) return;
    members.forEach(g=> g.active = true);
    this.emit({ type:"activate", ids:members.map(g=> g.id) });
    this.log(members.length > 1 ? members.length + " Gloom creatures stir and scatter for cover." : "A " + members[0].name + " stirs.", "warn");
    members.forEach(g=>{ if(!this.over && this.able(g)) GS.AI.scamper(this, g); });
  }

  /* ---- movement ---------------------------------------------------------- */
  moveBudget(u){ return this.has(u, "rooted") ? 0 : u.ap*u.mob; }
  reach(u, budget){ return Grid.reach(this.map, u.x, u.y, budget === undefined ? this.moveBudget(u) : budget, this.occupiedBy(u)); }
  apForCost(u, cost){ return cost <= 0 ? 0 : Math.ceil(cost/u.mob - 1e-6); }
  moveCost(u, x, y, R){
    R = R || this.reach(u);
    const c = R.cost[y*this.map.w + x];
    return c === Infinity ? null : { cost:c, ap:this.apForCost(u, c), path:Grid.pathFrom(R, x, y) };
  }
  move(u, x, y, opts){
    opts = opts || {};
    if(this.over || !this.able(u) || (u.team !== this.team && !opts.free)) return false;
    const m = this.moveCost(u, x, y, opts.R);
    if(!m || !m.path || !m.path.length) return false;
    if(!opts.free){ if(m.ap > u.ap) return false; u.ap -= m.ap; }
    u.moved = true;
    for(const s of m.path){
      if(this.unitAt(s.x, s.y)) break;          // (something moved into the way: stop short)
      u.x = s.x; u.y = s.y;
      this.emit({ type:"step", id:u.id, x:s.x, y:s.y, h:this.tileH(s.x, s.y) });
      const t = this.map.at(s.x, s.y);
      if(t.hazard === "rot" && u.team === "squad" && !this.has(u, "poison")){ this.log(u.name + " wades through rot.", "bad"); this.addStatus(u, "poison", 2); }
      if(u.team === "squad") { this.refreshVision(); this.detect(); }
      else if(this.concealed) this.detect();
      this.reactions(u);
      if(!this.able(u) || this.over) break;
    }
    if(u.team === "gloom") this.refreshVision();
    this.checkOver();
    return true;
  }

  /* overwatch, Thorn Ward and Riposte: things that happen to a unit as it moves */
  reactions(mover){
    for(const w of this.foesOf(mover)){
      if(!this.able(mover) || this.over) return;
      if(w.team === "gloom" && !w.active) continue;
      const d = Math.hypot(w.x - mover.x, w.y - mover.y);
      if(w.overwatch > 0 && w.weapon && d <= w.weapon.range && this.sees(w, mover, Math.max(w.sight, w.weapon.melee ? 2 : 0)) && (!w.weapon.clip || w.ammo > 0)){
        w.overwatch--;
        if(w.overwatch <= 0) this.emit({ type:"overwatch", id:w.id, on:false });
        this.attack(w, mover, { reaction:"overwatch", aimMod:w.flags.owNoPenalty ? 0 : -15 });
        if(w.weapon.clip) w.ammo = Math.max(0, w.ammo - 1);
        continue;
      }
      if(!w.reacted && d < 1.5 && w.flags.thornWard && w.weapon && w.weapon.melee){
        w.reacted = true; this.attack(w, mover, { reaction:"thornWard" });
      } else if(!w.reacted && d < 1.5 && w.flags.riposte && w.weapon && !w.weapon.melee && (!w.weapon.clip || w.ammo > 0)){
        w.reacted = true; this.attack(w, mover, { reaction:"riposte" }); if(w.weapon.clip) w.ammo--;
      }
    }
  }

  /* ---- what a unit can do -------------------------------------------------- */
  apCost(u, ab){
    if(ab.ap === "weapon") return u.weapon ? u.weapon.ap : 2;
    if(ab.ap === "weapon+1") return (u.weapon ? u.weapon.ap : 2) + 1;
    if(ab.ap === "rest") return Math.max(ab.minAp || 1, u.ap);
    return ab.ap || 0;
  }
  defOfAction(id){
    if(id.startsWith("item:")) return GS.ITEMS[id.slice(5)];
    return GS.ABILITIES[id];
  }
  /* every button the HUD might show for this unit, enabled or with the reason it isn't */
  actionsFor(u){
    const out = [], add = (id, D, extra)=>{
      const a = Object.assign({ id, name:D.name, icon:D.icon, def:D, ap:this.apCost(u, D), lumen:D.lumen || 0 }, extra || {});
      a.reason = this.cannot(u, id, D);
      a.enabled = !a.reason;
      out.push(a);
    };
    const W = u.weapon;
    add("fire", GS.ABILITIES.fire, W && W.melee ? { name:"Strike", icon:"blade" } : {});
    if(W && !W.melee) add("aimed", GS.ABILITIES.aimed);
    u.abilities.forEach(a=>{ const D = GS.ABILITIES[a]; if(D && !D.passive) add(a, D); });
    if(u.item) add("item:" + u.item, GS.ITEMS[u.item]);
    if(W && !W.melee) add("overwatch", GS.ABILITIES.overwatch);
    add("hunker", GS.ABILITIES.hunker);
    if(W && W.clip) add("reload", GS.ABILITIES.reload);
    add("overclock", GS.ABILITIES.overclock);
    if(this.map.nodes.some(n=> !n.harvested && Math.abs(n.x - u.x) <= 1 && Math.abs(n.y - u.y) <= 1)) add("harvest", GS.ABILITIES.harvest);
    if(this.squad().some(v=> v.downed && !v.stable && Math.abs(v.x - u.x) <= 1 && Math.abs(v.y - u.y) <= 1)) add("stabilize", GS.ABILITIES.stabilize);
    // passives: shown, never pressed
    u.abilities.forEach(a=>{ const D = GS.ABILITIES[a]; if(D && D.passive) out.push({ id:a, name:D.name, icon:D.icon, def:D, passive:true, enabled:false }); });
    return out;
  }
  cannot(u, id, D){
    D = D || this.defOfAction(id);
    if(!D) return "Unknown";
    if(this.over) return "Battle over";
    if(u.team !== this.team) return "Not your turn";
    if(!this.able(u)) return "Down";
    const ap = this.apCost(u, D);
    if(id === "overwatch" && u.ap < (D.minAp || 1)) return "Needs " + D.minAp + " AP";
    if(u.ap < ap) return "Needs " + ap + " AP";
    if((D.lumen || 0) > this.lumen) return "Needs " + D.lumen + " Lumen";
    if(u.cooldowns[id] > 0) return "Ready in " + u.cooldowns[id];
    const ck = id.startsWith("item:") ? id : (D.charges ? id : null);
    if(ck && !(u.charges[ck] > 0)) return "None left";
    if((D.ammo || id === "overwatch") && u.weapon && u.weapon.clip && u.ammo < (D.ammo || 1)) return "Reload first";
    if(id === "reload" && u.ammo >= u.weapon.clip) return "Full";
    if(id === "overclock" && u.overclocked) return "Already overclocked";
    if(D.attack || D.target === "enemy"){ if(!this.targetsFor(u, id).length) return "No target"; }
    if(D.target === "adjacent" && !this.foesOf(u).some(v=> this.adjacent(u, v) && this.visible(v))) return "No one adjacent";
    return null;
  }
  adjacent(a, b){ return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1; }

  /* can `u` (standing at `from`) use attack ability `id` on `t`? null if so, else why not */
  attackBlock(u, t, id, from){
    const D = this.defOfAction(id), W = u.weapon, p = from || u;
    if(!this.able(t) || t.team === u.team) return "Not a target";
    if(u.team === "squad" && !this.visible(t)) return "Not visible";
    if(u.team === "gloom" && !t.structure && t.downed) return "Down";
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    if(D.attack){
      if(!W) return "No weapon";
      if(D.ranged && W.melee) return "Melee weapon";
      const reach = (D.attack.reach || W.range);
      if(d > reach + 1e-6) return "Out of range";
      if(W.melee) return Grid.canSee(this.map, p.x, p.y, t.x, t.y) ? null : "Blocked";
      if(!Grid.canSee(this.map, p.x, p.y, t.x, t.y)) return "No line of sight";
      if(d > u.sight && !(u.flags.squadsight && this.visible(t))) return "Beyond sight";
      return null;
    }
    // spells on an enemy
    if(d > (D.range || 1.5) + 1e-6) return "Out of range";
    if(D.los && !Grid.canSee(this.map, p.x, p.y, t.x, t.y)) return "No line of sight";
    return null;
  }
  targetsFor(u, id){
    const D = this.defOfAction(id);
    if(!D) return [];
    switch(D.target){
      case "enemy": {
        const melee = D.attack && u.weapon && u.weapon.melee && !D.attack.reach;
        const R = melee ? this.reach(u, Math.max(0, u.ap - this.apCost(u, D))*u.mob) : null;
        return this.units.filter(t=> t.team !== u.team && !t.dead && (!this.attackBlock(u, t, id) || (melee && this.meleePlan(u, t, id, R))));
      }
      case "ally": return this.units.filter(t=> t.team === u.team && !t.dead && (!t.downed || D.allowDowned) && Math.hypot(t.x - u.x, t.y - u.y) <= (D.range || 1.5) + 1e-6);
      case "allyOther": return this.units.filter(t=> t !== u && t.team === u.team && this.able(t) && Math.hypot(t.x - u.x, t.y - u.y) <= (D.range || 1.5) + 1e-6);
      case "downed": return this.units.filter(t=> t.team === u.team && t.downed && !t.dead && (id !== "stabilize" || !t.stable) && Math.hypot(t.x - u.x, t.y - u.y) <= (D.range || 1.5) + 1e-6);
      case "node": return this.map.nodes.filter(n=> !n.harvested && Math.abs(n.x - u.x) <= 1 && Math.abs(n.y - u.y) <= 1);
      default: return [];
    }
  }
  /* where to stand to hit `t` in melee this turn: the cheapest open tile next to
     it that still leaves AP for the blow (cover breaks ties) */
  meleePlan(u, t, id, R){
    const D = this.defOfAction(id), W = u.weapon;
    if(!W || !W.melee || !this.able(t) || t.team === u.team) return null;
    if(u.team === "squad" && !this.visible(t)) return null;
    if(u.team === "gloom" && t.downed) return null;
    const left = u.ap - this.apCost(u, D);
    if(left < 0) return null;
    R = R || this.reach(u, left*u.mob);
    let best = null;
    for(const [dx, dy] of GS.DIRS8){
      const x = t.x + dx, y = t.y + dy;
      if(!Grid.passable(this.map, x, y) || (this.unitAt(x, y) && !(x === u.x && y === u.y))) continue;
      const c = R.cost[y*this.map.w + x];
      if(c === Infinity) continue;
      const ap = this.apForCost(u, c);
      if(ap > left || !Grid.canSee(this.map, x, y, t.x, t.y)) continue;
      const score = ap*10 - Grid.coverSides(this.map, x, y).reduce((s, k)=> s + k.cover, 0);
      if(!best || score < best.score) best = { x, y, ap, score };
    }
    return best;
  }
  tileOK(u, id, x, y){
    const D = this.defOfAction(id);
    if(!Grid.inBounds(this.map, x, y)) return "Off the map";
    if(Math.hypot(x - u.x, y - u.y) > D.range + 1e-6) return "Out of range";
    if(!D.lobbed && !Grid.canSee(this.map, u.x, u.y, x, y)) return "No line of sight";
    return null;
  }
  unitsInRadius(x, y, r){ return this.units.filter(v=> !v.dead && Math.hypot(v.x - x, v.y - y) <= r + 1e-6); }

  /* ---- the to-hit sum, laid out the way the HUD prints it --------------- */
  hitInfo(u, t, opts){
    opts = opts || {};
    const W = u.weapon, p = opts.from || u, D = opts.ability ? this.defOfAction(opts.ability) : null, A = Object.assign({}, D && D.attack, opts.attack);
    const rows = [], d = Math.hypot(p.x - t.x, p.y - t.y);
    let chance = this.aimOf(u); rows.push(["Aim", chance]);
    if(W.melee){ if(W.aimBonus){ chance += W.aimBonus; rows.push(["Melee", W.aimBonus]); } }
    else {
      let rm = 0; for(const r of (W.rangeMods || [])){ if(d <= r[0] + 1e-6){ rm = r[1]; break; } rm = r[1]; }
      if(rm) { chance += rm; rows.push(["Range", rm]); }
      if(u.flags.squadsight && d > u.sight){ const pen = -2*Math.ceil(d - u.sight); chance += pen; rows.push(["Squadsight", pen]); }
    }
    const am = (A.aimMod || 0) + (opts.aimMod || 0);
    if(am){ chance += am; rows.push([opts.reaction === "overwatch" ? "Overwatch" : (A.aimMod > 0 ? "Aimed" : "Ability"), am]); }
    if(this.tileH(p.x, p.y) > this.tileH(t.x, t.y)){ chance += 10; rows.push(["High ground", 10]); }
    if(u.flags.steady && !u.moved && !opts.from){ chance += 10; rows.push(["Steady", 10]); }
    const def = this.defOf(t); if(def){ chance -= def; rows.push(["Defence", -def]); }
    let cover = 0;
    if(!W.melee && !A.ignoreCover && !t.structure){
      cover = Grid.coverAgainst(this.map, t.x, t.y, p.x, p.y);
      if(cover){ const c = (cover === 2 ? 40 : 20)*(this.statSum(t, "coverMult") || 1); chance -= c; rows.push([(cover === 2 ? "Full" : "Half") + " cover", -c]); }
    }
    const flanked = !t.structure && !W.melee && Grid.coverAgainst(this.map, t.x, t.y, p.x, p.y) === 0 && Grid.coverSides(this.map, t.x, t.y).length > 0;
    const exposed = !t.structure && Grid.coverAgainst(this.map, t.x, t.y, p.x, p.y) === 0;
    chance = A.guaranteed ? 100 : GS.clamp(Math.round(chance), 5, 100);
    let crit = W.crit + (exposed && !W.melee ? 40 : 0) + (u.flags.steady && !u.moved && !opts.from ? 10 : 0);
    if(u.team === "squad" && t.team === "gloom") crit += this.mods.critVsGloom;
    crit = t.structure ? 0 : GS.clamp(crit, 0, 100);
    let lo = W.dmg[0], hi = W.dmg[1], bonus = this.statSum(u, "dmg") + (u.team === "gloom" ? this.tideDmg : 0);
    if(u.flags.pointBlank && d <= 2.9) bonus += u.flags.pointBlank;
    if(u.flags.execute && t.hp < t.maxHp/2) bonus += u.flags.execute;
    lo += bonus; hi += bonus;
    const mult = A.dmgMult || 1;
    const dmgType = A.dmgType || W.dmgType;
    const arm = (dmgType === "glow") ? 0 : this.armorOf(t);
    return { chance, crit, dmg:[Math.max(0, Math.round(lo*mult) - arm), Math.max(0, Math.round(hi*mult) - arm)], raw:[lo, hi], mult,
             armor:arm, rows, cover, flanked, exposed, dmgType, dist:d };
  }

  /* ---- attacks ------------------------------------------------------------- */
  attack(u, t, opts){
    opts = opts || {};
    const W = u.weapon, D = opts.ability ? this.defOfAction(opts.ability) : null, A = Object.assign({}, D && D.attack, opts.attack);
    const info = this.hitInfo(u, t, opts);
    if(t.team === "gloom" && !t.active) this.activatePodLater = t.pod;
    const hit = info.chance >= 100 || this.rng.next()*100 < info.chance;
    const crit = hit && this.rng.next()*100 < info.crit;
    let dmg = 0;
    if(hit){
      dmg = this.rng.int(info.raw[0], info.raw[1]) + (crit ? W.critDmg : 0);
      dmg = Math.max(0, Math.round(dmg*info.mult) - info.armor);
    } else if(W.graze) dmg = W.graze;
    this.emit({ type:"attack", id:u.id, target:t.id, x:t.x, y:t.y, hit, crit, dmg, chance:info.chance, fx:W.fx, melee:!!W.melee,
                dmgType:info.dmgType, reaction:opts.reaction || null, ability:opts.ability || "fire" });
    const who = u.name, tn = t.name;
    const tag = opts.reaction === "overwatch" ? "Overwatch: " : opts.reaction ? "Reaction: " : "";
    if(hit) this.log(tag + who + (crit ? " CRITS " : " hits ") + tn + " for " + dmg + (info.armor && dmg === 0 ? " (armour absorbed it)" : "") + ".", u.team === "squad" ? "good" : "bad");
    else this.log(tag + who + " misses " + tn + " (" + info.chance + "%)" + (dmg ? ", grazes for " + dmg : "") + ".", "dim");
    if(hit && (A.shred || u.flags.shred) && !W.melee){ const s = (A.shred || 0) + (u.flags.shred || 0); if(t.armor > 0){ t.armor = Math.max(0, t.armor - s); this.log(tn + "'s armour is shredded.", "good"); } }
    if(dmg > 0) this.damage(t, dmg, { src:u, crit, kind:info.dmgType });
    if(hit && W.onHit && this.alive(t) && !t.downed) this.addStatus(t, W.onHit.s, W.onHit.turns);
    if(u.team === "squad") this.reveal();
    this.flushPods();
    return { hit, crit, dmg, killed:t.dead || t.downed };
  }

  /* ---- damage, death and the bleeding ---------------------------------------- */
  damage(t, n, o){
    o = o || {};
    if(!this.alive(t) || n <= 0) return;
    if(t.downed){ t.dead = true; this.emit({ type:"death", id:t.id }); this.log(t.name + " is gone.", "bad"); this.checkOver(); return; }
    t.hp -= n;
    this.emit({ type:"damage", id:t.id, amount:n, hp:Math.max(0, t.hp), crit:!!o.crit, kind:o.kind || "hit" });
    if(t.team === "gloom" && !t.active){ this.activatePodLater = t.pod; }
    if(t.hp > 0) return;
    if(t.team === "squad"){
      if(t.flags.secondWind && !t.secondWindUsed){ t.secondWindUsed = true; t.hp = 1; this.emit({ type:"heal", id:t.id, amount:0, hp:1 }); this.emit({ type:"bark", id:t.id, text:"Not yet!" }); this.log(t.name + " refuses to fall. Second Wind!", "good"); return; }
      t.hp = 0; t.overwatch = 0; t.statuses = {};
      if(this.rng.next() < 0.7){ t.downed = true; t.bleed = 3; this.emit({ type:"downed", id:t.id }); this.log(t.name + " is down and bleeding out!", "bad"); }
      else { t.dead = true; this.emit({ type:"death", id:t.id }); this.log(t.name + " has fallen.", "bad"); }
      this.refreshVision();
    } else {
      t.hp = 0; t.dead = true;
      this.emit({ type:"death", id:t.id });
      this.log(t.name + " is destroyed.", "good");
      const E = GS.ENEMIES[t.type];
      this.samples += E.samples || 0;
      if(o.src && o.src.team === "squad"){ o.src.kills++; o.src.xp += t.boss || t.structure ? 2 : 1; }
      this.gainLumen(1, "kill");
      if(E.deathBurst){
        const B = E.deathBurst;
        this.emit({ type:"aoe", x:t.x, y:t.y, radius:B.radius, fx:"rotburst" });
        this.log("The " + t.name + " bursts in a cloud of rot!", "warn");
        this.unitsInRadius(t.x, t.y, B.radius).forEach(v=>{ if(v === t || v.downed) return;
          this.damage(v, Math.max(0, this.rng.int(B.dmg[0], B.dmg[1]) - this.armorOf(v)), { kind:"spore" });
          if(this.able(v)) this.addStatus(v, B.status, B.turns); });
      }
    }
    this.checkOver();
  }
  heal(t, n){
    if(!this.alive(t) || t.structure) return;
    const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + n);
    this.emit({ type:"heal", id:t.id, amount:t.hp - before, hp:t.hp });
  }
  gainLumen(n, why){
    const before = this.lumen; this.lumen = GS.clamp(this.lumen + n, 0, this.lumenMax);
    if(this.lumen !== before) this.emit({ type:"lumen", value:this.lumen, delta:this.lumen - before, why });
  }

  /* ---- using an ability ---------------------------------------------------------
     target is a unit, a {x, y} tile, a node, or nothing (self). Returns true
     if it happened. */
  act(u, id, target){
    const D = this.defOfAction(id);
    const why = this.cannot(u, id, D);
    if(why) return false;
    const ap = this.apCost(u, D);

    // validate the target before anything is spent. A melee strike on someone out
    // of reach walks up to them first (the cheapest spot next to them).
    if(D.target === "enemy" || D.attack){
      if(!target || target.team === undefined) return false;
      if(this.attackBlock(u, target, id)){
        const plan = D.attack && this.meleePlan(u, target, id);
        if(!plan) return false;
        if(!this.move(u, plan.x, plan.y)) return false;
        if(!this.able(u) || this.over || this.attackBlock(u, target, id) || u.ap < ap) return this.after(u);
      }
    } else if(D.target === "tile"){
      if(!target || this.tileOK(u, id, target.x, target.y)) return false;
    } else if(D.target === "ally" || D.target === "allyOther" || D.target === "downed" || D.target === "node"){
      if(!target || !this.targetsFor(u, id).includes(target)) return false;
    }

    u.ap -= ap;
    if(D.lumen) this.gainLumen(-D.lumen, "spend");
    if(D.cooldown) u.cooldowns[id] = D.cooldown;     // ticks down at the start of each of this unit's turns
    const ck = id.startsWith("item:") ? id : (D.charges ? id : null);
    if(ck) u.charges[ck]--;
    if(D.ammo && u.weapon && u.weapon.clip) u.ammo = Math.max(0, u.ammo - D.ammo);
    let ends = !!D.endsTurn;

    switch(id){
      case "overwatch":
        u.overwatch = u.flags.owShots || 1; u.ap = 0;
        this.emit({ type:"overwatch", id:u.id, on:true }); this.log(u.name + " is on overwatch.");
        return this.after(u);
      case "reload":
        u.ammo = u.weapon.clip; this.emit({ type:"reload", id:u.id }); this.log(u.name + " reloads.", "dim");
        return this.after(u);
      case "overclock":
        u.overclocked = true; u.ap += 1; this.emit({ type:"overclock", id:u.id }); this.log(u.name + " burns Lumen: +1 AP.");
        return this.after(u);
      case "harvest":
        target.harvested = true;
        this.emit({ type:"harvest", id:u.id, x:target.x, y:target.y });
        this.log(u.name + " drains the glow node: +3 Lumen. The Gloom stirs (+1 Tide).", "good");
        this.gainLumen(3, "harvest"); this.raiseTide(1);
        return this.after(u);
      case "stabilize":
        target.stable = true; this.emit({ type:"stabilized", id:target.id }); this.log(u.name + " stabilizes " + target.name + ".", "good");
        return this.after(u);
    }

    if(D.attack){
      const W = u.weapon, isWeaponAp = D.ap === "weapon" || D.ap === "weapon+1";
      if(isWeaponAp && W.endsTurn) ends = true;
      if(u.weapon.clip && !D.ammo) u.ammo = Math.max(0, u.ammo - 1);
      const r = this.attack(u, target, { ability:id });
      this.afterKill(u, r, ends);
      if(r.killed && ((u.flags.serial && !W.melee) || (u.flags.momentum && W.melee)) && !u.refunded){ u.refunded = true; ends = false; u.ap += u.flags.serial ? 2 : 1; this.log(u.name + (u.flags.serial ? ": Serial Bloom!" : ": Momentum!"), "good"); }
      if(ends) u.ap = 0;
      return this.after(u);
    }

    // abilities with effects
    const loud = u.team === "squad" && (D.target === "enemy" || D.target === "tile" || D.target === "adjacent");
    this.emit({ type:"cast", id:u.id, ability:id, x:target && target.x !== undefined ? target.x : u.x, y:target && target.y !== undefined ? target.y : u.y, target:target && target.id });
    if(D.target === "adjacent"){
      this.foesOf(u).filter(v=> this.adjacent(u, v) && this.visible(v)).forEach(v=>{ if(this.able(v) && !this.over){ const r = this.attack(u, v, { ability:id }); this.afterKill(u, r); } });
    } else if(D.target === "tile"){
      let R = D.radius || 0;
      this.emit({ type:"aoe", x:target.x, y:target.y, radius:R, fx:id === "mortar" || id === "item:blastcap" ? "blast" : (D.effects.some(e=> e.dmgType === "spore") ? "spore" : "glow"), from:u.id });
      const hit = this.unitsInRadius(target.x, target.y, R).filter(v=> !v.downed && (D.friendly !== false || v.team !== u.team));
      hit.forEach(v=> this.applyEffects(u, D, v, id));
      D.effects.forEach(e=>{ if(e.t === "destroyCover"){
        for(let y=Math.floor(target.y - R); y<=Math.ceil(target.y + R); y++) for(let x=Math.floor(target.x - R); x<=Math.ceil(target.x + R); x++){
          if(Math.hypot(x - target.x, y - target.y) <= R + 1e-6 && Grid.smash(this.map, x, y)) this.emit({ type:"smash", x, y });
        } } });
      if(u.team === "squad") this.refreshVision();
      if(id === "mortar" && u.flags.salvo) ends = false;
    } else if(D.target === "self"){
      this.applyEffects(u, D, u, id);
    } else {
      this.applyEffects(u, D, target, id);
    }
    if(ends) u.ap = 0;
    if(loud) this.reveal();
    this.flushPods();
    return this.after(u);
  }
  afterKill(u, r){
    if(!r || !r.killed) return;
    if(u.flags.bloodsap && u.weapon.melee && this.able(u)){ this.heal(u, u.flags.bloodsap); }
  }
  flushPods(){ if(this.activatePodLater !== undefined){ const p = this.activatePodLater; this.activatePodLater = undefined; if(!this.over) this.activatePod(p); } }
  applyEffects(src, D, t, id){
    for(const e of D.effects || []){
      if(!this.alive(t) && e.t !== "summon") break;
      switch(e.t){
        case "status": if(!t.downed) this.addStatus(t, e.s, e.turns); break;
        case "statusAdjacentAllies": this.friendsOf(src).forEach(v=>{ if(v !== src && this.adjacent(v, src)) this.addStatus(v, e.s, e.turns); }); break;
        case "heal": if(!t.downed) this.heal(t, e.n); break;
        case "cleanse": Object.keys(t.statuses).forEach(s=>{ if(GS.STATUS[s].bad) this.dropStatus(t, s); }); break;
        case "ap": t.ap += e.n; this.emit({ type:"overclock", id:t.id }); this.log(t.name + " gains " + e.n + " AP.", "good"); break;
        case "damage": {
          let n = this.rng.int(e.dmg[0], e.dmg[1]);
          if(id === "mortar" && src.flags.mortarDmg) n += src.flags.mortarDmg;
          if(e.dmgType === "spore" && src.team === "gloom") n += this.tideDmg;
          if(e.dmgType !== "glow") n = Math.max(0, n - this.armorOf(t));
          this.damage(t, n, { src, kind:e.dmgType });
          break; }
        case "stabilize": if(t.downed){ t.stable = true; this.emit({ type:"stabilized", id:t.id }); this.log(t.name + " is stabilized.", "good"); } break;
        case "revive": if(t.downed){ t.downed = false; t.stable = false; t.hp = Math.ceil(t.maxHp/2); t.ap = 0;
          this.emit({ type:"revive", id:t.id, hp:t.hp }); this.log(t.name + " rises again!", "good"); this.refreshVision(); } break;
        case "summon": for(let k=0;k<e.n;k++) this.spawnNear(e.what, src.x, src.y, true); break;
      }
    }
  }
  after(u){ this.checkOver(); return true; }

  /* ---- the Chorus (once a mission each, free) ---- */
  chorusList(){ return (this.mods.chorus || []).map(id=> ({ id, def:GS.CHORUS[id], used:!!this.chorusUsed[id] })); }
  sing(id){
    const C = GS.CHORUS[id];
    if(!C || this.chorusUsed[id] || this.team !== "squad" || this.over || !(this.mods.chorus || []).includes(id)) return false;
    this.chorusUsed[id] = true;
    this.emit({ type:"chorus", id });
    this.log("The squad sings the " + C.name + ".", "good");
    this.squad().filter(u=> !u.downed).forEach(u=>{
      if(C.status) this.addStatus(u, C.status, 1);
      if(C.cleanse) Object.keys(u.statuses).forEach(s=>{ if(GS.STATUS[s].bad) this.dropStatus(u, s); });
      if(C.heal) this.heal(u, C.heal);
    });
    return true;
  }

  /* ---- reinforcements ---- */
  spawnNear(type, x, y, active){
    const spots = [];
    for(let r=1;r<=3 && !spots.length;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      const nx = x + dx, ny = y + dy; if(Grid.passable(this.map, nx, ny) && !this.unitAt(nx, ny)) spots.push([nx, ny]); }
    if(!spots.length) return null;
    const s = this.rng.pick(spots), u = fresh(GS.makeEnemyUnit(type));
    u.x = s[0]; u.y = s[1]; u.active = active !== false; u.pod = "spawn" + u.id; u.home = { x:u.x, y:u.y };
    u.ap = 0;     // (it acts next turn)
    this.units.push(u);
    this.emit({ type:"spawn", unit:JSON.parse(JSON.stringify(u)) });
    this.refreshVision();
    return u;
  }
  wave(size){
    const sq = this.squad();
    const cands = [];
    for(const t of this.map.tiles){
      if(t.block || this.unitAt(t.x, t.y)) continue;
      const d = Math.min(...sq.map(s=> Math.hypot(s.x - t.x, s.y - t.y)));
      if(d >= 7 && d <= 13) cands.push(t);
    }
    if(!cands.length) return;
    const at = this.rng.pick(cands);
    this.emit({ type:"aoe", x:at.x, y:at.y, radius:1.5, fx:"pod" });
    this.log("A spore pod slams into the clearing!", "warn");
    const threat = this.mods.threat || 2;
    for(let k=0;k<size;k++){
      const type = k === 0 && threat >= 4 ? "husk" : (k % 2 === 1 ? "spitter" : "rotling");
      this.spawnNear(type, at.x, at.y, true);
    }
  }
  raiseTide(n){
    for(let k=0;k<n;k++){
      if(this.tide >= GS.TIDE.max){ this.tide++; continue; }
      this.tide++;
      this.emit({ type:"tide", value:this.tide });
      const S = GS.TIDE.steps.find(s=> s.at === this.tide);
      if(!S) continue;
      this.emit({ type:"tideStep", name:S.name, desc:S.desc });
      this.log("GLOOM TIDE: " + S.name + ". " + S.desc, "warn");
      if(S.effect === "aim") this.tideAim = 10;
      if(S.effect === "wave") this.wave(2 + Math.floor((this.mods.threat || 2)/3));
      if(S.effect === "wave+"){ this.tideDmg = 1; this.wave(3); }
      if(S.effect === "bloom") this.bloom = true;
    }
  }

  /* ---- turns ---------------------------------------------------------------- */
  startTurn(team){
    this.team = team;
    if(team === "squad") this.round++;
    this.emit({ type:"turn", team, round:this.round });
    this.units.forEach(u=>{
      if(u.dead) return;
      if(u.team !== team){ u.reacted = false; return; }
      Object.keys(u.statuses).forEach(s=>{ if(GS.STATUS[s].expire === "start"){ if(--u.statuses[s].turns <= 0) this.dropStatus(u, s); } });
      if(u.overwatch){ u.overwatch = 0; this.emit({ type:"overwatch", id:u.id, on:false }); }
      u.ap = u.maxAp; u.moved = false; u.overclocked = false; u.refunded = false;
      Object.keys(u.cooldowns).forEach(k=>{ if(u.cooldowns[k] > 0) u.cooldowns[k]--; });
      if(u.statuses.poison && !u.downed){ this.log(u.name + " chokes on spores.", u.team === "squad" ? "bad" : "good"); this.damage(u, GS.STATUS.poison.dot, { kind:"poison" }); }
      if(u.downed && !u.stable && !u.dead){
        u.bleed--;
        if(u.bleed <= 0){ u.dead = true; this.emit({ type:"death", id:u.id }); this.log(u.name + " has bled out.", "bad"); }
        else this.log(u.name + " is bleeding out: " + u.bleed + " turn" + (u.bleed > 1 ? "s" : "") + " left.", "bad");
      }
    });
    if(team === "squad") this.squad().forEach(u=>{ if(this.able(u) && u.flags.lumenBloom) this.gainLumen(u.flags.lumenBloom, "bloom"); });
    this.checkOver();
  }
  endTurnFor(team){
    this.units.forEach(u=>{
      if(u.dead || u.team !== team) return;
      Object.keys(u.statuses).forEach(s=>{ if(GS.STATUS[s].expire === "end"){ if(--u.statuses[s].turns <= 0) this.dropStatus(u, s); } });
    });
  }
  /* the squad is done: the Gloom moves, the tide rises, and it's the squad's turn again */
  endTurn(){
    if(this.over || this.team !== "squad") return;
    this.endTurnFor("squad");
    this.startTurn("gloom");
    if(!this.over) GS.AI.gloomTurn(this);
    if(!this.over){
      this.endTurnFor("gloom");
      this.raiseTide(1);
      if(this.bloom && this.round % 2 === 0) this.wave(2);
    }
    if(!this.over){ this.startTurn("squad"); this.refreshVision(); }
  }
  retreat(){ if(this.over) return; this.over = "retreat"; this.emit({ type:"end", result:"retreat" }); this.log("The squad pulls out.", "warn"); }

  checkOver(){
    if(this.over) return this.over;
    const sq = this.squad();
    if(!sq.some(u=> !u.downed)){ this.over = "defeat"; }
    else {
      const T = this.mission.type, g = this.gloom();
      if(T === "heart" && !g.some(u=> u.type === "heart")) this.over = "victory";
      else if(T === "finale" && !g.some(u=> u.type === "sporelord")) this.over = "victory";
      else if(T === "purge" && !g.length) this.over = "victory";
    }
    if(this.over){
      this.emit({ type:"end", result:this.over });
      this.log(this.over === "victory" ? "The clearing is cleansed." : "The squad is overrun.", this.over === "victory" ? "good" : "bad");
    }
    return this.over;
  }

  /* what the campaign takes away from it */
  summary(){
    const won = this.over === "victory";
    return {
      result:this.over, rounds:this.round, samples:won ? this.samples : Math.floor(this.samples/2), tide:this.tide,
      troops:this.squad().concat(this.units.filter(u=> u.team === "squad" && u.dead)).map(u=> ({
        id:u.rosterId, name:u.name, hp:u.hp, maxHp:u.maxHp, kills:u.kills, xp:u.xp + (u.dead ? 0 : 1),
        fate:u.dead ? "dead" : u.downed ? (won || u.stable ? "wounded" : "lost") : "ok"
      }))
    };
  }
}
GS.Battle = Battle;

/* ---- setting up a mission's battle ---------------------------------------- */
GS.setupBattle = function(o){
  // o: { seed, type, threat, squad:[unit], mods, where }
  const type = o.type || "purge", threat = o.threat || 2;
  const map = Grid.generate({ seed:o.seed, type, pods:type === "finale" ? 3 : 2 + (threat >= 4 ? 1 : 0) + (threat >= 7 ? 1 : 0), w:o.w || 22, h:o.h || 22 });
  const rng = GS.RNG(o.seed*7 + 3);
  const enemies = [];
  const pool = threat <= 1 ? ["rotling", "rotling", "spitter"] :
               threat <= 3 ? ["rotling", "spitter", "spitter", "bloater", "rotling"] :
               threat <= 5 ? ["rotling", "spitter", "bloater", "husk", "shaman"] :
                             ["spitter", "husk", "shaman", "bloater", "husk"];
  map.pods.forEach((p, pi)=>{
    let budget = 2 + Math.ceil(threat*0.8);
    const members = [];
    while(budget > 0 && members.length < 4){
      const t = rng.pick(pool), c = GS.ENEMIES[t].cost;
      if(c > budget && members.length) break;
      members.push(t); budget -= c;
    }
    const spots = [];
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const x = p.x + dx, y = p.y + dy; if(Grid.passable(map, x, y)) spots.push([x, y]); }
    rng.shuffle(spots);
    members.forEach((t, k)=>{ const s = spots[k]; if(s) enemies.push({ type:t, x:s[0], y:s[1], pod:"p" + pi }); });
  });
  if(map.heart){
    if(type === "heart") enemies.push({ type:"heart", x:map.heart.x, y:map.heart.y, pod:null });
    if(type === "finale"){
      enemies.push({ type:"sporelord", x:map.heart.x, y:map.heart.y, pod:"crown" });
      [[-1,1],[1,1]].forEach(([dx, dy])=> enemies.push({ type:"shaman", x:map.heart.x + dx, y:map.heart.y + dy, pod:"crown" }));
    }
  }
  return new Battle({ map, squad:o.squad, enemies, seed:o.seed*13 + 1, mods:Object.assign({ threat }, o.mods),
    mission:{ type, name:GS.MISSION_TYPES[type].name, where:o.where }, concealed:o.concealed });
};

})(typeof window !== "undefined" ? window : globalThis);
