/* ------------------------------------------------------------------ *
 *  The ghost in the browser: plays the real page in Chromium.
 *
 *  What only the page can show:
 *   - the picture agrees with the rules (HP, positions, deaths, who's
 *     visible, the Lumen and Tide on the HUD)
 *   - playback never hangs, and the console stays clean
 *   - real clicks and keys do what they say
 *   - the HUD and menus fit: nothing overlapping, off-screen or clipped,
 *     at desktop, laptop and phone sizes
 *  Screenshots of every screen go to audit/shots/.
 * ------------------------------------------------------------------ */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");

function loadPlaywright(){
  try{ return require("playwright"); }catch(e){}
  try{ const g = require("child_process").execSync("npm root -g", { stdio:["ignore", "pipe", "ignore"] }).toString().trim(); return require(path.join(g, "playwright")); }catch(e){}
  return null;
}
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml" };
function serve(root){
  return new Promise(res=>{
    const s = http.createServer((q, r)=>{
      const p = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
      if(!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; }
      r.writeHead(200, { "content-type":MIME[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(r);
    });
    s.listen(0, "127.0.0.1", ()=> res(s));
  });
}

const VIEWPORTS = [
  { name:"desktop", width:1400, height:860 },
  { name:"laptop", width:1024, height:680 },
  { name:"phone-landscape", width:844, height:390, mobile:true },
  { name:"phone-portrait", width:390, height:844, mobile:true }
];

/* ---- checks that run inside the page ---- */
function layoutAudit(where){
  const sel = [".h-mission", ".h-meters", ".h-sys", ".h-squad", ".h-target", ".h-log", ".h-unit", ".h-abil", ".h-end", ".hollow-top", ".mdetail", "svg.forest", ".title-wrap", ".menu"];
  const W = innerWidth, H = innerHeight, out = [], boxes = [];
  const vis = el=>{ const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 2 && r.height > 2 && el.offsetParent !== null || (s.position === "fixed" && r.width > 2); };
  sel.forEach(s=> document.querySelectorAll(s).forEach(el=>{ if(vis(el)) boxes.push({ s, r:el.getBoundingClientRect() }); }));
  boxes.forEach(b=>{ const r = b.r;
    if(r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2) out.push(["minor", "layout", "Off-screen at " + where + ": " + b.s, Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "×" + Math.round(r.height) + " in " + W + "×" + H]); });
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++){
    const a = boxes[i].r, b = boxes[j].r;
    if(boxes[i].s === boxes[j].s) continue;
    if(a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom) continue;     // one inside the other (by design)
    if(b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom) continue;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if(w > 4 && h > 4 && w*h > 0.04*Math.min(a.width*a.height, b.width*b.height)) out.push(["minor", "layout", "Overlap at " + where + ": " + boxes[i].s + " and " + boxes[j].s, Math.round(w) + "×" + Math.round(h) + "px in " + W + "×" + H]);
  }
  // content spilling out of its panel (the panel fits, but what's in it doesn't)
  document.querySelectorAll("#hud .plate, .screens .plate").forEach(pl=>{
    if(!vis(pl)) return;
    const P = pl.getBoundingClientRect();
    for(const el of pl.querySelectorAll("*")){
      if(!vis(el) || getComputedStyle(el).position === "absolute") continue;
      const r = el.getBoundingClientRect();
      if(r.right > P.right + 3 || r.left < P.left - 3){ out.push(["minor", "layout", "Content spills out of a panel at " + where, (pl.id || pl.className.split(" ")[0]) + ": " + (el.id || el.tagName.toLowerCase()) + " " + Math.round(Math.max(r.right - P.right, P.left - r.left)) + "px over"]); break; }
    }
  });
  document.querySelectorAll(".item span, .ab, .sq-card b, .h-mission b, .tg-head b, .trooper b, .card h4, .hollow-top span").forEach(el=>{
    if(!vis(el)) return;
    if(el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible") out.push(["minor", "layout", "Text clipped at " + where, (el.textContent || "").trim().slice(0, 40)]);
  });
  return out;
}
function syncAudit(){
  const v = GS.app.view; if(!v) return [];
  const b = v.b, out = [], bad = (sev, t, d)=> out.push([sev, "sync", t, d]);
  b.units.forEach(u=>{
    const a = v.actors[u.id], n = u.cls || u.type;
    if(!a){ if(!u.dead) bad("major", "A unit has no model on screen", n); return; }
    if(u.dead){ if(!a.dead) bad("major", "A dead unit is still drawn", n); return; }
    if(a.hp !== u.hp) bad("major", "The HP shown doesn't match the rules", n + ": shows " + a.hp + ", is " + u.hp);
    if(a.x !== u.x || a.y !== u.y) bad("major", "A unit is drawn on the wrong tile", n + ": drawn " + a.x + "," + a.y + ", is " + u.x + "," + u.y);
    if(!!a.downed !== !!u.downed) bad("major", "Downed state shown wrong", n);
    if(u.team === "gloom" && a.visible !== b.visible(u)) bad("major", "Enemy visibility on screen doesn't match the fog", n);
    const p = v.world.pos(u.x, u.y), r = a.R.root.position;
    if(Math.hypot(p.x - r.x, p.z - r.z) > 0.05) bad("major", "A model is out of place in 3D", n);
  });
  if(v.disp.lumen !== b.lumen) bad("major", "Lumen on the HUD doesn't match", v.disp.lumen + " vs " + b.lumen);
  if(v.disp.tide !== b.tide) bad("major", "The Tide on the HUD doesn't match", v.disp.tide + " vs " + b.tide);
  if(v.disp.round !== b.round) bad("minor", "The round on the HUD doesn't match", v.disp.round + " vs " + b.round);
  if(v.disp.concealed !== b.concealed) bad("major", "Concealment on the HUD doesn't match", "");
  if(b.over || document.getElementById("hud").hidden) return out;
  const cards = document.querySelectorAll("#hSquad .sq-card").length, sq = b.units.filter(u=> u.team === "squad").length;
  if(cards !== sq) bad("minor", "Squad list shows the wrong number of wardens", cards + " vs " + sq);
  const u = v.selUnit();
  if(u && b.team === "squad" && !b.over){
    const want = b.actionsFor(u).length, got = document.querySelectorAll("#hAbil .ab").length;
    if(want !== got) bad("minor", "Ability bar doesn't match the warden's abilities", got + " shown, " + want + " exist");
    const en = b.actionsFor(u).filter(a=> a.enabled).length, shown = document.querySelectorAll("#hAbil .ab:not(.off):not(.passive)").length;
    if(en !== shown) bad("minor", "Ability buttons lit that can't be used (or the reverse)", shown + " lit, " + en + " usable");
  }
  return out;
}

exports.run = async function(audit, o){
  const pw = loadPlaywright();
  if(!pw){ audit.find("info", "browser", "Playwright not found: the browser pass was skipped", "npm i -D playwright, or install it globally", null); return { ok:false, notes:["Playwright not installed"] }; }
  fs.mkdirSync(o.out, { recursive:true });
  const server = await serve(o.root), base = "http://127.0.0.1:" + server.address().port + "/index.html";
  const browser = await pw.chromium.launch({ args:["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const notes = [], shots = [];
  const take = (arr, where)=> arr.forEach(f=> audit.find(f[0], f[1], f[2], f[3], { mode:"browser", where }));
  const newPage = async vp=>{
    const ctx = await browser.newContext({ viewport:{ width:vp.width, height:vp.height }, isMobile:!!vp.mobile, hasTouch:!!vp.mobile });
    const page = await ctx.newPage();
    page.on("console", m=>{ if(m.type() === "error") audit.find("major", "console", "Console error: " + m.text().slice(0, 140), "", { mode:"browser", viewport:vp.name }); });
    page.on("pageerror", e=> audit.find("critical", "crash", "Page error: " + e.message.slice(0, 140), (e.stack || "").split("\n").slice(0, 3).join(" | "), { mode:"browser", viewport:vp.name }));
    return page;
  };
  const shot = async (page, name)=>{ const f = name + ".png"; await page.screenshot({ path:path.join(o.out, f) }); shots.push(f); };
  const idle = async (page, ms)=>{
    try{
      await page.waitForFunction(()=>{ const v = GS.app.view; return !v || (!v.playing && !v.queue.length); }, null, { timeout:ms || 120000 });
      // and let the HUD (drawn on the next frame) and the camera catch up
      await page.evaluate(()=> new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r))));
      return true;
    }
    catch(e){
      const last = await page.evaluate(()=> window.__ghostLast || "?").catch(()=> "?");
      audit.find("critical", "softlock", "Playback hung: the view never went idle", "last event played: " + last, { mode:"browser" });
      return false;
    }
  };
  const inject = async page=>{ for(const f of ["tools/ghost/policy.js", "tools/ghost/audit.js"]) await page.addScriptTag({ path:path.join(o.root, f) }); };

  try{
    /* 1. the title, at every size */
    for(const vp of (o.quick ? [VIEWPORTS[0], VIEWPORTS[3]] : VIEWPORTS)){
      const page = await newPage(vp);
      const t = Date.now();
      await page.goto(base, { waitUntil:"load" });
      await page.waitForSelector(".title-wrap", { timeout:30000 });
      notes.push("Title ready in " + (Date.now() - t) + " ms at " + vp.name + ".");
      await page.waitForTimeout(800);
      take(await page.evaluate(layoutAudit, "title/" + vp.name), "title");
      await shot(page, "title-" + vp.name);
      await page.context().close();
    }

    /* 2. a battle, played through the real view */
    {
      const vp = VIEWPORTS[0], page = await newPage(vp);
      await page.goto(base + "?skirmish=purge&threat=3&rank=1", { waitUntil:"load" });
      await page.waitForFunction(()=> window.GS && GS.app && GS.app.view, null, { timeout:30000 });
      await inject(page);
      await page.evaluate(()=>{
        const v = GS.app.view; v.speed = 8;
        window.__ghostAudit = new GS.Ghost.Audit();
        window.__ghostWatch = new GS.Ghost.Watch(window.__ghostAudit, v.b, { mode:"browser-battle" });
        const h = v.handle.bind(v); v.handle = e=>{ window.__ghostLast = e.type; return h(e); };
      });
      await idle(page);
      await shot(page, "battle-start");
      take(await page.evaluate(layoutAudit, "battle/desktop"), "battle");

      // real input: a click on a blue tile moves the selected warden
      const mv = await page.evaluate(()=>{
        const v = GS.app.view, b = v.b, u = v.selUnit(); if(!u) return null;
        const R = b.reach(u, u.mob);
        for(let i=0;i<R.cost.length;i++){ if(R.cost[i] === Infinity || R.cost[i] < 1) continue; const x = i % b.map.w, y = (i - x)/b.map.w; if(b.unitAt(x, y)) continue;
          const p = v.world.pos(x, y), s = GS.Stage.project(p.x, p.y, p.z);
          if(s.x > 260 && s.x < innerWidth - 300 && s.y > 120 && s.y < innerHeight - 230) return { x, y, sx:s.x, sy:s.y, id:u.id }; }
        return null; });
      if(mv){
        await page.mouse.move(mv.sx, mv.sy); await page.waitForTimeout(250); await page.mouse.click(mv.sx, mv.sy);
        await page.waitForTimeout(300); await idle(page);
        const at = await page.evaluate(id=>{ const u = GS.app.view.b.unit(id); return [u.x, u.y]; }, mv.id);
        if(at[0] !== mv.x || at[1] !== mv.y) audit.find("major", "input", "Clicking a blue tile didn't move the warden there", "wanted " + mv.x + "," + mv.y + ", got " + at, { mode:"browser" });
        else notes.push("A real mouse click moved a warden to the tile under the cursor.");
      } else notes.push("No clear tile on screen to test a real click on.");
      // keys: Tab changes warden, 1 enters a mode, Esc leaves it
      const sel0 = await page.evaluate(()=> GS.app.view.sel);
      await page.keyboard.press("Tab"); await page.waitForTimeout(150);
      const sel1 = await page.evaluate(()=> GS.app.view.sel);
      if(sel0 === sel1) audit.find("minor", "input", "Tab didn't switch to another warden", "", { mode:"browser" });
      const modeTest = await page.evaluate(()=>{ const v = GS.app.view, u = v.selUnit(); if(!u) return "skip"; const a = v.b.actionsFor(u).filter(x=> !x.passive);
        const i = a.findIndex(x=> x.enabled && x.def.target !== "self" && x.def.target !== "adjacent"); return i < 0 ? "skip" : String(i + 1); });
      if(modeTest !== "skip"){
        await page.keyboard.press(modeTest); await page.waitForTimeout(150);
        const m1 = await page.evaluate(()=> !!GS.app.view.mode);
        await page.keyboard.press("Escape"); await page.waitForTimeout(150);
        const m2 = await page.evaluate(()=> !!GS.app.view.mode);
        if(!m1) audit.find("minor", "input", "A number key didn't pick its ability", "key " + modeTest, { mode:"browser" });
        if(m2) audit.find("minor", "input", "Esc didn't cancel targeting", "", { mode:"browser" });
      }

      // now let the ghost play it out, checking the screen against the rules after every turn
      let turns = 0, hovered = false;
      for(; turns<(o.quick ? 5 : 14); turns++){
        const st = await page.evaluate(()=>{ const v = GS.app.view; return v ? (v.b.over || "go") : "gone"; });
        if(st !== "go") break;
        const ids = await page.evaluate(()=> GS.app.view.b.squad().filter(u=> GS.app.view.b.able(u)).map(u=> u.id));
        for(const id of ids){
          await page.evaluate(id=>{ const v = GS.app.view, b = v.b, u = b.unit(id); if(!u || !b.able(u) || b.over) return;
            v.select(u, true); GS.Ghost.smartChorus(b); GS.Ghost.smartUnit(b, u, "smart"); v.pump(); }, id);
          if(!await idle(page)) break;
          take(await page.evaluate(syncAudit), "battle");
          if(!hovered){
            // hover a target: the hit chance must show
            const ok = await page.evaluate(()=>{ const v = GS.app.view, b = v.b, u = b.squad().find(x=> b.able(x) && x.ap > 0 && b.targetsFor(x, "fire").length);
              if(!u) return false; v.select(u, true); const t = b.targetsFor(u, "fire")[0], p = v.actors[t.id].R.root.position; GS.Stage.focus(p.x, p.z); return true; });
            if(ok) await page.waitForTimeout(1800);      // let the camera settle before reading where the target is on screen
            const tg = !ok ? null : await page.evaluate(()=>{ const v = GS.app.view, b = v.b, u = v.selUnit(), t = u && b.targetsFor(u, "fire")[0]; if(!t) return null;
              const a = v.actors[t.id], p = a.R.root.position, s = GS.Stage.project(p.x, p.y + a.R.head*0.5, p.z); return { x:s.x, y:s.y }; });
            if(tg){
              hovered = true;
              await page.mouse.move(tg.x, tg.y); await page.waitForTimeout(400);
              const shown = await page.evaluate(()=>{ const el = document.getElementById("hTarget"); return el && el.style.display !== "none" && /%/.test(el.textContent); });
              if(!shown) audit.find("minor", "input", "Hovering an enemy didn't show the hit chance", "", { mode:"browser" });
              else { notes.push("Hovering an enemy shows the to-hit breakdown."); await shot(page, "battle-aim"); }
              await page.mouse.move(5, 5);
            }
          }
        }
        if(await page.evaluate(()=> !!GS.app.view && !GS.app.view.b.over)){
          await page.evaluate(()=> GS.app.view.endTurn());
          if(!await idle(page)) break;
          take(await page.evaluate(syncAudit), "battle");
        }
        if(turns === 1) await shot(page, "battle-mid");
      }
      const fps = await page.evaluate(()=> new Promise(r=>{ let n = 0; const t = performance.now(); const f = ()=>{ n++; if(performance.now() - t < 2000) requestAnimationFrame(f); else r(n/2); }; f(); }));
      notes.push("Played " + turns + " rounds in the real view. " + Math.round(fps) + " fps (software rendering in CI; a real GPU will be far faster).");
      const pageFindings = await page.evaluate(()=> [...window.__ghostAudit.findings.values()]);
      pageFindings.forEach(f=> audit.find(f.severity, f.category, f.title, (f.examples[0] && f.examples[0].detail || "") + (f.count > 1 ? " (×" + f.count + " in the page)" : ""), { mode:"browser-battle" }));
      await shot(page, "battle-end");
      await page.context().close();
    }

    /* 3. the HUD at small sizes */
    for(const vp of VIEWPORTS.slice(1)){
      const page = await newPage(vp);
      await page.goto(base + "?skirmish=heart&threat=2&rank=1", { waitUntil:"load" });
      await page.waitForFunction(()=> window.GS && GS.app && GS.app.view, null, { timeout:30000 });
      await page.evaluate(()=>{ GS.app.view.speed = 8; });
      await idle(page);
      take(await page.evaluate(layoutAudit, "battle/" + vp.name), "battle");
      await shot(page, "battle-" + vp.name);
      await page.context().close();
    }

    /* 4. the campaign screens, end to end */
    {
      const vp = VIEWPORTS[0], page = await newPage(vp);
      await page.goto(base, { waitUntil:"load" });
      await page.waitForSelector(".title-wrap");
      await page.evaluate(()=>{ try{ localStorage.clear(); }catch(e){} });
      await page.reload({ waitUntil:"load" }); await page.waitForSelector(".title-wrap");
      await page.click("text=New Campaign"); await page.waitForTimeout(500);
      for(const [tab, name] of [["map", "The Forest"], ["squad", "Barracks"], ["research", "Mycology Lab"], ["workshop", "Workshop"], ["recruit", "Recruit"], ["report", "Report"]]){
        await page.click("[data-tab=" + tab + "]"); await page.waitForTimeout(400);
        take(await page.evaluate(layoutAudit, "hollow/" + tab), "hollow");
        await shot(page, "hollow-" + tab);
      }
      await page.click("[data-tab=map]"); await page.waitForTimeout(300);
      await page.click("svg .reg.has >> nth=0"); await page.waitForTimeout(300);
      await page.click("[data-go=deploy]"); await page.waitForTimeout(500);
      take(await page.evaluate(layoutAudit, "deploy"), "deploy");
      await shot(page, "deploy");
      await page.click("[data-go=launch]");
      await page.waitForFunction(()=> GS.app.view, null, { timeout:30000 });
      await page.evaluate(()=>{ const v = GS.app.view; v.speed = 10; v.b.gloom().forEach(g=> v.b.damage(g, 99, { src:v.b.squad()[0] })); v.pump(); });
      await page.waitForSelector("[data-go=on]", { timeout:120000 });
      await shot(page, "results");
      await page.click("[data-go=on]"); await page.waitForTimeout(800);
      const wk = await page.evaluate(()=> GS.app.camp && GS.app.camp.week);
      if(wk !== 2) audit.find("major", "campaign", "Finishing a mission in the browser didn't advance the week", "week " + wk, { mode:"browser" });
      const saved = await page.evaluate(()=>{ try{ return !!localStorage.getItem("gloomshooter.save.v1"); }catch(e){ return false; } });
      if(!saved) audit.find("major", "campaign", "The campaign wasn't saved after a mission", "", { mode:"browser" });
      await page.click("text=Save & Quit"); await page.waitForTimeout(400);
      const cont = await page.$("text=Continue");
      if(!cont) audit.find("major", "campaign", "No Continue on the title after Save & Quit", "", { mode:"browser" });
      else { await cont.click(); await page.waitForTimeout(500); const wk2 = await page.evaluate(()=> GS.app.camp && GS.app.camp.week); if(wk2 !== 2) audit.find("major", "campaign", "Continue loaded the wrong week", String(wk2), { mode:"browser" }); else notes.push("A campaign mission, save, quit and continue all worked in the page."); }
      await page.context().close();
    }
    return { ok:true, notes, shots };
  } finally {
    await browser.close(); server.close();
  }
};
