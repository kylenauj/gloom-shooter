/* ------------------------------------------------------------------ *
 *  Gloom Shooter: the shared namespace, a seeded RNG, small helpers.
 *
 *  Every file in js/core is plain logic with no THREE and no DOM, so the
 *  whole rules engine runs (and is tested) under Node as well as in the
 *  browser. Files attach themselves to one global, GS, in load order.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS = root.GS || {};

/* mulberry32: small, fast, and the same sequence everywhere for a seed */
GS.RNG = function(seed){
  let s = (seed >>> 0) || 1;
  const next = ()=>{
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0)/4294967296;
  };
  return {
    next,
    int: (a, b)=> a + Math.floor(next()*(b - a + 1)),
    range: (a, b)=> a + next()*(b - a),
    pick: arr=> arr[Math.floor(next()*arr.length)],
    chance: p=> next() < p,
    shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j = Math.floor(next()*(i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    get state(){ return s; }, set state(v){ s = v >>> 0; }
  };
};

GS.clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
GS.dist = (ax, ay, bx, by)=> Math.hypot(ax - bx, ay - by);
GS.key = (x, y)=> x + "," + y;
GS.uid = (()=>{ let n = 0; return p=> (p || "u") + (++n); })();

/* a tiny event hub: the battle writes what happened, the view and the
   HUD read it, and neither knows about the other */
GS.Emitter = function(){
  const subs = {};
  return {
    on(type, fn){ (subs[type] = subs[type] || []).push(fn); return ()=>{ subs[type] = subs[type].filter(f=> f !== fn); }; },
    emit(type, data){ (subs[type] || []).slice().forEach(f=> f(data)); (subs["*"] || []).slice().forEach(f=> f(type, data)); }
  };
};

/* 8 neighbours, the cardinal four first (cover is only ever cardinal) */
GS.DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];
GS.DIRS8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

})(typeof window !== "undefined" ? window : globalThis);
