/* ------------------------------------------------------------------ *
 *  Effects: one pool of additive sparks for everything that bursts,
 *  drifts or trails; projectiles; rings for blasts and spells; and the
 *  floating numbers over heads.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, K = GS.Kit, S = GS.Stage;
const FX = GS.FX = {};

const N = 4000;
let pts, P, alive = 0;
FX.init = function(scene){
  P = { pos:new Float32Array(N*3), col:new Float32Array(N*3), size:new Float32Array(N), vel:new Float32Array(N*3), life:new Float32Array(N), max:new Float32Array(N), grav:new Float32Array(N), drag:new Float32Array(N), base:new Float32Array(N*3) };
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color", new THREE.BufferAttribute(P.col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({ uniforms:{ uScale:{ value:window.innerHeight/2 } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
    vertexShader:"attribute float aSize; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = clamp(uScale*aSize/max(1.0, -mv.z), 0.0, 64.0); gl_Position = projectionMatrix*mv; }",
    fragmentShader:"varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if(d > 0.5) discard; float k = 1.0 - d*2.0; gl_FragColor = vec4(vC*k*k, 1.0); }" });
  K.timed.push(m);
  pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
  FX.scene = scene;
  FX.items = [];
};
FX.clear = function(){ alive = 0; if(P){ P.life.fill(0); P.size.fill(0); } (FX.items || []).forEach(i=> i.obj && FX.scene.remove(i.obj)); FX.items = []; };

function emit(x, y, z, vx, vy, vz, col, size, life, grav, drag){
  let i = -1;
  for(let k=0;k<N;k++){ const j = (alive + k) % N; if(P.life[j] <= 0){ i = j; break; } }
  if(i < 0) i = alive % N;
  alive = (i + 1) % N;
  P.pos[i*3] = x; P.pos[i*3+1] = y; P.pos[i*3+2] = z;
  P.vel[i*3] = vx; P.vel[i*3+1] = vy; P.vel[i*3+2] = vz;
  const c = typeof col === "number" ? new THREE.Color(col) : col;
  P.base[i*3] = c.r; P.base[i*3+1] = c.g; P.base[i*3+2] = c.b;
  P.size[i] = size; P.life[i] = life; P.max[i] = life; P.grav[i] = grav || 0; P.drag[i] = drag === undefined ? 1.5 : drag;
}
FX.emit = emit;

/* a burst of sparks */
FX.burst = function(p, col, n, speed, size, life, opts){
  opts = opts || {};
  const c = new THREE.Color(col), c2 = opts.col2 !== undefined ? new THREE.Color(opts.col2) : null;
  for(let i=0;i<n;i++){
    const a = Math.random()*6.283, e = (opts.flat ? 0.1 : Math.random()*1.4 - 0.2), s = speed*(0.3 + Math.random()*0.7);
    const cc = c2 && Math.random() < 0.5 ? c2 : c;
    emit(p.x + (Math.random() - 0.5)*(opts.spread || 0), p.y + (Math.random() - 0.5)*(opts.spread || 0)*0.5, p.z + (Math.random() - 0.5)*(opts.spread || 0),
      Math.cos(a)*Math.cos(e)*s, Math.sin(e)*s + (opts.up || 0), Math.sin(a)*Math.cos(e)*s, cc, size*(0.6 + Math.random()*0.6), life*(0.6 + Math.random()*0.6), opts.grav || 0, opts.drag);
  }
};
/* motes rising, for heals and casting */
FX.rise = function(p, col, n, r){
  for(let i=0;i<n;i++){ const a = Math.random()*6.28, d = Math.random()*(r || 0.6);
    emit(p.x + Math.cos(a)*d, p.y + Math.random()*0.4, p.z + Math.sin(a)*d, 0, 1.2 + Math.random()*1.4, 0, col, 0.25 + Math.random()*0.2, 0.9 + Math.random()*0.6, 0, 0.5); }
};

/* an expanding ring on the ground */
FX.ring = function(p, col, radius, dur){
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
  m.rotation.x = -Math.PI/2; m.position.set(p.x, p.y + 0.08, p.z); FX.scene.add(m);
  const fill = new THREE.Mesh(K.glowPlane, K.glowMat(col, 0.8)); fill.position.set(p.x, p.y + 0.06, p.z); FX.scene.add(fill);
  FX.items.push({ t:0, dur:dur || 0.6, obj:m, extra:fill, step(k){ const r = 0.2 + radius*Math.sqrt(k); m.scale.setScalar(r); m.material.opacity = 0.9*(1 - k); fill.scale.set(r*2.4, 1, r*2.4); fill.material.opacity = 0.8*(1 - k); },
    done(){ FX.scene.remove(m); FX.scene.remove(fill); } });
};

/* a projectile from a to b; resolves when it lands */
FX.shot = function(a, b, kind, onLand){
  const look = {
    pellets:  { c:0xffc46a, n:5, spread:0.35, speed:44, size:0.22 },
    needle:   { c:0xd8fbff, n:1, speed:70, size:0.3, trail:0x7ff0ff },
    glowbolt: { c:0x7ff0ff, n:1, speed:30, size:0.55, trail:0x46d4ff },
    burst:    { c:0xffd48a, n:3, spread:0.2, speed:46, size:0.22, stagger:0.07 },
    acid:     { c:0xc6ff4a, n:1, speed:18, size:0.5, trail:0x9cff3a, arc:1.6 },
    hex:      { c:0xff4fd8, n:1, speed:22, size:0.55, trail:0xa040ff },
    mortar:   { c:0xfff0c0, n:1, speed:16, size:0.6, trail:0xffa040, arc:6 },
    throw:    { c:0xffe0a0, n:1, speed:16, size:0.45, trail:0xffc060, arc:3.5 },
    spell:    { c:0xaaf6ff, n:1, speed:24, size:0.6, trail:0x46d4ff, arc:2.5 },
    storm:    { c:0xc6ff4a, n:1, speed:16, size:0.8, trail:0xff4fd8, arc:6 }
  }[kind] || { c:0xffffff, n:1, speed:40, size:0.3 };
  return new Promise(res=>{
    let landed = 0;
    for(let i=0;i<look.n;i++){
      const off = new THREE.Vector3((Math.random() - 0.5)*(look.spread || 0), (Math.random() - 0.5)*(look.spread || 0), (Math.random() - 0.5)*(look.spread || 0));
      const to = b.clone().add(off), from = a.clone(), dist = from.distanceTo(to), dur = Math.max(0.12, dist/look.speed);
      const m = new THREE.Mesh(new THREE.SphereGeometry(look.size*0.35, 6, 4), K.basic(look.c));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:K.glowTex, color:look.trail || look.c, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false }));
      halo.scale.setScalar(look.size*2.2); m.add(halo);
      m.position.copy(from); m.visible = false;
      FX.scene.add(m);
      FX.items.push({ t:-(look.stagger || 0.025)*i, dur, obj:m, step(k){
        if(k < 0) return; m.visible = true;
        m.position.lerpVectors(from, to, k);
        if(look.arc) m.position.y += Math.sin(k*Math.PI)*look.arc*Math.min(1, dist/12);
        if(look.trail && Math.random() < 0.85) emit(m.position.x, m.position.y, m.position.z, (Math.random() - 0.5)*0.4, (Math.random() - 0.5)*0.4, (Math.random() - 0.5)*0.4, look.trail, look.size*0.7, 0.35, 0, 2);
      }, done(){ FX.scene.remove(m); if(++landed === look.n){ onLand && onLand(to); res(to); } } });
    }
  });
};

/* the hit itself, by kind of hurt */
FX.impact = function(p, kind, crit){
  const big = crit ? 1.6 : 1;
  switch(kind){
    case "glow":  FX.burst(p, 0x9ff4ff, 26*big, 5, 0.35, 0.5, { col2:0xffffff }); break;
    case "spore": FX.burst(p, 0xc6ff4a, 22*big, 3.5, 0.4, 0.7, { col2:0xff4fd8, up:0.6 }); break;
    case "rot":   FX.burst(p, 0x9cff3a, 14*big, 3.5, 0.3, 0.5, { col2:0x6a1a5a }); break;
    case "blade": FX.burst(p, 0xd8ffe8, 18*big, 6, 0.25, 0.35, { col2:0x46e4ff, flat:true }); break;
    case "blast": FX.burst(p, 0xffb050, 40*big, 7, 0.5, 0.7, { col2:0xfff0c0, up:1.5, grav:-6 }); break;
    default:      FX.burst(p, 0xffd28a, 16*big, 5, 0.25, 0.35, { col2:0xffffff });
  }
  if(crit) FX.burst(p, 0xffffff, 10, 8, 0.4, 0.25);
};
FX.miss = function(p){ FX.burst(p, 0x8aa0b8, 6, 3, 0.18, 0.3); };
FX.death = function(p, team){
  if(team === "gloom"){ FX.burst(p, 0x9cff3a, 40, 3, 0.45, 1.2, { col2:0x8a2a9a, up:1.2, spread:0.8, drag:2 }); FX.ring(p, 0x9cff3a, 2, 0.7); }
  else FX.burst(p, 0x9ff4ff, 30, 2, 0.4, 1.4, { up:1.5, spread:0.6, drag:2.5 });
};
FX.aoe = function(p, radius, kind){
  const col = { blast:0xffa040, glow:0x7ff0ff, spore:0xc6ff4a, rotburst:0x9cff3a, pod:0xff4fd8 }[kind] || 0xffffff;
  FX.ring(p, col, radius*K.T, 0.7);
  const n = Math.round(30 + radius*40);
  if(kind === "blast"){ FX.burst(p, 0xffb050, n, 9, 0.6, 0.8, { col2:0xfff0c0, up:2, spread:radius, grav:-5 }); FX.burst(p, 0x5a4a3a, 20, 5, 0.5, 1.2, { up:3, grav:-9, spread:radius }); }
  else if(kind === "glow") FX.burst(p, 0x9ff4ff, n, 6, 0.5, 0.9, { col2:0xffffff, up:2, spread:radius*1.5 });
  else FX.burst(p, col, n, 4, 0.6, 1.4, { col2:0xff4fd8, up:1, spread:radius*1.5, drag:2 });
  S.shake(kind === "blast" ? 0.5 : 0.2);
};

/* tweens: a function of k from 0 to 1 over dur seconds */
FX.tween = function(dur, step){
  return new Promise(res=>{ FX.items.push({ t:0, dur, step, done:res }); });
};
FX.wait = ms=> new Promise(r=> setTimeout(r, ms));

FX.update = function(dt){
  // sparks
  if(P){
    for(let i=0;i<N;i++){
      if(P.life[i] <= 0){ if(P.size[i]){ P.size[i] = 0; } continue; }
      P.life[i] -= dt;
      const k = Math.max(0, P.life[i]/P.max[i]), d = Math.exp(-P.drag[i]*dt);
      P.vel[i*3] *= d; P.vel[i*3+1] = P.vel[i*3+1]*d + P.grav[i]*dt; P.vel[i*3+2] *= d;
      P.pos[i*3] += P.vel[i*3]*dt; P.pos[i*3+1] += P.vel[i*3+1]*dt; P.pos[i*3+2] += P.vel[i*3+2]*dt;
      P.col[i*3] = P.base[i*3]*k; P.col[i*3+1] = P.base[i*3+1]*k; P.col[i*3+2] = P.base[i*3+2]*k;
      if(P.life[i] <= 0) P.size[i] = 0;
    }
    const g = pts.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
  // tweens and projectiles
  for(let i=FX.items.length-1;i>=0;i--){
    const it = FX.items[i]; it.t += dt;
    const k = it.t < 0 ? -1 : Math.min(1, it.t/it.dur);
    it.step && it.step(k);
    if(k >= 1){ FX.items.splice(i, 1); it.done && it.done(); }
  }
};

/* ---- floating words over the field ---- */
FX.float = function(world, text, cls){
  const el = document.createElement("div"); el.className = "float " + (cls || ""); el.textContent = text;
  document.getElementById("labels").appendChild(el);
  const p = world.clone(), t0 = performance.now();
  const step = ()=>{
    const k = (performance.now() - t0)/1300;
    if(k >= 1){ el.remove(); return; }
    const s = S.project(p.x, p.y + k*1.2, p.z);
    el.style.transform = "translate(" + s.x + "px," + s.y + "px) translate(-50%,-50%) scale(" + (k < 0.12 ? 0.6 + k*3.4 : 1) + ")";
    el.style.opacity = k > 0.7 ? (1 - k)/0.3 : 1;
    requestAnimationFrame(step);
  };
  step();
};

})();
