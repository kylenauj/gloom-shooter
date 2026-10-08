/* ------------------------------------------------------------------ *
 *  The app: boots the stage, keeps a clearing turning behind the
 *  menus, and walks the player between the Hollow and the battles.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, S = GS.Stage, C = GS.Campaign, UI = GS.UI, HUD = GS.HUD;

const app = GS.app = { camp:null, view:null, backdrop:null };

/* ---- the clearing behind the menus: a little map, the five wardens round a glow node ---- */
app.showBackdrop = function(){
  if(app.backdrop) return;
  const map = GS.Grid.generate({ seed:4242, w:16, h:16, pods:0, nodes:1 });
  const world = new GS.World(map);
  S.scene.add(world.group);
  const node = map.nodes[0] || { x:8, y:8 }, c = world.pos(node.x, node.y), models = [];
  GS.CLASS_ORDER.forEach((cls, i)=>{
    const R = GS.Models.build({ team:"squad", cls, armorTier:i % 3, type:cls });
    const a = i/5*Math.PI*2, r = 3.4;
    R.root.position.set(c.x + Math.cos(a)*r, 0, c.z + Math.sin(a)*r);
    R.root.rotation.y = Math.atan2(c.x - R.root.position.x, c.z - R.root.position.z);
    R.ring.visible = false;
    S.scene.add(R.root); models.push(R);
  });
  S.bounds = 60; S.rig.minDist = 10; S.rig.maxDist = 60;
  S.focus(c.x, c.z, true); S.rig.distTo = S.rig.dist = 22; S.rig.pitch = 0.5;
  const off = S.onFrame((dt, t)=>{
    world.update(dt, t); GS.FX.update(dt);
    S.rig.yawTo += dt*0.05;
    models.forEach((R, i)=>{ R.body.position.y = Math.sin(t*2.2 + i)*0.025; if(R.parts.cap) R.parts.cap.rotation.z = Math.sin(t*1.3 + i)*0.04; });
  });
  app.backdrop = { world, models, off };
};
app.hideBackdrop = function(){
  const B = app.backdrop; if(!B) return;
  B.off(); S.scene.remove(B.world.group); B.models.forEach(R=> S.scene.remove(R.root));
  app.backdrop = null; S.rig.pitch = 0.98;
};

/* ---- the flow ---- */
app.title = function(){ app.endBattle(); app.showBackdrop(); GS.Audio.setMode("menu"); UI.title(app); };
app.newCampaign = function(){ app.camp = C.create(); C.save(app.camp); UI.tab = "report"; UI.hollow(app, "report"); };
app.continueCampaign = function(){ app.camp = C.load(); if(!app.camp) return app.newCampaign(); UI.hollow(app, "map"); };
app.launch = function(mid, ids){
  const b = C.launch(app.camp, mid, ids);
  if(!b) return;
  app.mission = mid;
  app.startBattle(b, sum=>{
    UI.results(app, sum, ()=>{
      C.resolve(app.camp, mid, sum); C.save(app.camp);
      app.endBattle(); app.showBackdrop(); GS.Audio.setMode("menu");
      UI.hollow(app, "report");
    });
  });
};
app.skirmish = function(st){
  const rng = GS.RNG(Date.now() % 1e6);
  const classes = GS.CLASS_ORDER.slice();
  if(st.size > 5) classes.push("capguard");
  const squad = classes.slice(0, st.size).map(cls=>{
    const C0 = GS.CLASSES[cls], picks = C0.tree.slice(0, st.rank).map(p=> rng.pick(p));
    return GS.makeSquadUnit({ cls, rank:st.rank, picks, name:rng.pick(GS.NAMES.first) + " " + rng.pick(GS.NAMES.last),
      item:{ capguard:"blastcap", thornblade:"salve", longcap:"flare", sporecaster:"salve", puffbomber:"blastcap" }[cls] }, { weaponTier:st.tier, armorTier:st.tier });
  });
  const b = GS.setupBattle({ seed:rng.int(1, 1e6), type:st.type, threat:st.type === "finale" ? Math.max(6, st.threat) : st.threat, squad, where:"a nameless clearing",
    mods:{ chorus:["glowHymn", "rootHymn", "hushHymn"], lumenStart:st.tier, critVsGloom:st.tier*5 } });
  app.startBattle(b, sum=> UI.results(app, sum, ()=> app.title()));
};
app.startBattle = function(b, onEnd){
  UI.hide(); app.hideBackdrop(); app.endBattle();
  GS.Audio.setMode("battle");
  const v = app.view = new GS.BattleView(b, {
    onChange:()=> HUD.render(), onLog:(t, c)=> HUD.addLog(t, c), onBanner:HUD.banner, toast:HUD.toast,
    onEnd:sum=>{ HUD.unmount(); onEnd(sum); }
  });
  HUD.mount(v);
  window.__battle = b;    // (for poking at in the console)
};
app.endBattle = function(){ if(app.view){ app.view.dispose(); app.view = null; } HUD.unmount(); };

/* ---- keys ---- */
const held = {};
window.addEventListener("keydown", e=>{
  if(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  GS.Audio.start();
  held[e.key.toLowerCase()] = true;
  if(e.key === "m" || e.key === "M"){ GS.Audio.toggleMute(); HUD.render(); return; }
  if(e.key === "q" || e.key === "Q"){ S.turn(-1); return; }
  if(e.key === "e" || e.key === "E"){ S.turn(1); return; }
  if(app.view && HUD.key(e)){ e.preventDefault(); return; }
});
window.addEventListener("keyup", e=>{ held[e.key.toLowerCase()] = false; });
window.addEventListener("blur", ()=> Object.keys(held).forEach(k=> held[k] = false));

/* ---- boot ---- */
window.addEventListener("DOMContentLoaded", ()=>{
  S.init();
  GS.FX.init(S.scene);
  S.onFrame(dt=>{
    const k = S.rig.dist*dt*0.9;
    if(held.w || held.arrowup) S.pan(0, -k);
    if(held.s || held.arrowdown) S.pan(0, k);
    if(held.a || held.arrowleft) S.pan(-k, 0);
    if(held.d || held.arrowright) S.pan(k, 0);
  });
  const l = document.getElementById("loading"); if(l) l.remove();
  // ?skirmish jumps straight into a fight (for testing): ?skirmish=heart&threat=3
  const q = new URLSearchParams(location.search);
  if(q.has("skirmish")){
    app.skirmish({ type:q.get("skirmish") || "purge", threat:+(q.get("threat") || 2), rank:+(q.get("rank") || 1), tier:+(q.get("tier") || 0), size:+(q.get("size") || 4) });
  } else app.title();
  window.addEventListener("pointerdown", ()=> GS.Audio.start(), { once:true });
});

})();
