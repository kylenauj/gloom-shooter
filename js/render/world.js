/* ------------------------------------------------------------------ *
 *  The battlefield, built from the logic's map.
 *
 *  One ground: the grid's clearing is flat (the rules are), the forest
 *  floor rolls up into hills beyond it. It's painted in the shader in
 *  world space, the way Pine Hollow paints its road: blue-black moss,
 *  mycelium threads, glowing specks, the Gloom's rot where the map says,
 *  the tile grid faint over the clearing, and the fog of war darkening
 *  whatever the squad can't see. Rock shelves share the same paint.
 *
 *  Every prop on a tile is its own little group, so a blast can smash
 *  it and a harvest can dim it. The giant caps fade (dithered) when
 *  they stand between the camera and the fight.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, K = GS.Kit;

class World {
  constructor(map, opts){
    opts = opts || {};
    this.map = map;
    this.group = new THREE.Group();
    this.rnd = K.seeded((map.seed || 1)*31 + 7);
    this.T = K.T;
    this.ox = -map.w*K.T/2; this.oz = -map.h*K.T/2;
    this.props = {};          // "x,y" -> group
    this.caps = [];           // occluders: { mat, c:Vector3, r }
    this.anims = [];
    this.pickables = [];
    this.buildGround();
    this.buildLedges();
    this.buildProps();
    this.buildBorder(opts.border !== false);
    this.buildAmbient();
  }

  /* tile <-> world */
  wx(x){ return this.ox + (x + 0.5)*this.T; }
  wz(y){ return this.oz + (y + 0.5)*this.T; }
  gy(x, y){ const t = this.map.at(x, y); return t && t.h ? K.LEDGE : 0; }
  pos(x, y){ return new THREE.Vector3(this.wx(x), this.gy(x, y), this.wz(y)); }
  tileAt(px, pz){ return { x:Math.floor((px - this.ox)/this.T), y:Math.floor((pz - this.oz)/this.T) }; }

  /* ---- the ground ---- */
  buildGround(){
    const M = this.map, W = M.w*this.T, H = M.h*this.T, margin = 70;
    // per tile: R = vision (fog of war), G = rot, B = spare, A = 1
    this.info = new Uint8Array(M.w*M.h*4);
    for(let i=0;i<M.w*M.h;i++){ this.info[i*4] = 90; this.info[i*4+1] = M.tiles[i].hazard === "rot" ? 255 : 0; this.info[i*4+3] = 255; }
    this.infoTex = new THREE.DataTexture(this.info, M.w, M.h, THREE.RGBAFormat);
    this.infoTex.magFilter = THREE.LinearFilter; this.infoTex.minFilter = THREE.LinearFilter; this.infoTex.needsUpdate = true;

    const seg = 2, gw = W + margin*2, gh = H + margin*2;
    const g = new THREE.PlaneGeometry(gw, gh, Math.round(gw/seg), Math.round(gh/seg));
    g.rotateX(-Math.PI/2);
    const p = g.attributes.position, hw = W/2 + 1, hh = H/2 + 1;
    for(let i=0;i<p.count;i++){
      const x = p.getX(i), z = p.getZ(i);
      const out = Math.max(Math.abs(x) - hw, Math.abs(z) - hh, 0);
      const roll = Math.sin(x*0.13 + Math.cos(z*0.09)*1.6)*0.9 + Math.cos(z*0.11 + Math.sin(x*0.07)*1.4)*0.8;
      p.setY(i, out > 0 ? GS.clamp(out/14, 0, 1)*(3 + roll*2.5) + Math.pow(Math.max(0, out - 26)/30, 2)*8 : 0);
    }
    g.computeVertexNormals();
    this.groundMat = World.groundMaterial(this);
    const ground = new THREE.Mesh(g, this.groundMat);
    ground.receiveShadow = true;
    this.group.add(ground); this.pickables.push(ground); this.ground = ground;
  }
  static groundMaterial(w){
    const m = new THREE.MeshLambertMaterial({ color:0xffffff });
    const U = { uInfo:{ value:w.infoTex }, uOrigin:{ value:new THREE.Vector2(w.ox, w.oz) }, uSize:{ value:new THREE.Vector2(w.map.w, w.map.h) },
                uTile:{ value:w.T }, uTime:{ value:0 }, uHover:{ value:new THREE.Vector2(-99, -99) } };
    m.userData.U = U;
    m.onBeforeCompile = sh=>{
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWG; varying vec3 vNG;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWG = (modelMatrix*vec4(transformed, 1.0)).xyz; vNG = normalize(mat3(modelMatrix)*objectNormal);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", ["#include <common>",
          "varying vec3 vWG; varying vec3 vNG; uniform sampler2D uInfo; uniform vec2 uOrigin, uSize, uHover; uniform float uTile, uTime;",
          "float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }",
          "float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);",
          "  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }",
          "float fbm(vec2 p){ return gn(p)*0.55 + gn(p*2.1 + 3.7)*0.28 + gn(p*4.3 + 1.3)*0.17; }"].join("\n"))
        .replace("#include <map_fragment>", ["#include <map_fragment>",
          "vec2 gp = (vWG.xz - uOrigin)/uTile; vec4 inf = texture2D(uInfo, gp/uSize);",
          "float inside = step(0.0, gp.x)*step(0.0, gp.y)*step(gp.x, uSize.x)*step(gp.y, uSize.y);",
          "float n = fbm(vWG.xz*0.35), n2 = fbm(vWG.xz*1.7 + 9.0);",
          "vec3 moss = mix(vec3(0.045, 0.07, 0.085), vec3(0.07, 0.115, 0.11), n);",
          "moss = mix(moss, vec3(0.09, 0.08, 0.1), smoothstep(0.55, 0.8, n2)*0.6);",
          // mycelium: pale threads wandering through the moss
          "float th = abs(sin(vWG.x*0.9 + sin(vWG.z*0.7)*2.4 + n*5.0))*abs(sin(vWG.z*1.1 + sin(vWG.x*0.6)*2.0));",
          "moss = mix(moss, vec3(0.32, 0.36, 0.38), smoothstep(0.025, 0.0, th)*0.35);",
          // rock: the shelves' faces and the far hills' steep bits
          "float rock = smoothstep(0.75, 0.5, vNG.y);",
          "vec3 stone = mix(vec3(0.11, 0.12, 0.15), vec3(0.17, 0.18, 0.21), n2);",
          "vec3 col = mix(moss, stone, rock);",
          // rot: the Gloom's ground, violet flesh with bile-green veins
          "float rot = smoothstep(0.25, 0.75, inf.g)*inside;",
          "float vein = smoothstep(0.08, 0.0, abs(fbm(vWG.xz*0.8 + 4.0) - 0.5));",
          "col = mix(col, mix(vec3(0.13, 0.04, 0.12), vec3(0.2, 0.06, 0.16), n2) , rot);",
          "diffuseColor.rgb *= col;"].join("\n"))
        .replace("#include <emissivemap_fragment>", ["#include <emissivemap_fragment>",
          // glowing specks of moss and spore (from Glowcap Hollow's floor)
          "float speck = step(0.955, gh(floor(vWG.xz*2.6)))*smoothstep(0.4, 0.15, length(fract(vWG.xz*2.6) - 0.5));",
          "totalEmissiveRadiance += vec3(0.25, 0.75, 1.0)*speck*0.55*(0.7 + 0.3*sin(uTime*1.3 + gh(floor(vWG.xz*2.6))*20.0))*(1.0 - rock);",
          "totalEmissiveRadiance += vec3(0.02, 0.09, 0.12)*smoothstep(0.6, 0.85, n)*(1.0 - rock);",
          "totalEmissiveRadiance += (vec3(0.5, 1.0, 0.15)*vein*0.45*(0.6 + 0.4*sin(uTime*2.0 + vWG.x)) + vec3(0.12, 0.0, 0.1))*rot;",
          // the tile grid, faint, only over the clearing; brighter round the hovered tile
          "vec2 f = abs(fract(gp) - 0.5);",
          "float line = smoothstep(0.47, 0.5, max(f.x, f.y))*inside*(1.0 - rock*0.5);",
          "float hov = smoothstep(2.5, 0.0, length(gp - uHover - 0.5));",
          "totalEmissiveRadiance += vec3(0.25, 0.7, 0.9)*line*(0.07 + 0.25*hov);"].join("\n"))
        .replace("#include <fog_fragment>", ["#include <fog_fragment>",
          // fog of war: what no trooper can see goes dim and cold
          "float vis = mix(0.55, inf.r/255.0*255.0/255.0, inside);",
          "float lit = mix(0.38, 1.0, smoothstep(0.25, 0.9, vis));",
          "gl_FragColor.rgb = mix(gl_FragColor.rgb*lit, gl_FragColor.rgb*lit*vec3(0.75, 0.85, 1.15), 1.0 - lit);"].join("\n"));
    };
    K.timed.push({ uniforms:U });
    return m;
  }
  /* vision from the battle: 2 seen now, 1 seen before, 0 never */
  setFog(fog){
    for(let i=0;i<fog.length;i++) this.info[i*4] = fog[i] === 2 ? 255 : fog[i] === 1 ? 110 : 70;
    this.infoTex.needsUpdate = true;
  }
  setHover(x, y){ this.groundMat.userData.U.uHover.value.set(x, y); }

  /* ---- rock shelves: one box per raised tile, rough rocks along the edges ---- */
  buildLedges(){
    const M = this.map, parts = [], rocks = [];
    M.tiles.forEach(t=>{
      if(!t.h) return;
      parts.push(K.at(new THREE.BoxGeometry(this.T, K.LEDGE, this.T), this.wx(t.x), K.LEDGE/2, this.wz(t.y)));
      for(const [dx, dy] of GS.DIRS4){
        const n = M.at(t.x + dx, t.y + dy);
        if(n && n.h) continue;
        for(let k=0;k<2;k++){
          const along = (this.rnd() - 0.5)*this.T*0.9, r = 0.35 + this.rnd()*0.3;
          const x = this.wx(t.x) + dx*this.T*0.5 + (dy ? along : 0), z = this.wz(t.y) + dy*this.T*0.5 + (dx ? along : 0);
          rocks.push(K.at(K.paint(K.lump(r, 0, 0.35), 0x2a2e38, (c)=> c.offsetHSL(0, 0, (this.rnd() - 0.5)*0.05)), x, K.LEDGE*0.45 + (this.rnd() - 0.5)*0.3, z, 0, this.rnd()*6, 0, 1, 1.2, 1));
        }
      }
    });
    if(parts.length){
      const m = new THREE.Mesh(K.merge(parts), this.groundMat);
      m.receiveShadow = true; m.castShadow = true;
      this.group.add(m); this.pickables.push(m);
    }
    if(rocks.length){
      const r = new THREE.Mesh(K.merge(rocks), K.vlambert({}));
      r.castShadow = true; r.receiveShadow = true; this.group.add(r);
    }
  }

  /* ---- the props ---- */
  buildProps(){
    const M = this.map;
    this.halo = [];
    M.tiles.forEach(t=>{
      if(!t.prop) return;
      const R = K.seeded(t.seed || (t.x*97 + t.y*13));
      const g = World.PROP[t.prop](this, R, t);
      g.position.set(this.wx(t.x), this.gy(t.x, t.y), this.wz(t.y));
      g.traverse(o=>{ if(o.isMesh && !o.material.transparent && !(o.material.isShaderMaterial)){ o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      this.props[GS.key(t.x, t.y)] = g;
    });
    // little gloom pustules on the rot
    const pus = [];
    M.tiles.forEach(t=>{ if(t.hazard !== "rot") return;
      for(let k=0;k<3;k++){ const r = 0.07 + this.rnd()*0.12;
        pus.push(K.at(K.paint(new THREE.SphereGeometry(r, 6, 4), this.rnd() < 0.7 ? K.ROT.pus : K.ROT.vein), this.wx(t.x) + (this.rnd() - 0.5)*1.6, this.gy(t.x, t.y) + r*0.4, this.wz(t.y) + (this.rnd() - 0.5)*1.6)); } });
    if(pus.length) this.group.add(new THREE.Mesh(K.merge(pus), new THREE.MeshBasicMaterial({ vertexColors:true })));
    if(this.halo.length) this.group.add(K.halos(this.halo));
  }

  /* a blast smashed this tile's cover: splinters and spores, then it's gone */
  smash(x, y){
    const k = GS.key(x, y), g = this.props[k];
    if(!g) return;
    this.group.remove(g); delete this.props[k];
    this.caps = this.caps.filter(c=> c.g !== g);
    // a little rubble left behind
    const R = K.seeded(x*31 + y*17), parts = [];
    for(let i=0;i<5;i++) parts.push(K.at(K.paint(K.lump(0.12 + R()*0.15, 0, 0.4), 0x3a2c22), (R() - 0.5)*1.5, 0.06, (R() - 0.5)*1.5));
    const rub = new THREE.Mesh(K.merge(parts), K.vlambert({}));
    rub.position.copy(this.pos(x, y)); this.group.add(rub);
  }
  /* a node drained: its light goes out */
  harvest(x, y){
    const g = this.props[GS.key(x, y)];
    if(!g || !g.userData.node) return;
    const N = g.userData.node;
    N.core.material.color.setHex(0x2a3a4a); N.glow.material.opacity = 0.08; N.ring.visible = false; N.on = false;
    N.crys.material.color.setHex(0x3a5a6a);
  }

  /* fade any giant cap between the camera and the things that matter */
  updateFade(cam, targets, dt){
    const o = cam.position, d = new THREE.Vector3(), w = new THREE.Vector3();
    this.caps.forEach(c=>{
      let hide = false;
      for(const p of targets){
        d.subVectors(p, o); const L = d.length(); d.divideScalar(L);
        w.subVectors(c.c, o); const t = w.dot(d);
        if(t <= 0 || t >= L) continue;
        if(w.addScaledVector(d, -t).length() < c.r){ hide = true; break; }
      }
      const to = hide ? 0.12 : 1;
      c.mat.uniforms.uFade.value += (to - c.mat.uniforms.uFade.value)*Math.min(1, dt*8);
    });
  }

  /* ---- the forest round the clearing: framing, never in play ---- */
  buildBorder(on){
    if(!on) return;
    const M = this.map, W = M.w*this.T, H = M.h*this.T, stems = [], capsBy = {}, trees = [], halos = [];
    const R = this.rnd;
    const heightAt = (x, z)=>{ const hw = W/2 + 1, hh = H/2 + 1, out = Math.max(Math.abs(x) - hw, Math.abs(z) - hh, 0);
      const roll = Math.sin(x*0.13 + Math.cos(z*0.09)*1.6)*0.9 + Math.cos(z*0.11 + Math.sin(x*0.07)*1.4)*0.8;
      return out > 0 ? GS.clamp(out/14, 0, 1)*(3 + roll*2.5) + Math.pow(Math.max(0, out - 26)/30, 2)*8 : 0; };
    for(let i=0;i<260;i++){
      const a = R()*Math.PI*2, edge = 4 + Math.pow(R(), 1.3)*55;
      let x = Math.cos(a)*(W/2 + edge), z = Math.sin(a)*(H/2 + edge);
      x = GS.clamp(x, -W/2 - 60, W/2 + 60); z = GS.clamp(z, -H/2 - 60, H/2 + 60);
      if(Math.abs(x) < W/2 + 3 && Math.abs(z) < H/2 + 3) continue;
      const y = heightAt(x, z) - 0.2;
      if(R() < 0.42){
        // a giant glowcap, lighting the dark beyond the clearing
        // (low near the clearing, so the camera looks over them; towering further out)
        const out = Math.max(Math.abs(x) - W/2, Math.abs(z) - H/2), Hh = 3 + Math.pow(R(), 1.5)*GS.clamp(out*0.5, 3, 16), cr = 1.6 + Hh*0.3 + R()*1.2, col = K.BLUES[R() < 0.88 ? Math.floor(R()*5) : 5 + Math.floor(R()*2)];
        const w = Math.max(0.25, cr*0.13);
        stems.push(K.at(K.paint(new THREE.CylinderGeometry(w*0.75, w, Hh, 8), 0xcfe4ff), x, y + Hh/2, z));
        (capsBy[col] = capsBy[col] || []).push(K.at(K.capGeo.clone(), x, y + Hh, z, 0, R()*6, 0, cr, cr*0.55, cr));
        halos.push({ x, y:y + Hh + cr*0.2, z, c:col, s:cr*3.4 });
      } else {
        // a dark fir, layered cones
        const out = Math.max(Math.abs(x) - W/2, Math.abs(z) - H/2), th = 4 + R()*GS.clamp(out*0.6, 3, 13), c = new THREE.Color().setHSL(0.48 + R()*0.06, 0.35, 0.05 + R()*0.04);
        trees.push(K.at(K.paint(new THREE.CylinderGeometry(0.15, 0.3, th*0.3, 5), 0x1a1410), x, y + th*0.15, z));
        for(let k=0;k<4;k++){ const f = k/4, r = (1 - f)*th*0.28 + 0.6;
          trees.push(K.at(K.paint(new THREE.ConeGeometry(r, th*0.42, 7), c.getHex(), (cc, vx, vy)=> cc.offsetHSL(0, 0, vy*0.01)), x, y + th*0.25 + f*th*0.62, z)); }
      }
    }
    const stemM = new THREE.Mesh(K.merge(stems), new THREE.MeshLambertMaterial({ vertexColors:true, emissive:0x1d3a66 }));
    this.group.add(stemM);
    Object.keys(capsBy).forEach(col=>{
      const m = new THREE.Mesh(K.merge(capsBy[col]), K.capMat(+col, { spots:0 }));
      this.group.add(m);
    });
    this.group.add(new THREE.Mesh(K.merge(trees), K.vlambert({})));
    this.group.add(K.halos(halos));
    // pools of light on the ground under the far caps
    const gl = new THREE.InstancedMesh(K.glowPlane, K.glowMat(0x2fb8ff, 0.5), halos.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), cc = new THREE.Color();
    halos.forEach((h, i)=>{ v.set(h.x, heightAt(h.x, h.z) + 0.1, h.z); s.set(h.s*0.9, 1, h.s*0.9); m4.compose(v, q, s); gl.setMatrixAt(i, m4); gl.setColorAt(i, cc.setHex(h.c)); });
    gl.instanceMatrix.needsUpdate = true; if(gl.instanceColor) gl.instanceColor.needsUpdate = true; gl.frustumCulled = false;
    this.group.add(gl);
  }

  /* glowbugs over everything, spores in the air, miasma over the rot */
  buildAmbient(){
    const M = this.map, R = this.rnd, W = M.w*this.T, H = M.h*this.T;
    const bugs = [], sp = [], mi = [];
    for(let i=0;i<700;i++) bugs.push((R() - 0.5)*(W + 40), 0.6 + R()*6, (R() - 0.5)*(H + 40));
    for(let i=0;i<400;i++) sp.push((R() - 0.5)*(W + 10), R()*3, (R() - 0.5)*(H + 10));
    M.tiles.forEach(t=>{ if(t.hazard === "rot") for(let k=0;k<6;k++) mi.push(this.wx(t.x) + (R() - 0.5)*2, 0.1 + R()*1.2, this.wz(t.y) + (R() - 0.5)*2); });
    this.group.add(K.motes(bugs, "bugs"));
    this.group.add(K.motes(sp, "spores"));
    if(mi.length) this.group.add(K.motes(mi, "miasma"));
  }

  update(dt, t){
    this.anims.forEach(f=> f(dt, t));
  }
}

/* ---- the props, one builder each. All built at the tile's centre, ground level ---- */
World.PROP = {
  giant(w, R, t){
    const g = new THREE.Group(), H = 5 + R()*3, cr = 1.6 + R()*0.9, col = K.BLUES[R() < 0.85 ? Math.floor(R()*5) : 5 + Math.floor(R()*2)];
    const lean = (R() - 0.5)*0.12, wid = 0.42 + R()*0.12;
    const prof = []; for(let i=0;i<=8;i++){ const f = i/8; prof.push(new THREE.Vector2(wid*(1.25 - f*0.45 + Math.sin(f*9)*0.03) + (f < 0.12 ? (0.12 - f)*2.2 : 0), f*H)); }
    const stem = new THREE.Mesh(new THREE.LatheGeometry(prof, 10), new THREE.MeshLambertMaterial({ color:0xcfe4ff, emissive:0x1d3a66 }));
    stem.rotation.z = lean; g.add(stem);
    const top = new THREE.Vector3(0, H, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), lean);
    const mat = K.capMat(col, { spots:1 });
    const cap = new THREE.Mesh(K.capGeo, mat); cap.position.copy(top); cap.scale.set(cr, cr*0.55, cr); cap.rotation.z = lean; g.add(cap);
    // a ring under the cap where it meets the stem
    const ring = new THREE.Mesh(new THREE.TorusGeometry(wid*0.95, 0.07, 5, 12), new THREE.MeshLambertMaterial({ color:0xdfeaff, emissive:0x24406a }));
    ring.rotation.x = Math.PI/2; ring.position.set(top.x*0.8, H*0.78, 0); g.add(ring);
    const gl = new THREE.Mesh(K.glowPlane, K.glowMat(col, 0.75)); gl.scale.set(cr*2.6, 1, cr*2.6); gl.position.set(top.x, 0.05, 0); g.add(gl);
    // babies round the foot
    for(let i=0;i<3;i++){ const a = R()*6.28, r = 0.55 + R()*0.35, h = 0.3 + R()*0.4, c2 = K.NEON[Math.floor(R()*K.NEON.length)];
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 5), K.lambert(0xf2ecd8)); s.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); g.add(s);
      const c = new THREE.Mesh(K.capGeo, K.capMat(c2, { spots:0 })); c.position.set(Math.cos(a)*r, h, Math.sin(a)*r); c.scale.set(0.2, 0.12, 0.2); g.add(c); }
    // glowworms on threads under the cap
    const lp = []; for(let i=0;i<14;i++){ const a = R()*6.28, r = Math.sqrt(R())*cr*0.85, x = top.x + Math.cos(a)*r, z = Math.sin(a)*r, y0 = H - 0.05, d = 0.4 + R()*1.6; lp.push(x, y0, z, x, y0 - d, z); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color:0x6fc8ff, transparent:true, opacity:0.3 })));
    const wp = []; for(let i=1;i<lp.length/3;i+=2) wp.push(lp[i*3], lp[i*3+1], lp[i*3+2]);
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    g.add(new THREE.Points(wg, new THREE.PointsMaterial({ color:0x8fe8ff, size:0.18, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false })));
    w.halo.push({ x:w.wx(t.x) + top.x, y:w.gy(t.x, t.y) + H + cr*0.2, z:w.wz(t.y), c:col, s:cr*3.2 });
    w.caps.push({ mat, c:new THREE.Vector3(w.wx(t.x) + top.x, w.gy(t.x, t.y) + H + cr*0.15, w.wz(t.y)), r:cr*1.05, g });
    return g;
  },
  boulder(w, R){
    const g = new THREE.Group();
    const geo = K.paint(K.lump(0.95, 1, 0.3), 0x3a4050, (c, x, y)=>{ c.offsetHSL(0, 0, (R() - 0.5)*0.04); if(y > 0.45) c.lerp(new THREE.Color(0x1f4a4a), 0.7); });
    const b = new THREE.Mesh(geo, K.vlambert({})); b.scale.set(1.05, 0.95, 1.0); b.position.y = 0.75; b.rotation.y = R()*6; g.add(b);
    if(R() < 0.6){ const b2 = new THREE.Mesh(K.paint(K.lump(0.5, 1, 0.3), 0x353a48), K.vlambert({})); b2.position.set(0.55, 0.35, 0.45); g.add(b2); }
    // glowing lichen
    for(let i=0;i<5;i++){ const a = R()*6.28, s = new THREE.Mesh(new THREE.SphereGeometry(0.06 + R()*0.05, 5, 3), K.basic(R() < 0.7 ? 0x5ff2ff : 0x9a7bff));
      s.position.set(Math.cos(a)*0.85, 0.5 + R()*0.6, Math.sin(a)*0.8); g.add(s); }
    return g;
  },
  log(w, R){
    const g = new THREE.Group(), L = 1.8;
    const geo = K.paint(new THREE.CylinderGeometry(0.36, 0.42, L, 9, 3), 0x3b2a1e, (c, x, y)=> c.offsetHSL(0, 0, Math.sin(y*9 + x*20)*0.02));
    const p = geo.attributes.position; for(let i=0;i<p.count;i++){ const k = 1 + (Math.sin(p.getY(i)*7 + i)*0.06); p.setX(i, p.getX(i)*k); p.setZ(i, p.getZ(i)*k); } geo.computeVertexNormals();
    const log = new THREE.Mesh(geo, K.vlambert({})); log.rotation.z = Math.PI/2; log.position.y = 0.38; g.add(log);
    // the cut ends, pale
    [-1, 1].forEach(s=>{ const e = new THREE.Mesh(new THREE.CircleGeometry(0.38, 9), K.lambert(0x8a6a44)); e.position.set(s*L/2 + s*0.01, 0.38, 0); e.rotation.y = s*Math.PI/2; g.add(e); });
    // shelf fungus, glowing
    for(let i=0;i<4;i++){ const sf = new THREE.Mesh(new THREE.CylinderGeometry(0.22 + R()*0.1, 0.05, 0.06, 10, 1, false, 0, Math.PI), K.basic(R() < 0.5 ? 0x34e6ff : 0xff9a3a));
      sf.position.set((R() - 0.5)*L*0.8, 0.3 + R()*0.3, (R() < 0.5 ? -1 : 1)*0.36); sf.rotation.y = sf.position.z > 0 ? Math.PI : 0; g.add(sf); }
    // moss on top
    const moss = new THREE.Mesh(K.paint(K.lump(0.3, 1, 0.3), 0x1f5a4a), K.vlambert({})); moss.scale.set(2.2, 0.35, 0.9); moss.position.set(0, 0.72, 0); g.add(moss);
    g.rotation.y = R() < 0.5 ? 0 : Math.PI/2;
    return g;
  },
  cluster(w, R){
    const g = new THREE.Group(), n = 4 + Math.floor(R()*4);
    for(let i=0;i<n;i++){
      const a = R()*6.28, r = R()*0.6, h = 0.35 + R()*0.75, cr = 0.18 + R()*0.28, c = K.NEON[Math.floor(R()*K.NEON.length)];
      const s = new THREE.Mesh(new THREE.CylinderGeometry(cr*0.22, cr*0.32, h, 6), K.lambert(0xf2ecd8, { emissive:0x202838 }));
      s.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); s.rotation.set((R() - 0.5)*0.3, 0, (R() - 0.5)*0.3); g.add(s);
      const cap = new THREE.Mesh(K.capGeo, K.capMat(c, { spots:0.6 })); cap.position.set(Math.cos(a)*r, h - 0.02, Math.sin(a)*r); cap.scale.set(cr, cr*0.6, cr); g.add(cap);
      w.halo.push({ x:0, y:-999, z:0, c, s:0 });
    }
    const gl = new THREE.Mesh(K.glowPlane, K.glowMat(0x8a4dff, 0.35)); gl.scale.set(2.6, 1, 2.6); gl.position.y = 0.04; g.add(gl);
    return g;
  },
  crystal(w, R){
    const g = new THREE.Group(), n = 4 + Math.floor(R()*4);
    const geo = new THREE.CylinderGeometry(0, 0.26, 1, 6); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color:0x7fe6ff, transparent:true, opacity:0.88 });
    for(let i=0;i<n;i++){ const c = new THREE.Mesh(geo, mat), L = 0.6 + R()*1.1; c.scale.set(L*0.9, L, L*0.9);
      c.position.set((R() - 0.5)*0.8, 0, (R() - 0.5)*0.8); c.rotation.set((R() - 0.5)*1.0, R()*6, (R() - 0.5)*1.0); g.add(c); }
    const gl = new THREE.Mesh(K.glowPlane, K.glowMat(0x46d4ff, 0.7)); gl.scale.set(4, 1, 4); gl.position.y = 0.05; g.add(gl);
    return g;
  },
  stump(w, R){
    const g = new THREE.Group();
    const geo = K.paint(new THREE.CylinderGeometry(0.5, 0.65, 0.9, 9, 2), 0x2e2219);
    const p = geo.attributes.position; for(let i=0;i<p.count;i++){ if(p.getY(i) > 0.4) p.setY(i, 0.45 + Math.sin(i*2.3)*0.12); } geo.computeVertexNormals();
    const s = new THREE.Mesh(geo, K.vlambert({})); s.position.y = 0.45; g.add(s);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.38, 9), K.basic(0x0a0608)); hole.rotation.x = -Math.PI/2; hole.position.y = 0.86; g.add(hole);
    for(let i=0;i<3;i++){ const sf = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.04, 0.05, 10, 1, false, 0, Math.PI), K.basic(0xb04dff));
      const a = R()*6.28; sf.position.set(Math.cos(a)*0.55, 0.3 + R()*0.4, Math.sin(a)*0.55); sf.rotation.y = -a + Math.PI/2; g.add(sf); }
    // roots
    for(let i=0;i<4;i++){ const a = i*1.57 + R()*0.5, r = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), K.lambert(0x2a1e16)); r.position.set(Math.cos(a)*0.6, 0.08, Math.sin(a)*0.6); r.rotation.set(0, -a, Math.PI/2); r.rotateZ(0); g.add(r); }
    return g;
  },
  node(w, R, t){
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0, 0.32, 1, 6); geo.translate(0, 0.5, 0);
    const crysM = new THREE.MeshBasicMaterial({ color:0x9ff4ff, transparent:true, opacity:0.9 });
    for(let i=0;i<6;i++){ const c = new THREE.Mesh(geo, crysM), L = 0.9 + R()*1.0; c.scale.set(L*0.9, L, L*0.9);
      c.position.set((R() - 0.5)*0.5, 0, (R() - 0.5)*0.5); c.rotation.set((R() - 0.5)*0.7, R()*6, (R() - 0.5)*0.7); g.add(c); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), K.basic(0xe8fdff)); core.position.y = 1.2; g.add(core);
    const glow = new THREE.Mesh(K.glowPlane, K.glowMat(0x46e4ff, 0.9)); glow.scale.set(5, 1, 5); glow.position.y = 0.05; g.add(glow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), new THREE.MeshBasicMaterial({ color:0x7ff0ff, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.07; g.add(ring);
    const N = g.userData.node = { core, glow, ring, crys:{ material:crysM }, on:true };
    w.anims.push((dt, tt)=>{ if(!N.on) return; core.rotation.y += dt*1.2; core.position.y = 1.2 + Math.sin(tt*2)*0.08;
      const k = (tt*0.6) % 1; ring.scale.setScalar(0.6 + k*1.2); ring.material.opacity = 0.7*(1 - k); });
    w.halo.push({ x:w.wx(t.x), y:w.gy(t.x, t.y) + 1.2, z:w.wz(t.y), c:0x46e4ff, s:4 });
    return g;
  }
};

GS.World = World;
})();
