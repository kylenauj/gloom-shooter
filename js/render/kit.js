/* ------------------------------------------------------------------ *
 *  The asset kit: the small pieces every model and set piece is built
 *  from, carried over from Pine Hollow Rally.
 *
 *  - lumps: icosahedra with a hashed bump per corner, so the facets
 *    stay closed and every lump is different (Bigfoot's fur)
 *  - the soft round glow texture and additive glow materials
 *    (Glowcap Hollow's pools of light under the caps)
 *  - point-sprite fields that drift and blink in the shader: glowbugs,
 *    spores, the Gloom's miasma
 *  - seeded randomness, and a geometry merge so a prop is one draw
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS;
const K = GS.Kit = {};

K.T = 2;            // world units per tile
K.LEDGE = 1.0;      // how high a rock shelf stands

K.BLUES = [0x1e90ff, 0x00d4ff, 0x2fb8ff, 0x1a5cff, 0x34e6ff, 0x5a5cff, 0x8a4dff];
K.NEON  = [0x34e6ff, 0x8a4dff, 0xff4fd8, 0x2fb8ff, 0x5aff9c];
K.ROT   = { flesh:0x2a1630, dark:0x160b1a, pus:0x9cff3a, bile:0xc6ff4a, vein:0xff3fb0, eye:0xe8ff5a };

/* a lumpy, faceted blob (r128 icosahedra are non-indexed, so the
   normals computed here are per face: the facets read as facets) */
K.lump = function(r, det, amt, seed){
  const g = new THREE.IcosahedronGeometry(r, det === undefined ? 1 : det), a = g.attributes.position;
  const s = seed === undefined ? Math.random()*100 : seed, k0 = amt === undefined ? 0.2 : amt;
  for(let i=0;i<a.count;i++){
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const h = Math.sin((Math.round(x*1e3)*12.9898 + Math.round(y*1e3)*78.233 + Math.round(z*1e3)*37.719)*0.001 + s)*43758.5453;
    const k = 1 - k0/2 + (h - Math.floor(h))*k0;
    a.setXYZ(i, x*k, y*k, z*k);
  }
  g.computeVertexNormals();
  return g;
};

/* paint a whole geometry one colour (as a vertex colour), or by a function of the vertex */
K.paint = function(g, col, fn){
  const a = g.attributes.position, c = new THREE.Color(col), out = new Float32Array(a.count*3), t = new THREE.Color();
  for(let i=0;i<a.count;i++){
    t.copy(c); if(fn) fn(t, a.getX(i), a.getY(i), a.getZ(i), i);
    out[i*3] = t.r; out[i*3+1] = t.g; out[i*3+2] = t.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return g;
};

/* merge geometries (non-indexed output), so a prop or a body is one draw */
K.merge = function(list){
  const parts = list.map(g=> g.index ? g.toNonIndexed() : g);
  let n = 0; parts.forEach(g=> n += g.attributes.position.count);
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), col = new Float32Array(n*3);
  let o = 0;
  parts.forEach(g=>{
    const p = g.attributes.position, q = g.attributes.normal, c = g.attributes.color;
    pos.set(p.array, o*3);
    if(q) nor.set(q.array, o*3);
    if(c) col.set(c.array, o*3); else col.fill(1, o*3, (o + p.count)*3);
    o += p.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
};
K.at = function(g, x, y, z, rx, ry, rz, sx, sy, sz){
  if(sx !== undefined) g.scale(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  if(rx) g.rotateX(rx); if(ry) g.rotateY(ry); if(rz) g.rotateZ(rz);
  g.translate(x || 0, y || 0, z || 0);
  return g;
};

K.seeded = function(seed){ return GS.RNG(seed).next; };

/* a soft round glow, for light pooled on the ground, halos, sparks */
K.glowTex = (()=>{
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d");
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();
K.glowPlane = (()=>{ const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI/2); return g; })();
K.glowMat = function(color, opacity){
  return new THREE.MeshBasicMaterial({ map:K.glowTex, color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:opacity === undefined ? 0.6 : opacity });
};
K.lambert = (c, opts)=> new THREE.MeshLambertMaterial(Object.assign({ color:c }, opts));
K.vlambert = opts=> new THREE.MeshLambertMaterial(Object.assign({ vertexColors:true }, opts));
K.basic = (c, opts)=> new THREE.MeshBasicMaterial(Object.assign({ color:c }, opts));

/* everything animated in a shader reads one clock */
K.timed = [];
K.tick = t=>{ K.timed.forEach(m=>{ if(m.uniforms && m.uniforms.uTime) m.uniforms.uTime.value = t; }); };

/* ---- drifting point fields --------------------------------------------
   kind "bugs": blue-white glowbugs that wander and blink
   kind "spores": slow motes rising and wrapping, cyan to magenta
   kind "miasma": the Gloom's green-violet murk, low and sluggish   */
K.motes = function(pos, kind){
  const n = pos.length/3, ph = new Float32Array(n);
  for(let i=0;i<n;i++) ph[i] = Math.random()*6.28;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
  const body = {
    bugs:[
      "vec3 p = position + vec3(sin(uTime*0.5 + aPh*3.0)*1.6, sin(uTime*0.8 + aPh)*0.8, cos(uTime*0.45 + aPh*2.0)*1.6);",
      "vA = 0.25 + 0.75*pow(max(0.0, sin(uTime*1.4 + aPh*5.0)), 2.0);",
      "vC = mix(vec3(0.35, 0.8, 1.0), vec3(0.85, 0.97, 1.0), fract(aPh*0.61)); float sz = 0.26;"],
    spores:[
      "vec3 p = position; p.y += mod(uTime*0.5 + aPh*3.0, 7.0) - 1.0; p.x += sin(uTime*0.4 + aPh*5.0)*1.2; p.z += cos(uTime*0.35 + aPh*4.0)*1.2;",
      "vA = 0.5 + 0.5*sin(uTime*1.3 + aPh*7.0);",
      "vC = mix(vec3(1.0, 0.35, 0.85), vec3(0.3, 0.95, 1.0), fract(aPh*0.37)); float sz = 0.16;"],
    miasma:[
      "vec3 p = position + vec3(sin(uTime*0.25 + aPh*3.0)*0.9, sin(uTime*0.6 + aPh)*0.35 + 0.3, cos(uTime*0.2 + aPh*2.0)*0.9);",
      "vA = 0.35 + 0.65*pow(max(0.0, sin(uTime*0.9 + aPh*4.0)), 2.0);",
      "vC = mix(vec3(0.62, 1.0, 0.22), vec3(0.85, 0.25, 1.0), fract(aPh*0.53)); float sz = 0.3;"]
  }[kind];
  const mat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{ value:0 }, uScale:{ value:window.innerHeight/2 } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:["attribute float aPh; uniform float uTime, uScale; varying float vA; varying vec3 vC;",
      "void main(){", body.join("\n"),
      "  vec4 mv = modelViewMatrix*vec4(p, 1.0);",
      "  gl_PointSize = clamp(uScale*sz/max(1.0, -mv.z), 1.0, 9.0); gl_Position = projectionMatrix*mv; }"].join("\n"),
    fragmentShader:"varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if(d > 0.5) discard; gl_FragColor = vec4(vC*vA*(1.0 - d*1.7), 1.0); }"
  });
  K.timed.push(mat);
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return pts;
};

/* halos: big soft additive points over each glowing cap */
K.halos = function(list){
  const hp = [], hc = [], hs = [], c = new THREE.Color();
  list.forEach(h=>{ hp.push(h.x, h.y, h.z); c.setHex(h.c); hc.push(c.r, c.g, c.b); hs.push(h.s); });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(hp, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3)); g.setAttribute("aSize", new THREE.Float32BufferAttribute(hs, 1));
  const m = new THREE.ShaderMaterial({ uniforms:{ map:{ value:K.glowTex }, uScale:{ value:window.innerHeight/2 } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
    vertexShader:"attribute float aSize; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = min(512.0, uScale*aSize/max(1.0, -mv.z)); gl_Position = projectionMatrix*mv; }",
    fragmentShader:"uniform sampler2D map; varying vec3 vC; void main(){ float k = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC*k*k*0.3, 1.0); }" });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 4;
  return p;
};

/* ---- the glowing cap: a dome and its gills in one, spotted in the shader.
   uFade dithers it away when it stands between the camera and the fight. */
K.capGeo = (()=>{
  const top = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI*2, 0, Math.PI/2);
  const under = new THREE.CircleGeometry(1, 20); under.rotateX(Math.PI/2);
  K.paint(top, 0xffffff); K.paint(under, 0x737373);
  return K.merge([top, under]);
})();
/* the camera's sight line, shared by every cap: caps close to it dither away */
K.sight = { uCam:{ value:new THREE.Vector3(0, 100, 0) }, uTgt:{ value:new THREE.Vector3() }, uClear:{ value:4.5 } };
K.capMat = function(color, opts){
  opts = opts || {};
  const m = new THREE.ShaderMaterial({
    uniforms:{ uCam:K.sight.uCam, uTgt:K.sight.uTgt, uClear:K.sight.uClear, uCut:{ value:opts.cut === false ? 0 : 1 }, uCol:{ value:new THREE.Color(color) }, uFade:{ value:1 }, uSpots:{ value:opts.spots === undefined ? 1 : opts.spots },
               uSpotCol:{ value:new THREE.Color(opts.spotColor || 0xe6fbff) }, uGlow:{ value:opts.glow === undefined ? 1 : opts.glow }, uSeed:{ value:Math.random()*50 } },
    vertexColors:true,
    vertexShader:["varying vec3 vL; varying vec3 vN; varying vec3 vCol; varying vec3 vW;",
      "void main(){ vL = position; vN = normalize(mat3(modelMatrix)*normal); vCol = color; vW = (modelMatrix*vec4(position, 1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }"].join("\n"),
    fragmentShader:["uniform vec3 uCol, uSpotCol, uCam, uTgt; uniform float uFade, uSpots, uGlow, uSeed, uClear, uCut; varying vec3 vL; varying vec3 vN; varying vec3 vCol; varying vec3 vW;",
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }",
      "void main(){",
      // anything right on the line from the camera to what it's looking at dithers out
      "  vec3 sd = uTgt - uCam; float sl = dot(sd, sd); float st = clamp(dot(vW - uCam, sd)/sl, 0.0, 1.0);",
      "  float near = st > 0.02 && st < 0.9 ? smoothstep(uClear*0.6, uClear*1.4, length(vW - uCam - sd*st)) : 1.0;",
      // ...and so does anything looming right in front of the lens
      "  near = min(near, smoothstep(9.0, 17.0, distance(vW, uCam)));",
      "  float fade = min(uFade, mix(1.0, mix(0.1, 1.0, near), uCut));",
      "  if(fade < 0.99){ float n = h(floor(gl_FragCoord.xy) + uSeed); if(n > fade) discard; }",
      "  vec3 c = uCol*vCol;",
      // spots: cells on the dome, scattered, round
      "  vec2 q = vec2(atan(vL.z, vL.x)*2.2, vL.y*5.0) + uSeed; vec2 cell = floor(q); vec2 f = fract(q) - 0.5;",
      "  vec2 o = vec2(h(cell), h(cell + 7.3)) - 0.5; float sp = step(0.55, h(cell + 3.1))*smoothstep(0.28, 0.2, length(f - o*0.4));",
      "  c = mix(c, uSpotCol, sp*uSpots*step(0.12, vL.y));",
      // the gills underneath: radial lines, darker
      "  float gill = 0.75 + 0.25*sin(atan(vL.z, vL.x)*60.0);",
      "  c *= mix(1.0, gill, step(vL.y, 0.01));",
      // glowing caps light themselves; plain ones (the wardens') take the moonlight from above
      "  float lit = clamp(vN.y*0.5 + 0.5, 0.0, 1.0);",
      "  gl_FragColor = vec4(c*mix(0.28 + 0.72*lit, 0.85 + 0.25*lit, uGlow), 1.0);",
      "}"].join("\n")
  });
  return m;
};

})();
