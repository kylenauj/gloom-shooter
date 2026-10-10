/* ------------------------------------------------------------------ *
 *  The ghost's hands: how it plays the squad.
 *
 *  Three personas:
 *   - smart:      plays like a decent human. Cover, focus fire, spells
 *                 and items where they pay, the Chorus, Lumen, overwatch,
 *                 stabilizing the downed. Its results are the balance
 *                 baseline.
 *   - aggressive: the same brain, but it charges.
 *   - fuzz:       a chaos monkey. Random legal actions, random targets,
 *                 and deliberate illegal ones (wrong targets, out of
 *                 range, dead units, other side's turn) that the rules
 *                 must refuse without changing anything.
 *
 *  It only uses the battle's public API, the same calls the HUD makes,
 *  so anything it can break, a player can break. Runs in Node and in
 *  the page (loaded after js/core).
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS, Grid = GS.Grid;
const Ghost = GS.Ghost = GS.Ghost || {};

const avg = d=> (d[0] + d[1])/2;
const near = (a, b)=> Math.hypot(a.x - b.x, a.y - b.y);

/* the value of an attack: expected damage, with a bonus for a likely kill */
function attackValue(b, u, t, id){
  const i = b.hitInfo(u, t, { ability:id }), p = i.chance/100;
  return p*avg(i.dmg) + (i.dmg[1] >= t.hp ? p*5 : 0) + (t.boss || t.structure ? 1 : 0);
}
function visibleFoes(b, u){ return b.foesOf(u).filter(t=> !t.downed && b.visible(t)); }

/* the best tile for an area ability: Gloom caught, minus wardens caught (twice over) */
function bestTile(b, u, id){
  const D = b.defOfAction(id), foes = visibleFoes(b, u), seen = new Set();
  let best = null;
  const dmgE = (D.effects || []).find(e=> e.t === "damage"), dmg = dmgE ? avg(dmgE.dmg) : 1;
  foes.forEach(f=>{
    for(let dy=-2; dy<=2; dy++) for(let dx=-2; dx<=2; dx++){
      const x = f.x + dx, y = f.y + dy, k = x + "," + y;
      if(seen.has(k)) continue; seen.add(k);
      if(b.tileOK(u, id, x, y)) continue;
      const hit = b.unitsInRadius(x, y, D.radius || 0).filter(v=> !v.downed && (D.friendly !== false || v.team !== u.team));
      const enemies = hit.filter(v=> v.team !== u.team), friends = hit.filter(v=> v.team === u.team);
      const kills = enemies.filter(v=> v.hp <= dmg).length;
      const s = enemies.length*dmg + kills*4 - friends.length*dmg*2.5;
      if(!best || s > best.s) best = { x, y, s, n:enemies.length, kills, friends:friends.length };
    }
  });
  return best;
}

/* where to stand: a tile with a shot and good cover, or (with nothing in sight)
   a careful step toward what hasn't been seen yet */
function chooseMove(b, u, persona){
  const R = b.reach(u), W = u.weapon, foes = visibleFoes(b, u);
  const squad = b.squad().filter(v=> b.able(v) && v !== u);
  const cx = squad.length ? squad.reduce((s, v)=> s + v.x, 0)/squad.length : u.x, cy = squad.length ? squad.reduce((s, v)=> s + v.y, 0)/squad.length : u.y;
  let goal = null;
  if(!foes.length){
    // explore: the nearest tile nobody has seen; failing that, the last place the Gloom was
    let bd = Infinity;
    for(let i=0;i<b.fog.length;i++){ if(b.fog[i]) continue; const x = i % b.map.w, y = (i - x)/b.map.w, d = Math.hypot(x - u.x, y - u.y) + y*0.15; if(d < bd){ bd = d; goal = { x, y }; } }
    if(!goal){ const g = b.gloom()[0]; if(g) goal = { x:g.x, y:g.y }; }
  }
  const maxAp = !foes.length ? (persona === "aggressive" ? u.ap : Math.min(u.ap, 1)) : u.ap;
  let best = { x:u.x, y:u.y, s:-Infinity };
  for(let i=0;i<R.cost.length;i++){
    if(R.cost[i] === Infinity) continue;
    const x = i % b.map.w, y = (i - x)/b.map.w, ap = b.apForCost(u, R.cost[i]);
    if(ap > maxAp) continue;
    const t = b.map.at(x, y), from = { x, y };
    let s = GS.AI.coverScore(b, x, y, u).score*1.2 - ap*0.3 + (t.h ? 0.6 : 0) - (t.hazard ? 4 : 0);
    if(foes.length){
      const left = u.ap - ap;
      let shot = 0;
      if(left >= W.ap) foes.forEach(f=>{
        if(W.melee){ if(near(from, f) < 1.5) shot = Math.max(shot, attackValue(b, u, f, "fire")); }
        else if(!b.attackBlock(u, f, "fire", from)) shot = Math.max(shot, b.hitInfo(u, f, { from }).chance/100*avg(W.dmg));
      });
      s += shot ? 6 + shot*2 : -Math.min(...foes.map(f=> near(from, f)))*(persona === "aggressive" ? 0.9 : 0.35);
      if(persona === "aggressive") s -= Math.min(...foes.map(f=> near(from, f)))*0.3;
    } else if(goal){
      s += -Math.hypot(x - goal.x, y - goal.y)*1.0;
    }
    s -= Math.max(0, Math.hypot(x - cx, y - cy) - 5)*0.6;      // keep the squad together
    if(s > best.s) best = { x, y, s };
  }
  return (best.x !== u.x || best.y !== u.y) ? best : null;
}

/* one warden's whole turn, the smart way. Returns the list of what it tried. */
Ghost.smartUnit = function(b, u, persona, rec){
  const tried = [], A = (id, t)=>{ const ok = b.act(u, id, t); tried.push({ id, ok }); rec && rec(u, id, t, ok); return ok; };
  for(let step=0; step<8 && !b.over && b.able(u) && u.ap > 0; step++){
    const acts = b.actionsFor(u).filter(a=> a.enabled), has = id=> acts.some(a=> a.id === id);
    const foes = visibleFoes(b, u);
    // 1. bring back the fallen
    const down = b.targetsFor(u, "stabilize")[0];
    if(has("stabilize") && down){ A("stabilize", down); continue; }
    if(has("rebirth")){ const t = b.targetsFor(u, "rebirth")[0]; if(t && A("rebirth", t)) continue; }
    // 2. patch up the hurt
    for(const id of ["mend", "item:salve"]){
      if(!has(id)) continue;
      const t = b.targetsFor(u, id).filter(v=> !v.downed && v.hp <= v.maxHp*0.5).sort((p, q)=> p.hp - q.hp)[0];
      if(t && A(id, t)) break;
    }
    if(!b.able(u) || u.ap <= 0) break;
    // a hurt ally caught in the open gets Sanctuary; a ready ally with a shot gets Link
    if(has("sanctuary")){ const t = b.targetsFor(u, "sanctuary").find(v=> v.hp <= v.maxHp*0.6 && foes.some(f=> Grid.coverAgainst(b.map, v.x, v.y, f.x, f.y) === 0)); if(t && A("sanctuary", t)) continue; }
    if(has("link") && b.lumen >= 3){ const t = b.targetsFor(u, "link").find(v=> v.ap >= 1 && v.weapon && b.targetsFor(v, "fire").length); if(t && A("link", t)) continue; }
    // surrounded: spin
    if(has("whirl") && foes.filter(f=> b.adjacent(u, f)).length >= 2){ A("whirl", u); continue; }
    // 3. area attacks, when they catch enough
    let used = false;
    for(const id of ["starfall", "glowburst", "mortar", "item:blastcap", "item:flare"]){
      if(!has(id)) continue;
      const t = bestTile(b, u, id);
      if(t && (t.n >= 2 || t.kills >= 1) && t.friends === 0 && A(id, { x:t.x, y:t.y })){ used = true; break; }
    }
    if(used) continue;
    // 4. the best single attack on offer
    let pick = null;
    for(const a of acts){
      if(!(a.def.attack || ["rootSnare", "suppress"].includes(a.id))) continue;
      for(const t of b.targetsFor(u, a.id)){
        let v = a.def.attack ? attackValue(b, u, t, a.id) : (t.weapon && t.weapon.melee ? 1.5 : 1.2);
        if(a.id === "aimed" && u.ap < a.ap + 0) continue;
        v = v/Math.max(1, a.ap)*2 + (a.lumen ? -0.6 : 0);
        if(!pick || v > pick.v) pick = { id:a.id, t, v };
      }
    }
    // short one AP for a good shot? burn Lumen for it
    if(!pick && has("overclock") && b.lumen >= 3 && u.weapon && !u.weapon.melee && u.ap === u.weapon.ap - 1 && b.targetsFor(u, "fire").length){ A("overclock"); continue; }
    if(pick && pick.v > 0.4){ A(pick.id, pick.t); continue; }
    // 5. housekeeping
    if(has("reload") && u.ammo === 0){ A("reload"); continue; }
    if(has("harvest") && b.tide < 9){ const n = b.targetsFor(u, "harvest")[0]; if(n && A("harvest", n)) continue; }
    // 6. move, once or twice
    if(tried.filter(t=> t.id === "move").length < 2){
      const m = chooseMove(b, u, persona);
      if(m){ const ok = b.move(u, m.x, m.y); tried.push({ id:"move", ok }); rec && rec(u, "move", m, ok); if(ok) continue; }
    }
    // 7. nothing left worth doing: watch, or duck
    if(has("overwatch") && foes.length === 0 && !b.concealed){ A("overwatch"); break; }
    if(has("overwatch") && foes.length){ A("overwatch"); break; }
    if(has("hunker") && foes.length){ A("hunker"); break; }
    if(has("bulwark") && foes.length){ A("bulwark"); break; }
    break;
  }
  return tried;
};

/* the Chorus, at the moment a player would sing it */
Ghost.smartChorus = function(b, rec){
  const foes = b.gloom().filter(g=> b.visible(g) && !g.structure).length, sq = b.squad().filter(u=> b.able(u));
  for(const c of b.chorusList()){
    if(c.used) continue;
    let go = false;
    if(c.id === "glowHymn") go = !b.concealed && foes >= 3;
    if(c.id === "rootHymn") go = foes >= 4 && b.round >= 3;
    if(c.id === "hushHymn") go = sq.filter(u=> u.statuses.poison).length >= 2 || sq.some(u=> u.hp <= 2);
    if(go){ const ok = b.sing(c.id); rec && rec(null, "chorus:" + c.id, null, ok); }
  }
};

/* ---- the chaos monkey ---- */
Ghost.fuzzUnit = function(b, u, rng, rec, contract){
  for(let step=0; step<6 && !b.over && b.able(u) && u.ap > 0; step++){
    const r = rng.next();
    if(r < 0.18){
      // something illegal: the rules must say no and change nothing
      contract(b, ()=> Ghost.illegal(b, u, rng));
      continue;
    }
    if(r < 0.45){
      const R = b.reach(u), opts = [];
      for(let i=0;i<R.cost.length;i++) if(R.cost[i] !== Infinity && R.cost[i] > 0 && b.apForCost(u, R.cost[i]) <= u.ap) opts.push(i);
      if(opts.length){ const i = rng.pick(opts), x = i % b.map.w, y = (i - x)/b.map.w; const ok = b.move(u, x, y); rec(u, "move", { x, y }, ok, ok ? null : "a reachable tile was refused"); continue; }
    }
    const acts = b.actionsFor(u).filter(a=> a.enabled);
    if(!acts.length) break;
    const a = rng.pick(acts), D = a.def;
    let t = null;
    if(D.target === "tile"){
      for(let k=0;k<30 && !t;k++){ const x = u.x + rng.int(-10, 10), y = u.y + rng.int(-10, 10); if(!b.tileOK(u, a.id, x, y)) t = { x, y }; }
      if(!t) continue;
    } else if(D.target === "self" || D.target === "adjacent") t = u;
    else { const ts = b.targetsFor(u, a.id); if(!ts.length){ rec(u, a.id, null, false, "enabled but no targets"); continue; } t = rng.pick(ts); }
    const ok = b.act(u, a.id, t);
    rec(u, a.id, t, ok, ok ? null : "enabled action with a listed target was refused");
  }
};
/* a menu of things a careless or malicious player might try */
Ghost.illegal = function(b, u, rng){
  const foe = b.units.find(v=> v.team !== u.team), dead = b.units.find(v=> v.dead), ally = b.units.find(v=> v.team === u.team && v !== u);
  const tries = [
    ()=> b.act(u, "fire", ally || u),                                  // shoot a friend
    ()=> b.act(u, "fire", dead || { x:-1, y:-1 }),                      // shoot a corpse or nothing
    ()=> b.act(u, "fire", { x:u.x, y:u.y }),                            // shoot a tile
    ()=> b.act(u, "mortar", { x:-5, y:999 }),                           // off the map
    ()=> b.act(u, "no-such-ability", foe),                              // made-up ability
    ()=> b.move(u, u.x, u.y),                                           // move nowhere
    ()=> b.move(u, -1, -1),                                             // off the map
    ()=> { const t = b.map.tiles.find(t=> t.block); return t ? b.move(u, t.x, t.y) : false; },   // into a boulder
    ()=> { const o = b.units.find(v=> v !== u && !v.dead); return o ? b.move(u, o.x, o.y) : false; }, // onto someone
    ()=> foe ? b.act(foe, "fire", u) : false,                           // act for the other side
    ()=> b.act(u, "mend", foe),                                          // heal the enemy
    ()=> b.sing("no-such-song"),
    ()=> { const ap = u.ap; u.ap = 0; const ok = b.act(u, "fire", foe); u.ap = ap; return ok; }  // fire with no AP
  ];
  const i = rng.int(0, tries.length - 1);
  return { which:i, result:tries[i]() };
};

})(typeof window !== "undefined" ? window : globalThis);
