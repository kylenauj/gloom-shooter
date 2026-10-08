/* ------------------------------------------------------------------ *
 *  The stage: renderer, the night over Glowcap Hollow, moonlight, and
 *  a tactics camera that orbits a point on the ground.
 *
 *  Camera: Q/E turn it a quarter round (eased), WASD or a drag pans,
 *  the wheel or a pinch zooms. It follows whatever the battle wants
 *  you to look at, but never fights the player for it.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, K = GS.Kit;
const S = GS.Stage = {};

S.init = function(){
  const r = S.renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  r.setSize(window.innerWidth, window.innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("view").appendChild(r.domElement);

  const scene = S.scene = new THREE.Scene();
  S.FOG = new THREE.Color(0x0b1424);
  scene.background = S.FOG;
  scene.fog = new THREE.Fog(S.FOG, 60, 150);

  S.camera = new THREE.PerspectiveCamera(38, window.innerWidth/window.innerHeight, 0.5, 600);

  // the night: a cold blue sky light, a dark ground, and the moon
  S.hemi = new THREE.HemisphereLight(0x7f9ee8, 0x141a26, 0.7);
  scene.add(S.hemi);
  const moon = S.moon = new THREE.DirectionalLight(0xc8d8ff, 0.75);
  S.MOON_DIR = new THREE.Vector3(-0.45, 0.8, -0.35).normalize();
  moon.position.copy(S.MOON_DIR).multiplyScalar(80);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const c = moon.shadow.camera; c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 10; c.far = 200;
  moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.04;
  scene.add(moon); scene.add(moon.target);

  S.buildSky();
  S.rig = { tx:0, tz:0, yaw:0, yawTo:0, pitch:0.98, dist:34, distTo:34, gx:0, gz:0, follow:null, shake:0 };
  window.addEventListener("resize", S.resize);
  S.clock = new THREE.Clock();
  S.updaters = [];
  S.loop();
};

S.resize = function(){
  S.camera.aspect = window.innerWidth/window.innerHeight; S.camera.updateProjectionMatrix();
  S.renderer.setSize(window.innerWidth, window.innerHeight);
  K.timed.forEach(m=>{ if(m.uniforms && m.uniforms.uScale) m.uniforms.uScale.value = window.innerHeight/2; });
};

/* a dome: navy overhead, a teal glow low in the north where the caps light the mist; stars; the moon */
S.buildSky = function(){
  const g = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ uTime:{ value:0 } },
    vertexShader:"varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }",
    fragmentShader:["varying vec3 vP; uniform float uTime;",
      "void main(){ float y = vP.y;",
      "  vec3 top = vec3(0.012, 0.02, 0.055), mid = vec3(0.03, 0.07, 0.13), low = vec3(0.045, 0.085, 0.14);",
      "  vec3 c = mix(low, mid, smoothstep(-0.05, 0.25, y)); c = mix(c, top, smoothstep(0.25, 0.8, y));",
      // a faint aurora of spore-light, rippling
      "  float a = smoothstep(0.05, 0.3, y)*smoothstep(0.7, 0.3, y)*(0.5 + 0.5*sin(atan(vP.z, vP.x)*5.0 + uTime*0.05 + sin(y*14.0 + uTime*0.1)));",
      "  c += vec3(0.05, 0.16, 0.18)*a*0.35 + vec3(0.12, 0.03, 0.14)*a*a*0.25;",
      "  gl_FragColor = vec4(c, 1.0); }"].join("\n") });
  K.timed.push(m);
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -10; S.scene.add(sky); S.sky = sky;
  // stars
  const sp = [];
  for(let i=0;i<900;i++){ const u = Math.random()*2 - 1, th = Math.random()*6.283, y = 0.12 + Math.random()*0.88, r = Math.sqrt(1 - y*y);
    sp.push(Math.cos(th)*r*380, y*380, Math.sin(th)*r*380); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color:0xcfe2ff, size:1.4, sizeAttenuation:false, fog:false, transparent:true, opacity:0.8 }));
  S.scene.add(stars); S.stars = stars;
  // the moon, low in the north-west, with its halo
  const mp = S.MOON_DIR.clone().multiplyScalar(350);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color:0xe9f0ff, fog:false }));
  disc.position.copy(mp); disc.lookAt(0, 0, 0); S.scene.add(disc);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map:K.glowTex, color:0x6c8cff, transparent:true, opacity:0.5, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
  halo.position.copy(mp).multiplyScalar(0.99); halo.lookAt(0, 0, 0); S.scene.add(halo);
  S.moonDisc = disc; S.moonHalo = halo;
};

/* ---- the camera rig ---- */
S.focus = function(x, z, snap){ const R = S.rig; R.gx = x; R.gz = z; if(snap){ R.tx = x; R.tz = z; } };
S.turn = function(dir){ S.rig.yawTo += dir*Math.PI/2; };
S.zoom = function(f){ S.rig.distTo = GS.clamp(S.rig.distTo*f, S.rig.minDist || 14, S.rig.maxDist || 60); };
S.pan = function(dx, dz){
  // in screen terms: right and forward, turned by the rig's yaw
  const R = S.rig, c = Math.cos(R.yaw), s = Math.sin(R.yaw);
  R.gx += dx*c + dz*s; R.gz += -dx*s + dz*c;
  if(S.bounds){ R.gx = GS.clamp(R.gx, -S.bounds, S.bounds); R.gz = GS.clamp(R.gz, -S.bounds, S.bounds); }
};
S.shake = function(n){ S.rig.shake = Math.max(S.rig.shake, n); };
S.updateCamera = function(dt){
  const R = S.rig, k = 1 - Math.exp(-dt*7);
  R.yaw += (R.yawTo - R.yaw)*k; R.dist += (R.distTo - R.dist)*k;
  R.tx += (R.gx - R.tx)*k; R.tz += (R.gz - R.tz)*k;
  const cp = Math.cos(R.pitch), sp = Math.sin(R.pitch);
  const sx = (Math.random() - 0.5)*R.shake, sz = (Math.random() - 0.5)*R.shake; R.shake *= Math.exp(-dt*9);
  S.camera.position.set(R.tx + Math.sin(R.yaw)*cp*R.dist + sx, sp*R.dist, R.tz + Math.cos(R.yaw)*cp*R.dist + sz);
  S.camera.lookAt(R.tx + sx*0.5, 0.6, R.tz + sz*0.5);
  // keep the moon's shadow box on what the camera is looking at
  S.moon.target.position.set(R.tx, 0, R.tz);
  S.moon.position.set(R.tx, 0, R.tz).addScaledVector(S.MOON_DIR, 90);
  S.sky.position.copy(S.camera.position); S.stars.position.copy(S.camera.position);
};

S.loop = function(){
  requestAnimationFrame(S.loop);
  const dt = Math.min(0.05, S.clock.getDelta()), t = S.clock.elapsedTime;
  K.tick(t);
  S.updaters.forEach(f=> f(dt, t));
  S.updateCamera(dt);
  S.renderer.render(S.scene, S.camera);
};
S.onFrame = f=>{ S.updaters.push(f); return ()=>{ S.updaters = S.updaters.filter(g=> g !== f); }; };

/* screen position of a world point, for HUD labels */
const _v = new THREE.Vector3();
S.project = function(x, y, z){
  _v.set(x, y, z).project(S.camera);
  return { x:(_v.x*0.5 + 0.5)*window.innerWidth, y:(-_v.y*0.5 + 0.5)*window.innerHeight, behind:_v.z > 1 };
};

})();
