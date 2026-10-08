/* ------------------------------------------------------------------ *
 *  The battlefield grid: what stands where, who can walk where, who
 *  can see whom, and what cover a tile gives.
 *
 *  x runs east, y runs south (row order). The squad deploys along the
 *  south edge, nearest the camera; the Gloom waits to the north.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS;

/* what each prop is, for the rules: cover it gives, whether it blocks
   sight, whether a blast can smash it */
const PROPS = {
  giant:   { cover:2, los:true,  destructible:false, name:"Giant glowcap" },
  boulder: { cover:2, los:true,  destructible:false, name:"Boulder" },
  log:     { cover:1, los:false, destructible:true,  name:"Fallen log" },
  cluster: { cover:1, los:false, destructible:true,  name:"Mushroom cluster" },
  crystal: { cover:1, los:false, destructible:true,  name:"Crystal cluster" },
  stump:   { cover:1, los:false, destructible:true,  name:"Rotten stump" },
  node:    { cover:1, los:false, destructible:false, name:"Glow node" }
};
GS.PROPS = PROPS;

function makeMap(w, h){
  const tiles = [];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) tiles.push({ x, y, h:0, block:false, cover:0, los:false, prop:null, destructible:false, hazard:null, seed:0 });
  const map = { w, h, tiles, nodes:[], pods:[], spawn:[], heart:null, rubble:[] };
  map.at = (x, y)=> (x < 0 || y < 0 || x >= w || y >= h) ? null : tiles[y*w + x];
  return map;
}
function setProp(t, prop, seed){
  const P = PROPS[prop];
  t.prop = prop; t.block = true; t.cover = P.cover; t.los = P.los; t.destructible = P.destructible; t.seed = seed;
}
function clearProp(t){ t.prop = null; t.block = false; t.cover = 0; t.los = false; t.destructible = false; }

const Grid = GS.Grid = {};

Grid.inBounds = (map, x, y)=> x >= 0 && y >= 0 && x < map.w && y < map.h;
Grid.passable = (map, x, y)=> { const t = map.at(x, y); return !!t && !t.block; };

/* ---- movement --------------------------------------------------------
   Dijkstra over 8 neighbours. Straight steps cost 1, diagonals 1.5, a
   step up or down a ledge costs 1 more. No cutting corners past
   anything solid. `blocked(x, y)` says where other units stand.     */
Grid.reach = function(map, sx, sy, budget, blocked){
  const N = map.w*map.h, cost = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const start = sy*map.w + sx; cost[start] = 0;
  const open = [start];
  while(open.length){
    // the frontier stays small on a 24x24 grid: a linear scan beats a heap here
    let bi = 0; for(let i=1;i<open.length;i++) if(cost[open[i]] < cost[open[bi]]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length-1]; open.pop();
    const cx = cur % map.w, cy = (cur - cx)/map.w, ct = map.tiles[cur];
    for(const [dx, dy] of GS.DIRS8){
      const nx = cx + dx, ny = cy + dy;
      if(!Grid.passable(map, nx, ny) || (blocked && blocked(nx, ny))) continue;
      if(dx && dy && (!Grid.passable(map, cx + dx, cy) || !Grid.passable(map, cx, cy + dy))) continue;
      const nt = map.at(nx, ny);
      const c = cost[cur] + (dx && dy ? 1.5 : 1) + (nt.h !== ct.h ? 1 : 0);
      if(c > budget + 1e-6) continue;
      const ni = ny*map.w + nx;
      if(c < cost[ni]){ if(cost[ni] === Infinity) open.push(ni); cost[ni] = c; prev[ni] = cur; }
    }
  }
  return { cost, prev, w:map.w, start };
};
Grid.pathFrom = function(R, x, y){
  let i = y*R.w + x; if(R.cost[i] === Infinity) return null;
  const out = [];
  while(i !== R.start && i >= 0){ out.push({ x:i % R.w, y:Math.floor(i/R.w) }); i = R.prev[i]; }
  return out.reverse();
};

/* ---- sight ----------------------------------------------------------- */
Grid.clearLine = function(map, ax, ay, bx, by){
  const x0 = ax + 0.5, y0 = ay + 0.5, x1 = bx + 0.5, y1 = by + 0.5;
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L/0.2));
  for(let i=1;i<n;i++){
    const f = i/n, tx = Math.floor(x0 + (x1 - x0)*f), ty = Math.floor(y0 + (y1 - y0)*f);
    if((tx === ax && ty === ay) || (tx === bx && ty === by)) continue;
    const t = map.at(tx, ty);
    if(t && t.los) return false;
  }
  return true;
};
/* XCOM's step-out: a unit tucked in beside something solid leans round
   it, so sight is also checked from (and to) its open cardinal sides */
function peeks(map, x, y){
  let tucked = false;
  for(const [dx, dy] of GS.DIRS4){ const t = map.at(x + dx, y + dy); if(t && t.los) tucked = true; }
  if(!tucked) return [];
  const out = [];
  for(const [dx, dy] of GS.DIRS4) if(Grid.passable(map, x + dx, y + dy)) out.push([x + dx, y + dy]);
  return out;
}
Grid.canSee = function(map, ax, ay, bx, by, range){
  if(range !== undefined && Math.hypot(ax - bx, ay - by) > range + 1e-6) return false;
  if(Grid.clearLine(map, ax, ay, bx, by)) return true;
  for(const p of peeks(map, ax, ay)) if(Grid.clearLine(map, p[0], p[1], bx, by)) return true;
  for(const q of peeks(map, bx, by)) if(Grid.clearLine(map, ax, ay, q[0], q[1])) return true;
  return false;
};

/* ---- cover -------------------------------------------------------------
   Cover lives on the four cardinal sides of a tile. It counts against an
   attacker who is on that side of it; no side facing them, flanked. */
Grid.coverSides = function(map, x, y){
  const out = [];
  for(const [dx, dy] of GS.DIRS4){ const t = map.at(x + dx, y + dy); if(t && t.cover) out.push({ dx, dy, cover:t.cover }); }
  return out;
};
Grid.coverAgainst = function(map, tx, ty, ax, ay){
  let best = 0;
  for(const s of Grid.coverSides(map, tx, ty)){
    if((ax - tx)*s.dx + (ay - ty)*s.dy > 0) best = Math.max(best, s.cover);
  }
  return best;
};

/* ---- map generation ----------------------------------------------------
   A clearing in the glowcap forest: rock shelves to climb, giant caps and
   boulders for full cover, logs, clusters and crystal for half, patches of
   rot, glow nodes to harvest, and the squad's landing zone in the south. */
Grid.generate = function(opts){
  const o = Object.assign({ w:22, h:22, seed:1, type:"purge", pods:3 }, opts);
  const rng = GS.RNG(o.seed), map = makeMap(o.w, o.h);
  map.seed = o.seed;
  const W = o.w, H = o.h, cx = Math.floor(W/2);

  // the landing zone: kept open
  const lz = new Set();
  for(let y=H-3;y<H;y++) for(let x=cx-4;x<=cx+3;x++) lz.add(GS.key(x, y));
  for(let x=cx-3;x<=cx+2;x++) map.spawn.push({ x, y:H-2 });
  const reserved = new Set(lz);

  // rock shelves (raised ground): the high ground is worth +10 aim
  const nL = rng.int(2, 3);
  for(let k=0;k<nL;k++){
    const lw = rng.int(3, 5), lh = rng.int(2, 4), lx = rng.int(1, W - lw - 1), ly = rng.int(2, H - lh - 6);
    for(let y=ly;y<ly+lh;y++) for(let x=lx;x<lx+lw;x++){ const t = map.at(x, y); if(t) t.h = 1; }
  }

  const connected = ()=>{
    // every open tile reachable from the landing zone?
    const s = map.spawn[0], seen = new Uint8Array(W*H), q = [s.y*W + s.x]; seen[q[0]] = 1; let n = 1;
    while(q.length){ const i = q.pop(), x = i % W, y = (i - x)/W;
      for(const [dx, dy] of GS.DIRS4){ const nx = x + dx, ny = y + dy; if(!Grid.passable(map, nx, ny)) continue; const j = ny*W + nx; if(!seen[j]){ seen[j] = 1; n++; q.push(j); } } }
    let open = 0; for(const t of map.tiles) if(!t.block) open++;
    return n === open;
  };
  const near = (x, y, r, pred)=>{ for(let yy=y-r;yy<=y+r;yy++) for(let xx=x-r;xx<=x+r;xx++){ const t = map.at(xx, yy); if(t && pred(t)) return true; } return false; };
  const place = (prop, n, ok)=>{
    let placed = 0;
    for(let tries=0; placed<n && tries<n*40; tries++){
      const x = rng.int(0, W-1), y = rng.int(0, H-1), t = map.at(x, y);
      if(t.block || t.hazard || reserved.has(GS.key(x, y)) || (ok && !ok(x, y, t))) continue;
      setProp(t, prop, rng.int(1, 1e6));
      if(!connected()){ clearProp(t); continue; }
      placed++;
    }
    return placed;
  };

  // full cover: giant caps keep apart from each other; boulders sit anywhere
  place("giant", Math.round(W*H/48), (x, y)=> !near(x, y, 2, t=> t.prop === "giant"));
  place("boulder", Math.round(W*H/90), (x, y)=> !near(x, y, 1, t=> t.los));
  // half cover, scattered; a little more of it just ahead of the landing zone
  place("log", Math.round(W*H/50));
  place("cluster", Math.round(W*H/40));
  place("crystal", Math.round(W*H/70));
  place("stump", Math.round(W*H/90));
  place("cluster", 3, (x, y)=> y >= H - 7 && y <= H - 4);
  place("log", 2, (x, y)=> y >= H - 8 && y <= H - 5);

  // glow nodes: Lumen to harvest, across the middle of the map
  const nodeN = o.nodes !== undefined ? o.nodes : 3;
  for(let k=0, tries=0; k<nodeN && tries<400; tries++){
    const x = rng.int(2, W-3), y = rng.int(Math.floor(H*0.25), H - 7), t = map.at(x, y);
    if(t.block || reserved.has(GS.key(x, y)) || near(x, y, 3, t2=> t2.prop === "node")) continue;
    setProp(t, "node", rng.int(1, 1e6));
    if(!connected()){ clearProp(t); continue; }
    map.nodes.push({ x, y, harvested:false }); k++;
  }

  // patches of rot: the Gloom's ground. Stepping in is a dose of spores
  const nR = rng.int(2, 4);
  for(let k=0;k<nR;k++){
    let x = rng.int(1, W-2), y = rng.int(1, Math.floor(H*0.6));
    for(let s=0, n=rng.int(3, 7); s<n; s++){
      const t = map.at(x, y);
      if(t && !t.block && !reserved.has(GS.key(x, y))) t.hazard = "rot";
      const d = rng.pick(GS.DIRS4); x = GS.clamp(x + d[0], 0, W-1); y = GS.clamp(y + d[1], 0, H-1);
    }
  }

  // where the Gloom waits: pods spread across the north, well clear of the landing zone
  const free = (x, y)=> { const t = map.at(x, y); return t && !t.block; };
  const podN = o.pods;
  for(let tries=0; map.pods.length<podN && tries<800; tries++){
    const x = rng.int(2, W-3), y = rng.int(1, Math.floor(H*0.62));
    if(!free(x, y) || Math.hypot(x - cx, y - (H-2)) < 11) continue;
    if(map.pods.some(p=> Math.hypot(p.x - x, p.y - y) < 6)) continue;
    map.pods.push({ x, y });
  }
  if(o.type === "heart" || o.type === "finale"){
    // the heart (or the throne) sits deep in the north, on open ground with room round it
    for(let tries=0; tries<400; tries++){
      const x = rng.int(4, W-5), y = rng.int(2, 6);
      if(!free(x, y) || !GS.DIRS8.every(([dx, dy])=> free(x + dx, y + dy))) continue;
      map.heart = { x, y }; break;
    }
    if(!map.heart){ const t = map.at(cx, 3); clearProp(t); t.hazard = null; GS.DIRS8.forEach(([dx, dy])=>{ const n = map.at(cx + dx, 3 + dy); if(n){ clearProp(n); } }); map.heart = { x:cx, y:3 }; }
    // rot spreads round it
    for(let y=map.heart.y-2;y<=map.heart.y+2;y++) for(let x=map.heart.x-2;x<=map.heart.x+2;x++){ const t = map.at(x, y); if(t && !t.block && rng.chance(0.45)) t.hazard = "rot"; }
  }
  return map;
};

/* a blast smashes light cover: the tile is left as rubble you can walk over */
Grid.smash = function(map, x, y){
  const t = map.at(x, y);
  if(!t || !t.destructible) return false;
  clearProp(t); map.rubble.push({ x, y });
  return true;
};

})(typeof window !== "undefined" ? window : globalThis);
