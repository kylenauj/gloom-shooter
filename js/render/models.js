/* ------------------------------------------------------------------ *
 *  Everyone on the field, built from lumps the way Pine Hollow built
 *  its Bigfoot: faceted, hand-placed, jointed in groups so they can
 *  bob, hop, lunge and fall over.
 *
 *  The wardens are mushroom-folk, one species per class so you can tell
 *  them apart from across the clearing: Porcini Capguards, Morel
 *  Thornblades, Parasol Longcaps, Amanita Sporecasters, Puffball
 *  Puffbombers. Their armour changes with the research tier.
 *
 *  The Gloom is rot: violet-black flesh, bile-green pustules that glow,
 *  too many eyes, and cordyceps growing out of what used to be folk.
 *
 *  Every model faces +z. Its root stands on the ground at its tile.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, K = GS.Kit;
const Models = GS.Models = {};

function rig(){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  return { root, body, mats:[], parts:{}, muzzle:new THREE.Object3D(), head:1.6, idle:null };
}
function L(R, c, extra){ const m = new THREE.MeshLambertMaterial(Object.assign({ color:c }, extra)); R.mats.push(m); return m; }
function VL(R, extra){ const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors:true }, extra)); R.mats.push(m); return m; }
function mesh(parent, g, m, x, y, z){ const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; parent.add(o); return o; }
function glowBall(parent, r, c, x, y, z){ return mesh(parent, new THREE.SphereGeometry(r, 7, 5), K.basic(c), x, y, z); }
function haloSprite(parent, c, s, x, y, z){
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:K.glowTex, color:c, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.8 }));
  sp.scale.set(s, s, s); sp.position.set(x, y, z); parent.add(sp); return sp;
}

/* ---- the wardens' weapons, held in the right hand, pointing +z ---- */
const WEAPON = {
  scattergun(R, g){
    mesh(g, new THREE.BoxGeometry(0.11, 0.13, 0.34), L(R, 0x4a2f1c), 0, 0, -0.05);
    const b = mesh(g, new THREE.CylinderGeometry(0.055, 0.065, 0.5, 8), L(R, 0xb08a3a), 0, 0.03, 0.3); b.rotation.x = Math.PI/2;
    const f = mesh(g, new THREE.CylinderGeometry(0.1, 0.06, 0.12, 8), L(R, 0xc9a24a), 0, 0.03, 0.58); f.rotation.x = Math.PI/2;
    R.muzzle.position.set(0, 0.03, 0.66); g.add(R.muzzle);
  },
  needle(R, g){
    mesh(g, new THREE.BoxGeometry(0.08, 0.12, 0.38), L(R, 0x5a3a22), 0, -0.02, -0.15);
    const b = mesh(g, new THREE.CylinderGeometry(0.028, 0.034, 1.05, 6), L(R, 0x2a2e36), 0, 0.03, 0.48); b.rotation.x = Math.PI/2;
    const sc = mesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), L(R, 0x1a1e24), 0, 0.12, 0.12); sc.rotation.x = Math.PI/2;
    glowBall(g, 0.035, 0x7ff0ff, 0, 0.12, 0.24);
    R.muzzle.position.set(0, 0.03, 1.02); g.add(R.muzzle);
  },
  repeater(R, g){
    mesh(g, new THREE.BoxGeometry(0.16, 0.16, 0.42), L(R, 0x5a3a22), 0, 0, 0);
    const d = mesh(g, new THREE.CylinderGeometry(0.15, 0.15, 0.12, 10), L(R, 0x8a6a3a), 0, 0.15, 0.02); d.rotation.z = Math.PI/2;
    for(const [x, y] of [[-0.04, 0.03], [0.04, 0.03], [0, -0.04]]){ const b = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), L(R, 0x2a2e36), x, y, 0.38); b.rotation.x = Math.PI/2; }
    R.muzzle.position.set(0, 0, 0.6); g.add(R.muzzle);
  },
  wand(R, g){
    const st = mesh(g, new THREE.CylinderGeometry(0.03, 0.035, 1.5, 6), L(R, 0x4a3420), 0, 0.35, 0); st.rotation.x = 0.15;
    const top = new THREE.Group(); top.position.set(0, 1.08, 0.11); g.add(top);
    const cage = mesh(top, new THREE.TorusGeometry(0.13, 0.015, 4, 10), L(R, 0xb08a3a)); cage.rotation.y = Math.PI/2;
    const cage2 = mesh(top, new THREE.TorusGeometry(0.13, 0.015, 4, 10), L(R, 0xb08a3a)); cage2.rotation.x = Math.PI/2;
    R.parts.orb = glowBall(top, 0.085, 0xaaf6ff);
    haloSprite(top, 0x46d4ff, 0.9, 0, 0, 0);
    R.muzzle.position.set(0, 0, 0); top.add(R.muzzle);
  },
  thornblade(R, g){
    const hilt = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), L(R, 0x3a2818), 0, 0, -0.05); hilt.rotation.x = Math.PI/2;
    const guard = mesh(g, new THREE.BoxGeometry(0.2, 0.03, 0.04), L(R, 0x8a6a3a), 0, 0, 0.06);
    const blade = mesh(g, new THREE.ConeGeometry(0.06, 0.95, 5), L(R, 0xd8f0c8, { emissive:0x2a6a4a }), 0, 0, 0.55); blade.rotation.x = Math.PI/2;
    const edge = mesh(g, new THREE.ConeGeometry(0.02, 0.85, 4), K.basic(0x9cffd0), 0, 0.03, 0.55); edge.rotation.x = Math.PI/2;
    R.muzzle.position.set(0, 0, 0.9); g.add(R.muzzle);
  }
};

/* ---- the caps ---- */
const CAPS = {
  porcini(R, top){
    const c = mesh(top, K.capGeo, K.capMat(0x8a5a2b, { cut:false, spots:0, glow:0 })); c.scale.set(0.64, 0.42, 0.64); c.castShadow = true;
    return 0.42;
  },
  morel(R, top){
    const prof = [[0.27, 0], [0.33, 0.12], [0.33, 0.32], [0.27, 0.55], [0.16, 0.76], [0.02, 0.88]].map(p=> new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(prof, 12).toNonIndexed();
    const p = g.attributes.position;
    K.paint(g, 0x7a5a3a, (c, x, y, z)=>{ const a = Math.atan2(z, x); if(Math.sin(a*7)*Math.sin(y*26) > 0.25) c.multiplyScalar(0.35); });
    for(let i=0;i<p.count;i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - (Math.sin(a*7)*Math.sin(y*26) > 0.25 ? 0.08 : 0); p.setX(i, x*k); p.setZ(i, z*k); }
    g.computeVertexNormals();
    mesh(top, g, VL(R), 0, -0.04, 0);
    return 0.88;
  },
  parasol(R, top){
    const c = mesh(top, K.capGeo, K.capMat(0xe8dcc0, { cut:false, spots:1, spotColor:0x6b4a2e, glow:0 })); c.scale.set(0.8, 0.24, 0.8); c.castShadow = true;
    mesh(top, new THREE.SphereGeometry(0.12, 8, 5), L(R, 0x6b4a2e), 0, 0.2, 0);
    return 0.3;
  },
  amanita(R, top){
    const c = mesh(top, K.capGeo, K.capMat(0xd02a2a, { cut:false, spots:1, spotColor:0xffffff, glow:0 })); c.scale.set(0.58, 0.46, 0.58); c.castShadow = true;
    return 0.46;
  },
  puffball(R, top){
    const g = K.paint(K.lump(0.56, 2, 0.06), 0xece6d8, (c, x, y)=> c.offsetHSL(0, 0, -0.06 + y*0.08));
    const b = mesh(top, g, VL(R, {}), 0, 0.42, 0); b.scale.set(1, 0.88, 1);
    for(let i=0;i<14;i++){ const a = Math.random()*6.28, e = 0.2 + Math.random()*1.1, r = 0.55;
      mesh(top, new THREE.SphereGeometry(0.035, 5, 3), L(R, 0xd8cfb8), Math.cos(a)*Math.cos(e)*r, 0.42 + Math.sin(e)*r*0.88, Math.sin(a)*Math.cos(e)*r); }
    return 0.9;
  },
  husk(R, top){
    const c = mesh(top, K.capGeo, K.capMat(0x3a2c3a, { cut:false, spots:1, spotColor:0x9cff3a, glow:0.3 })); c.scale.set(0.6, 0.36, 0.6); c.rotation.z = 0.25;
    // cordyceps: orange stalks bursting out of the cap, tips glowing
    for(let i=0;i<6;i++){ const a = Math.random()*6.28, r = Math.random()*0.35, h = 0.4 + Math.random()*0.5;
      const s = mesh(top, new THREE.CylinderGeometry(0.015, 0.035, h, 5), L(R, 0xff8a2a, { emissive:0x401800 }), Math.cos(a)*r, 0.25 + h/2, Math.sin(a)*r);
      s.rotation.set((Math.random() - 0.5)*0.6, 0, (Math.random() - 0.5)*0.6);
      glowBall(top, 0.04, 0xffb24a, Math.cos(a)*r + s.rotation.z*-h*0.5, 0.25 + h, Math.sin(a)*r + s.rotation.x*h*0.5); }
    return 0.5;
  }
};

/* ---- a mushroom-folk: feet, a stem for a body, armour, a face, a cap, two arms ---- */
function folk(o){
  const R = rig(), b = R.body, S = o.tall || 1;
  R.parts.feet = [];
  for(const s of [-1, 1]){ const f = mesh(b, K.lump(0.13, 0, 0.3), L(R, o.foot || 0x7a6a52), s*0.15, 0.08, 0.04); f.scale.set(1, 0.7, 1.45); R.parts.feet.push(f); }
  const prof = [[0.26, 0], [0.31, 0.12], [0.3, 0.45], [0.26, 0.75], [0.22, 0.92]].map(p=> new THREE.Vector2(p[0]*(o.wide || 1), p[1]*S));
  const stem = mesh(b, new THREE.LatheGeometry(prof, 10), L(R, o.stem || 0xe9e0c8), 0, 0.1, 0);
  R.parts.stem = stem;
  // armour: bark, chitin, moonshell
  const tier = o.armor || 0, AC = [0x6b4a2e, 0x22424a, 0xc9d0e8][tier];
  if(o.armor !== -1){
    const vp = [[0.32, 0.16], [0.335, 0.3], [0.32, 0.55], [0.29, 0.64]].map(p=> new THREE.Vector2(p[0]*(o.wide || 1), p[1]*S));
    mesh(b, new THREE.LatheGeometry(vp, 10, 0, Math.PI*2), L(R, AC, tier === 2 ? { emissive:0x1a2240 } : {}), 0, 0.1, 0);
    const belt = mesh(b, new THREE.TorusGeometry(0.315*(o.wide || 1), 0.035, 4, 12), L(R, 0x2a1c12), 0, 0.1 + 0.18*S, 0); belt.rotation.x = Math.PI/2;
    if(tier >= 1) for(const s of [-1, 1]){ const sh = mesh(b, K.lump(0.13, 0, 0.2), L(R, AC), s*0.3*(o.wide || 1), 0.1 + 0.62*S, 0); sh.scale.set(1.2, 0.6, 1); }
    if(tier === 2) glowBall(b, 0.045, 0x9fd8ff, 0, 0.1 + 0.45*S, 0.33*(o.wide || 1));
  }
  // the face, on the stem under the cap
  const ey = 0.1 + 0.8*S, ez = 0.235*(o.wide || 1);
  for(const s of [-1, 1]){
    mesh(b, new THREE.SphereGeometry(0.055, 7, 5), K.basic(0x0b0d12), s*0.085, ey, ez);
    glowBall(b, 0.018, o.eye || 0x9ff4ff, s*0.085 + 0.012, ey + 0.016, ez + 0.045);
  }
  // the cap
  const top = new THREE.Group(); top.position.y = 0.1 + 0.92*S; b.add(top); R.parts.cap = top;
  const ch = CAPS[o.cap](R, top);
  R.head = top.position.y + ch + 0.25;
  // arms: a shoulder lump and a hand; the right one holds the weapon
  const armM = L(R, o.stem || 0xe9e0c8);
  const arm = (s)=>{ const a = new THREE.Group(); a.position.set(s*0.31*(o.wide || 1), 0.1 + 0.58*S, 0.02); b.add(a);
    mesh(a, K.lump(0.09, 0, 0.2), armM, 0, -0.06, 0); const h = mesh(a, K.lump(0.08, 0, 0.25), armM, s*0.04, -0.2, 0.12); return { a, h }; };
  R.parts.armL = arm(-1); R.parts.armR = arm(1);
  if(o.weapon){
    const g = new THREE.Group(); g.position.set(0.04, -0.2, 0.18); R.parts.armR.a.add(g); R.parts.gun = g;
    WEAPON[o.weapon](R, g);
    if(o.weapon === "wand"){ g.position.set(0.05, -0.55, 0.12); }
  }
  if(o.shield){
    const sh = new THREE.Group(); sh.position.set(-0.08, -0.15, 0.2); R.parts.armL.a.add(sh);
    const c = mesh(sh, K.capGeo, K.capMat(0x8a5a2b, { cut:false, spots:0, glow:0 })); c.scale.set(0.36, 0.18, 0.36); c.rotation.x = Math.PI/2; c.rotation.z = 0.2;
    mesh(sh, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), L(R, 0xe0d4b0), 0, 0, -0.05).rotation.x = Math.PI/2;
  }
  if(o.mortar){
    const t = mesh(b, new THREE.CylinderGeometry(0.12, 0.14, 0.75, 8), L(R, 0x5a4a3a), 0.12, 0.1 + 0.85*S, -0.36); t.rotation.x = -0.6;
    mesh(b, new THREE.TorusGeometry(0.13, 0.025, 4, 10), L(R, 0xb08a3a), 0.12, 0.1 + 0.85*S + 0.3, -0.56).rotation.x = -0.6 + Math.PI/2;
  }
  return R;
}

/* ---- the wardens ---- */
Models.squad = function(u){
  const tier = u.armorTier || 0;
  switch(u.cls){
    case "capguard":    return folk({ cap:"porcini", weapon:"scattergun", shield:true, armor:tier, wide:1.12, stem:0xe6dcc2 });
    case "thornblade":  return folk({ cap:"morel", weapon:"thornblade", armor:tier, tall:1.05, wide:0.92, stem:0xefe6d0, eye:0xb6ffcf });
    case "longcap":     return folk({ cap:"parasol", weapon:"needle", armor:tier, tall:1.32, wide:0.88, stem:0xf3ecdc });
    case "sporecaster": return folk({ cap:"amanita", weapon:"wand", armor:tier, stem:0xf6f0e2, eye:0xffd0f4 });
    case "puffbomber":  return folk({ cap:"puffball", weapon:"repeater", mortar:true, armor:tier, tall:0.7, wide:1.15, stem:0xe6ddc8 });
  }
  return folk({ cap:"porcini", weapon:"scattergun", armor:tier });
};

/* ---- the Gloom ---- */
function pustules(R, parent, n, r0, y0, sx, sy, sz, col){
  const out = [];
  for(let i=0;i<n;i++){
    const a = Math.random()*6.28, e = Math.random()*1.2 - 0.1, r = 0.04 + Math.random()*0.06;
    out.push(glowBall(parent, r*(r0 > 0.6 ? 1.6 : 1), col || K.ROT.pus, Math.cos(a)*Math.cos(e)*r0*sx, y0 + Math.sin(e)*r0*sy, Math.sin(a)*Math.cos(e)*r0*sz));
  }
  return out;
}
function eyes(parent, n, y, z, spread, col, r){
  for(let i=0;i<n;i++){ const x = (i - (n - 1)/2)*spread, yy = y + (i % 2)*0.05; glowBall(parent, r || 0.035, col || K.ROT.eye, x, yy, z); }
}
const legs = (R, parent, n, r, y, len, col)=>{
  R.parts.legs = [];
  for(let i=0;i<n;i++){
    const a = (i/n)*Math.PI*2 + 0.3, g = new THREE.Group(); g.position.set(Math.cos(a)*r, y, Math.sin(a)*r); g.rotation.y = -a; parent.add(g);
    const c = mesh(g, new THREE.ConeGeometry(0.035, len, 4), L(R, col || K.ROT.dark), len*0.35, -len*0.3, 0); c.rotation.z = -2.2;
    R.parts.legs.push({ g, a, ph:i*1.7 });
  }
};
const fleshGeo = (r, det, amt, c1, c2)=> K.paint(K.lump(r, det, amt), c1, (c, x, y, z)=>{ const k = Math.sin(x*9 + z*7)*Math.sin(y*11); if(k > 0.3) c.lerp(new THREE.Color(c2), 0.6); c.offsetHSL(0, 0, (Math.random() - 0.5)*0.04); });

Models.gloom = function(u){
  const R = rig(), b = R.body;
  switch(u.type){
    case "rotling": {
      const body = mesh(b, fleshGeo(0.42, 1, 0.38, K.ROT.flesh, 0x4a2050), VL(R), 0, 0.42, 0); body.scale.set(1, 0.72, 1.12);
      pustules(R, b, 6, 0.4, 0.5, 1, 0.7, 1.1);
      eyes(b, 4, 0.5, 0.42, 0.09);
      legs(R, b, 6, 0.3, 0.32, 0.55);
      for(const s of [-1, 1]){ const c = mesh(b, new THREE.ConeGeometry(0.05, 0.5, 4), L(R, 0x3a2040), s*0.22, 0.35, 0.45); c.rotation.x = 1.9; }
      R.head = 1.05; R.muzzle.position.set(0, 0.4, 0.55); b.add(R.muzzle);
      R.idle = (t)=>{ R.parts.legs.forEach(l=>{ l.g.rotation.z = Math.sin(t*9 + l.ph)*0.15; }); };
      break;
    }
    case "spitter": {
      const body = mesh(b, fleshGeo(0.5, 1, 0.3, 0x3b4a2a, 0x5a6a3a), VL(R), 0, 0.58, 0); body.scale.set(1, 1.15, 1);
      for(let i=0;i<26;i++){ const a = Math.random()*6.28, e = Math.random()*1.3 - 0.2, c = mesh(b, new THREE.ConeGeometry(0.02, 0.16, 3), L(R, 0xb8d8a0),
        Math.cos(a)*Math.cos(e)*0.5, 0.58 + Math.sin(e)*0.55, Math.sin(a)*Math.cos(e)*0.5); c.lookAt(c.position.x*3, c.position.y*1.5, c.position.z*3); c.rotateX(Math.PI/2); }
      const sp = new THREE.Group(); sp.position.set(0, 1.05, 0.22); sp.rotation.x = 0.7; b.add(sp);
      mesh(sp, new THREE.CylinderGeometry(0.1, 0.18, 0.4, 8, 1, true), L(R, 0x2a361e, { side:THREE.DoubleSide }), 0, 0.15, 0);
      const rim = mesh(sp, new THREE.TorusGeometry(0.1, 0.025, 4, 10), K.basic(K.ROT.bile), 0, 0.36, 0); rim.rotation.x = Math.PI/2;
      R.muzzle.position.set(0, 0.4, 0); sp.add(R.muzzle);
      eyes(b, 2, 0.75, 0.46, 0.16, 0xffe14a, 0.05);
      pustules(R, b, 4, 0.5, 0.6, 1, 1.1, 1, K.ROT.bile);
      legs(R, b, 3, 0.3, 0.25, 0.4);
      R.head = 1.6;
      R.idle = (t)=>{ sp.rotation.x = 0.7 + Math.sin(t*1.7)*0.1; };
      break;
    }
    case "bloater": {
      const body = mesh(b, fleshGeo(0.85, 2, 0.12, 0x5b4a5e, 0x7a6a3a), VL(R, {}), 0, 0.92, 0); body.scale.set(1, 0.9, 1);
      R.parts.belly = body;
      pustules(R, b, 14, 0.82, 0.95, 1, 0.9, 1);
      eyes(b, 2, 1.1, 0.78, 0.22, 0xffe14a, 0.06);
      for(let i=0;i<3;i++){ const v = mesh(b, new THREE.CylinderGeometry(0.04, 0.09, 0.25, 6), L(R, 0x3a2a3e), (i - 1)*0.25, 1.7, -0.1); v.rotation.z = (i - 1)*0.3; }
      legs(R, b, 4, 0.55, 0.3, 0.45);
      R.head = 2.1; R.muzzle.position.set(0, 0.9, 0.8); b.add(R.muzzle);
      R.idle = (t)=>{ const k = 1 + Math.sin(t*2.2)*0.04; body.scale.set(k, 0.9*k, k); };
      break;
    }
    case "husk": {
      const F = folk({ cap:"husk", armor:-1, stem:0x6a6670, foot:0x3a3640, eye:0xffb24a, wide:1.1, tall:1.08 });
      F.idle = null;
      // the maul: a fist of dead cap on the right arm
      const fist = mesh(F.parts.armR.a, fleshGeo(0.22, 1, 0.3, 0x3a2c3a, 0x5a3a4a), VL(F), 0.06, -0.32, 0.18);
      pustules(F, F.parts.armR.a, 4, 0.2, -0.3, 1, 1, 1, 0xffb24a);
      F.muzzle.position.set(0.06, -0.32, 0.3); F.parts.armR.a.add(F.muzzle);
      pustules(F, F.body, 5, 0.3, 0.5, 1, 1, 1, 0xffb24a);
      F.parts.fist = fist;
      return F;
    }
    case "shaman": {
      const prof = [[0.42, 0], [0.36, 0.3], [0.26, 0.9], [0.18, 1.3], [0.12, 1.45]].map(p=> new THREE.Vector2(p[0], p[1]));
      mesh(b, new THREE.LatheGeometry(prof, 10), L(R, 0x2b1838), 0, 0.02, 0);
      const hood = new THREE.Group(); hood.position.set(0, 1.42, 0.02); b.add(hood);
      const h = mesh(hood, new THREE.ConeGeometry(0.3, 0.7, 8), L(R, 0x1d1026), 0, 0.22, -0.04); h.rotation.x = -0.25;
      mesh(hood, new THREE.SphereGeometry(0.2, 8, 6), K.basic(0x05020a), 0, 0.05, 0.12);
      eyes(hood, 2, 0.07, 0.27, 0.1, 0xff4fd8, 0.035);
      for(let i=0;i<7;i++){ const a = i/7*6.28, x = Math.cos(a)*0.34, z = Math.sin(a)*0.34, d = 0.15 + Math.random()*0.25;
        glowBall(b, 0.06 + Math.random()*0.03, 0xff4fd8, x, 0.85 - d, z); }
      const st = new THREE.Group(); st.position.set(0.38, 0.1, 0.18); b.add(st); R.parts.gun = st;
      mesh(st, new THREE.CylinderGeometry(0.03, 0.04, 1.9, 6), L(R, 0x241812), 0, 0.95, 0);
      const orb = glowBall(st, 0.11, K.ROT.pus, 0, 1.95, 0); haloSprite(st, K.ROT.pus, 1.1, 0, 1.95, 0);
      R.muzzle.position.copy(orb.position); st.add(R.muzzle);
      R.head = 2.3;
      R.idle = (t)=>{ hood.rotation.y = Math.sin(t*0.8)*0.2; };
      break;
    }
    case "sporelord": {
      const s = new THREE.Group(); s.scale.setScalar(1.75); b.add(s);
      const body = mesh(s, fleshGeo(0.62, 1, 0.3, 0x2a1a2e, 0x4a1a3e), VL(R), 0, 0.85, 0); body.scale.set(1.1, 1.1, 0.95);
      const head = mesh(s, fleshGeo(0.36, 1, 0.3, 0x2a1a2e, 0x5a2048), VL(R), 0, 1.55, 0.12);
      eyes(s, 6, 1.58, 0.44, 0.1, K.ROT.eye, 0.04);
      for(let i=0;i<11;i++){ const a = i/11*6.28, r = 0.26, hh = 0.5 + Math.random()*0.5;
        const c = mesh(s, new THREE.ConeGeometry(0.04, hh, 5), L(R, 0xff7a2a, { emissive:0x5a1a00 }), Math.cos(a)*r, 1.75 + hh/2, 0.1 + Math.sin(a)*r);
        c.rotation.set(Math.sin(a)*0.5, 0, -Math.cos(a)*0.5); glowBall(s, 0.05, 0xff4fd8, Math.cos(a)*(r + hh*0.24), 1.75 + hh*0.95, 0.1 + Math.sin(a)*(r + hh*0.24)); }
      for(const sd of [-1, 1]){
        const a = new THREE.Group(); a.position.set(sd*0.62, 1.1, 0.1); s.add(a); R.parts[sd < 0 ? "armL" : "armR"] = { a };
        mesh(a, fleshGeo(0.22, 1, 0.3, 0x2a1a2e, 0x4a1a3e), VL(R), sd*0.1, -0.25, 0.05);
        for(let k=0;k<3;k++){ const c = mesh(a, new THREE.ConeGeometry(0.05, 0.45, 4), L(R, 0x160b1a), sd*0.12 + (k - 1)*0.07, -0.55, 0.2); c.rotation.x = 2.4; }
      }
      pustules(R, s, 16, 0.62, 0.9, 1.1, 1.1, 0.95);
      legs(R, s, 6, 0.45, 0.45, 0.7);
      R.muzzle.position.set(0, 1.5, 0.9); s.add(R.muzzle);
      R.head = 4.4;
      R.idle = (t)=>{ R.parts.legs.forEach(l=>{ l.g.rotation.z = Math.sin(t*3 + l.ph)*0.1; }); head.rotation.y = Math.sin(t*0.6)*0.3; };
      break;
    }
    case "heart": {
      const core = mesh(b, fleshGeo(1.0, 2, 0.22, 0x6a1240, 0x9a1a5a), VL(R, { emissive:0x2a0418 }), 0, 0.85, 0); core.scale.set(1, 0.85, 1);
      pustules(R, b, 18, 0.95, 0.85, 1, 0.85, 1, K.ROT.vein);
      pustules(R, b, 8, 0.95, 0.85, 1, 0.85, 1, K.ROT.pus);
      for(let i=0;i<9;i++){ const a = i/9*6.28 + Math.random()*0.3, t = mesh(b, new THREE.ConeGeometry(0.16, 1.9, 5), L(R, 0x3a0a2a), Math.cos(a)*1.4, 0.12, Math.sin(a)*1.4);
        t.rotation.set(0, -a, Math.PI/2 - 0.08); t.rotateY(0); }
      const ring = new THREE.Mesh(K.glowPlane, K.glowMat(0xff3fb0, 0.6)); ring.scale.set(6, 1, 6); ring.position.y = 0.06; b.add(ring);
      haloSprite(b, 0xff3fb0, 3.2, 0, 1.0, 0);
      R.head = 2.4; R.muzzle.position.set(0, 1.0, 0); b.add(R.muzzle);
      R.idle = (t)=>{ const beat = Math.pow(Math.max(0, Math.sin(t*3.2)), 6); core.scale.set(1 + beat*0.08, 0.85 + beat*0.08, 1 + beat*0.08); };
      break;
    }
  }
  return R;
};

Models.SCALE = 1.3;     // a touch larger than life, so they read against the giant caps
Models.build = function(u){
  const R = u.team === "squad" ? Models.squad(u) : Models.gloom(u);
  R.body.scale.setScalar(Models.SCALE); R.head *= Models.SCALE;
  R.root.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  // the team ring on the ground
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 32), new THREE.MeshBasicMaterial({
    color:u.team === "squad" ? 0x46e4ff : 0xff3f8a, transparent:true, opacity:0.55, depthWrite:false, side:THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.04; R.root.add(ring); R.ring = ring;
  if(u.boss) ring.scale.setScalar(1.8);
  if(u.type === "heart") ring.visible = false;
  // an invisible column to click on
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, Math.max(1.4, R.head), 8), new THREE.MeshBasicMaterial({ visible:false }));
  hit.position.y = Math.max(1.4, R.head)/2; R.root.add(hit); R.hit = hit;
  return R;
};

/* a quick portrait: the model alone, head and shoulders, rendered once to a data URL */
Models.portraits = {};
Models.portrait = function(key, u){
  if(Models.portraits[key]) return Models.portraits[key];
  try{
    const r = Models._pr || (Models._pr = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true }));
    r.setSize(96, 96); r.setPixelRatio(1);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x30283a, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(1, 2, 3); sc.add(d);
    const R = Models.build(u); R.ring.visible = false; sc.add(R.root);
    R.root.rotation.y = -0.45;
    const h = R.head, cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const big = u.type === "sporelord" || u.type === "heart";
    cam.position.set(0, h*0.78, (big ? 7 : 2.6) + h*0.4); cam.lookAt(0, h*0.62, 0);
    r.render(sc, cam);
    return Models.portraits[key] = r.domElement.toDataURL();
  }catch(e){ return ""; }
};

})();
