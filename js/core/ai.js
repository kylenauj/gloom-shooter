/* ------------------------------------------------------------------ *
 *  The Gloom's turn.
 *
 *  Every creature scores the tiles it could reach: how good a shot it
 *  would have from there, how well covered it would be from the squad,
 *  and how far it had to go. Melee things just want to get their claws
 *  in. Casters bless and summon first, then fight. Nothing here peeks
 *  at dice: the AI reads the same to-hit sums the HUD shows the player.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS, Grid = GS.Grid;
const AI = GS.AI = {};

const avg = d=> (d[0] + d[1])/2;

/* how safe is (x, y) from the squad? full cover +2, half +1, exposed -3 per trooper with a line on it */
AI.coverScore = function(b, x, y, u){
  let s = 0, n = 0;
  (u ? b.foesOf(u) : b.squad()).forEach(t=>{
    if(t.downed || !t.weapon) return;
    if(!Grid.canSee(b.map, t.x, t.y, x, y, Math.max(t.sight, t.weapon.melee ? 0 : t.weapon.range))) return;
    n++;
    const c = Grid.coverAgainst(b.map, x, y, t.x, t.y);
    s += c === 2 ? 2 : c === 1 ? 1 : -3;
  });
  return { score:s, threats:n };
};
function shotValue(b, u, t, from, abId){
  const info = b.hitInfo(u, t, { from, ability:abId || "fire" });
  const p = info.chance/100, d = avg(info.dmg);
  return p*d + (info.dmg[1] >= t.hp ? p*4 : 0) + (info.exposed ? 0.5 : 0);
}
function nearestFoe(b, u, x, y){
  let best = null, bd = Infinity;
  b.foesOf(u).forEach(t=>{ if(t.downed) return; const d = Math.hypot(t.x - x, t.y - y); if(d < bd){ bd = d; best = t; } });
  return { t:best, d:bd };
}

/* ---- when a pod wakes: a free dash to the best cover close by ---- */
AI.scamper = function(b, u){
  const R = b.reach(u, u.mob);
  let best = { x:u.x, y:u.y, s:AI.coverScore(b, u.x, u.y, u).score*2 };
  for(let i=0;i<R.cost.length;i++){
    if(R.cost[i] === Infinity) continue;
    const x = i % b.map.w, y = (i - x)/b.map.w;
    const s = AI.coverScore(b, x, y, u).score*2 - R.cost[i]*0.1 + (b.tileH(x, y) ? 0.5 : 0);
    if(s > best.s) best = { x, y, s };
  }
  if(best.x !== u.x || best.y !== u.y) b.move(u, best.x, best.y, { free:true, R });
};

/* ---- the whole turn ---- */
AI.gloomTurn = function(b){
  // dormant pods wander a little round where they were left
  const pods = {};
  b.gloom().forEach(g=>{ if(!g.active && !g.structure) (pods[g.pod] = pods[g.pod] || []).push(g); });
  Object.keys(pods).forEach(p=>{
    if(b.over || !b.rng.chance(0.4)) return;
    const lead = pods[p][0], h = lead.home || lead;
    const gx = GS.clamp(h.x + b.rng.int(-3, 3), 0, b.map.w-1), gy = GS.clamp(h.y + b.rng.int(-3, 3), 0, b.map.h-1);
    pods[p].forEach(g=>{
      if(b.over || g.active) return;
      const R = b.reach(g, 2);
      let best = null, bd = Infinity;
      for(let i=0;i<R.cost.length;i++){ if(R.cost[i] === Infinity) continue; const x = i % b.map.w, y = (i - x)/b.map.w, d = Math.hypot(x - gx, y - gy);
        if(d < bd){ bd = d; best = { x, y }; } }
      if(best && (best.x !== g.x || best.y !== g.y)) b.move(g, best.x, best.y, { R });
      g.ap = g.maxAp;
    });
    if(!b.concealed) b.detect();
  });

  const actors = b.gloom().filter(g=> g.active).sort((a, c)=> (a.structure ? 1 : 0) - (c.structure ? 1 : 0));
  for(const u of actors){
    if(b.over) break;
    if(!b.able(u) || !u.active) continue;
    if(b.visible(u)) b.emit({ type:"focus", id:u.id });
    try{ AI.act(b, u); }catch(err){ b.log("(" + u.name + " hesitates)", "dim"); if(typeof console !== "undefined") console.error(err); }
  }
};

AI.act = function(b, u){
  switch(u.ai){
    case "heart":  return AI.heart(b, u);
    case "caster": AI.cast(b, u); return AI.ranged(b, u);
    case "boss":   AI.boss(b, u); return AI.melee(b, u);
    case "ranged": return AI.ranged(b, u);
    default:       return AI.melee(b, u);
  }
};

AI.heart = function(b, u){
  if(!b.cannot(u, "heartSpawn") && b.gloom().length < 12) b.act(u, "heartSpawn", u);
};

/* claws: the best foe it can reach and still strike; otherwise close the distance */
AI.melee = function(b, u){
  for(let k=0; k<3 && !b.over && b.able(u) && u.ap >= u.weapon.ap; k++){
    const R = b.reach(u, Math.max(0, u.ap - u.weapon.ap)*u.mob);
    let best = null;
    b.foesOf(u).forEach(t=>{
      if(t.downed) return;
      const plan = b.meleePlan(u, t, "fire", R);
      if(!plan) return;
      const v = shotValue(b, u, t, plan) - plan.ap*0.4;
      if(!best || v > best.v) best = { t, v };
    });
    if(!best) break;
    if(!b.act(u, "fire", best.t)) break;
  }
  if(b.over || !b.able(u) || u.ap <= 0) return;
  // nothing in reach: advance on the nearest trooper, by the best-covered route end
  if(b.foesOf(u).some(t=> !t.downed && Math.hypot(t.x - u.x, t.y - u.y) < 1.5)) return;
  const R = b.reach(u);
  let best = null;
  for(let i=0;i<R.cost.length;i++){
    if(R.cost[i] === Infinity) continue;
    const x = i % b.map.w, y = (i - x)/b.map.w, n = nearestFoe(b, u, x, y);
    if(!n.t) return;
    const s = -n.d*2 + AI.coverScore(b, x, y, u).score*0.4;
    if(!best || s > best.s) best = { x, y, s };
  }
  if(best && (best.x !== u.x || best.y !== u.y)) b.move(u, best.x, best.y, { R });
};

/* guns: pick a tile with a good shot and good cover, go there, shoot (or watch) */
AI.ranged = function(b, u){
  if(b.over || !b.able(u) || !u.weapon) return;
  const W = u.weapon, R = b.reach(u);
  const foes = b.foesOf(u).filter(t=> !t.downed);
  let best = null;
  for(let i=0;i<R.cost.length;i++){
    if(R.cost[i] === Infinity) continue;
    const x = i % b.map.w, y = (i - x)/b.map.w, ap = b.apForCost(u, R.cost[i]);
    if(ap > u.ap) continue;
    const from = { x, y }, canShoot = u.ap - ap >= W.ap;
    let shot = null;
    if(canShoot) foes.forEach(t=>{
      if(b.attackBlock(u, t, "fire", from)) return;
      const v = shotValue(b, u, t, from);
      if(!shot || v > shot.v) shot = { t, v };
    });
    const cov = AI.coverScore(b, x, y, u), n = nearestFoe(b, u, x, y);
    let s = cov.score*1.1 - ap*0.25 + (b.tileH(x, y) ? 0.6 : 0);
    if(shot) s += 6 + shot.v*2.2;
    else s -= Math.max(0, n.d - W.range*0.6)*0.5;
    if(!best || s > best.s) best = { x, y, s, shot };
  }
  if(best && (best.x !== u.x || best.y !== u.y)) b.move(u, best.x, best.y, { R });
  if(b.over || !b.able(u)) return;
  // re-pick the target from where it actually ended up (overwatch may have changed things)
  let tgt = null;
  b.foesOf(u).forEach(t=>{ if(t.downed || b.attackBlock(u, t, "fire")) return; const v = shotValue(b, u, t); if(!tgt || v > tgt.v) tgt = { t, v }; });
  if(tgt && u.ap >= W.ap) b.act(u, "fire", tgt.t);
  else if(u.ap >= 2 && !W.melee && b.rng.chance(0.6)){ u.overwatch = 1; u.ap = 0; b.emit({ type:"overwatch", id:u.id, on:true }); if(b.visible(u)) b.log(u.name + " watches the clearing.", "dim"); }
};

/* shamans: bless the most hurt (or the most forward) of the brood, or call more */
AI.cast = function(b, u){
  if(b.over || !b.able(u)) return;
  if(!b.cannot(u, "rotBlessing")){
    const allies = b.targetsFor(u, "rotBlessing").filter(t=> !t.structure && !t.statuses.blessed);
    allies.sort((p, q)=> (p.hp/p.maxHp) - (q.hp/q.maxHp) || nearestFoe(b, p, p.x, p.y).d - nearestFoe(b, q, q.x, q.y).d);
    if(allies.length && (allies[0].hp < allies[0].maxHp || nearestFoe(b, allies[0], allies[0].x, allies[0].y).d < 8)){ b.act(u, "rotBlessing", allies[0]); return; }
  }
  if(!b.cannot(u, "callRotlings") && b.gloom().length < 10) b.act(u, "callRotlings", u);
};

/* the Sporelord: storm where it catches the most troopers, call the brood, then the maul */
AI.boss = function(b, u){
  if(b.over || !b.able(u)) return;
  if(!b.cannot(u, "sporeStorm")){
    const D = GS.ABILITIES.sporeStorm;
    let best = null;
    for(let y=0;y<b.map.h;y++) for(let x=0;x<b.map.w;x++){
      if(b.tileOK(u, "sporeStorm", x, y)) continue;
      const n = b.unitsInRadius(x, y, D.radius).filter(t=> t.team === "squad" && !t.downed).length;
      if(n && (!best || n > best.n)) best = { x, y, n };
    }
    if(best){ b.act(u, "sporeStorm", { x:best.x, y:best.y }); return; }
  }
  if(!b.cannot(u, "callRotlings") && b.gloom().length < 10) b.act(u, "callRotlings", u);
};

})(typeof window !== "undefined" ? window : globalThis);
