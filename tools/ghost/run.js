#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 *  The ghost playtester.
 *
 *    node tools/ghost/run.js             full headless audit (~1 min)
 *    node tools/ghost/run.js --quick     a fast pass (~10 s)
 *    node tools/ghost/run.js --browser   also play the real page in Chromium
 *    options: --battles N --campaigns N --fuzz N --seed S --out DIR
 *
 *  It plays hundreds of battles and whole campaigns, checks the rules
 *  after every action, then writes:
 *    audit/REPORT.md       what's wrong, worst first, with seeds to reproduce
 *    audit/report.json     the same, plus every metric
 *    audit/history.jsonl   one line per run, so runs can be compared
 *  Exit code 1 if anything critical turned up.
 * ------------------------------------------------------------------ */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const GS = require(path.join(ROOT, "tests", "load.js"));
require("./policy.js"); require("./audit.js");
const Ghost = GS.Ghost, C = GS.Campaign;

const argv = process.argv.slice(2), flag = k=> argv.includes("--" + k), opt = (k, d)=>{ const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const QUICK = flag("quick");
const CFG = {
  battles:+opt("battles", QUICK ? 60 : 320), campaigns:+opt("campaigns", QUICK ? 3 : 12), fuzz:+opt("fuzz", QUICK ? 30 : 160),
  seed:+opt("seed", 1), out:path.resolve(ROOT, opt("out", "audit")), browser:flag("browser"), maxRounds:40, maxWeeks:40
};

const audit = new Ghost.Audit();
const t0 = Date.now();

/* the kit a squad of a given experience would have */
const KIT = th=> th <= 2 ? { rank:0, tier:0 } : th === 3 ? { rank:1, tier:0 } : th === 4 ? { rank:1, tier:1 } : th === 5 ? { rank:2, tier:1 } : { rank:3, tier:2 };
function squadFor(seed, rank, tier, size){
  const rng = GS.RNG(seed*17 + 3), classes = rng.shuffle(GS.CLASS_ORDER.slice()).slice(0, size || 4);
  const items = Object.keys(GS.ITEMS);
  return classes.map(cls=> GS.makeSquadUnit({ cls, rank, name:cls, picks:GS.CLASSES[cls].tree.slice(0, rank).map(p=> rng.pick(p)), item:rng.pick(items),
    mods:tier ? [rng.pick(Object.keys(GS.MODS))] : [] }, { weaponTier:tier, armorTier:tier }));
}

/* ---- one battle, start to finish ---- */
function playBattle(b, persona, repro, seed){
  const W = new Ghost.Watch(audit, b, repro), rng = GS.RNG(seed*31 + 7);
  const rec = (u, id, t, ok, problem)=>{
    audit.ability(id, ok);
    if(problem) audit.find("major", "contract", "Action refused that the HUD offers: " + id + " — " + problem, (u && (u.cls || u.type)) + " -> " + (t && (t.type || t.cls || (t.x + "," + t.y))), W.rp());
    W.check(id);
    b.drain();
  };
  const contract = Ghost.contract(audit, W);
  try{
    W.check("start");
    while(!b.over && b.round <= CFG.maxRounds){
      if(persona !== "fuzz") Ghost.smartChorus(b, rec);
      for(const u of b.squad()){
        if(b.over) break;
        if(!b.able(u)) continue;
        if(persona === "fuzz") Ghost.fuzzUnit(b, u, rng, rec, contract);
        else Ghost.smartUnit(b, u, persona, rec);
      }
      if(b.over) break;
      // the other side's turn is out of bounds for the squad: try acting during it
      const s = Date.now(); b.endTurn(); const ms = Date.now() - s;
      audit.m.gloomTurnMs.push(ms);
      if(ms > 800) audit.find("minor", "perf", "A Gloom turn took over 0.8 s to think", ms + " ms", W.rp());
      W.check("after the Gloom's turn");
      b.drain();
    }
    if(!b.over) audit.find("major", "softlock", "A battle didn't end within " + CFG.maxRounds + " rounds", "gloom left: " + b.gloom().map(g=> g.type + (g.active ? "" : "(dormant)")).join(","), W.rp());
  }catch(err){ W.crash("battle (" + persona + ")", err); }
  b.drain();
  const key = persona + "|t" + repro.threat;
  const S = audit.m.battles[key] = audit.m.battles[key] || { n:0, wins:0, rounds:0, deaths:0, downs:0 };
  const sum = b.summary();
  S.n++; if(b.over === "victory") S.wins++; S.rounds += b.round;
  S.deaths += sum.troops.filter(t=> t.fate === "dead" || t.fate === "lost").length;
  if(persona === "smart"){ audit.m.rounds.push(b.round); audit.m.tideMax.push(b.tide); }
  return sum;
}

/* ---- the battle suite ---- */
function battleSuite(){
  const types = ["purge", "purge", "heart", "purge", "heart"];
  for(let i=0;i<CFG.battles + CFG.fuzz;i++){
    const seed = CFG.seed*1000 + i, threat = 1 + i % 8, K = KIT(threat);
    const persona = i >= CFG.battles ? "fuzz" : (i % 5 === 4 ? "aggressive" : "smart");
    const type = threat >= 7 && i % 4 === 0 ? "finale" : types[i % types.length];
    const repro = { mode:"battle", seed, threat, type, persona, rank:K.rank, tier:K.tier };
    let b;
    try{ b = GS.setupBattle({ seed, type, threat, squad:squadFor(seed, K.rank, K.tier, 4 + (i % 7 === 6 ? 1 : 0)),
      mods:{ chorus:["glowHymn", "rootHymn", "hushHymn"], lumenStart:K.tier } }); }
    catch(err){ audit.find("critical", "crash", "setupBattle threw: " + err.message, err.stack.split("\n")[1], repro); continue; }
    playBattle(b, persona, repro, seed);
  }
}

/* ---- the campaign suite: whole campaigns, decisions and all ---- */
const RESEARCH_ORDER = ["amber", "chitin", "rootHymn", "wells", "fifthCap", "anatomy", "starlight", "moonshell", "hushHymn", "trail"];
function campaignChecks(camp, repro){
  const bad = (sev, title, d)=> audit.find(sev, "campaign", title, d, Object.assign({}, repro, { week:camp.week }));
  if(!Number.isFinite(camp.caps)) bad("critical", "Caps became NaN", "");
  if(!Number.isFinite(camp.samples) || camp.samples < 0) bad("major", "Samples negative or NaN", String(camp.samples));
  Object.keys(camp.regions).forEach(r=>{ const g = camp.regions[r].gloom; if(!(Number.isInteger(g) && g >= 0 && g <= 5)) bad("major", "Region gloom out of 0-5", r + "=" + g); });
  const ids = camp.roster.map(t=> t.id); if(new Set(ids).size !== ids.length) bad("critical", "Duplicate trooper ids in the roster", "");
  camp.roster.forEach(t=>{
    if(t.wound < 0) bad("minor", "Negative wound weeks", t.name);
    if(t.picks.length !== t.rank) bad("major", "A trooper's skill picks don't match their rank", t.name + " rank " + t.rank + " picks " + t.picks.length);
    if(t.mods.length > 2) bad("major", "More than two weapon mods fitted", t.name);
  });
  Object.entries(camp.stock.mods).concat(Object.entries(camp.stock.items)).forEach(([k, v])=>{ if(v < 0) bad("major", "Negative stock in the stores", k); });
  if(camp.research.current && !GS.RESEARCH[camp.research.current]) bad("major", "Unknown research in progress", camp.research.current);
  // the save must survive a round trip through JSON untouched
  const j = JSON.stringify(camp);
  if(j.includes("null") && /"(caps|samples|week)":null/.test(j)) bad("critical", "A core number saved as null (NaN or Infinity)", "");
  if(JSON.stringify(JSON.parse(j)) !== j) bad("major", "The save doesn't survive a JSON round trip", "");
  if(!camp.over && camp.missions.length === 0) bad("critical", "No missions offered this week", "");
}
function campaignSuite(){
  for(let k=0;k<CFG.campaigns;k++){
    const seed = CFG.seed*7919 + k, repro = { mode:"campaign", seed }, rng = GS.RNG(seed);
    const camp = C.create(seed), log = { seed, weeks:0, outcome:null, deaths:0, hearts:0, finaleSeen:false, caps:[], gloom:[], research:[], fights:{ won:0, lost:0 } };
    try{
      while(!camp.over && camp.week <= CFG.maxWeeks){
        campaignChecks(camp, repro);
        // the lab
        if(!camp.research.current) for(const id of RESEARCH_ORDER) if(!C.researchBlock(camp, id)){ C.startResearch(camp, id); log.research.push(id); break; }
        // promotions
        camp.roster.forEach(t=>{ while(C.canPromote(t)) C.promote(camp, t.id, rng.pick(GS.CLASSES[t.cls].tree[t.rank])); });
        // hiring: keep a bench
        if(C.ready(camp).length < camp.squadSize + 1){ const i = camp.recruits.findIndex(t=> C.hireFee(t) + 25 <= camp.caps); if(i >= 0) C.hire(camp, i); }
        // the workshop: an item for everyone, then mods
        camp.roster.forEach(t=>{ if(!t.item){ const it = ["blastcap", "salve", "flare"][rng.int(0, 2)]; if(!(camp.stock.items[it] > 0) && camp.caps >= GS.ITEMS[it].cost + 30) C.buy(camp, "item", it); if(camp.stock.items[it] > 0) C.equipItem(camp, t.id, it); } });
        if(camp.caps > 110){ const m = rng.pick(Object.keys(GS.MODS)); if(C.buy(camp, "mod", m)){ const t = camp.roster.find(x=> x.mods.length < 2); if(t) C.equipMod(camp, t.id, t.mods.length, m); } }
        // the mission: the finale when it's there, else the rotting region we can handle
        const avgRank = camp.roster.reduce((s, t)=> s + t.rank, 0)/Math.max(1, camp.roster.length);
        const fin = camp.missions.find(m=> m.type === "finale");
        if(fin) log.finaleSeen = true;
        const pool = camp.missions.filter(m=> m.type !== "finale").sort((a, b)=> camp.regions[b.region].gloom - camp.regions[a.region].gloom);
        // a sensible player defends home first, then fights the worst rot it can handle
        const home = pool.find(x=> x.region === "hollow" && camp.regions.hollow.gloom >= 3);
        const m = fin && avgRank >= 2 ? fin : (home || pool.find(x=> x.threat <= 3 + avgRank*1.6) || pool.slice().sort((a, b)=> a.threat - b.threat)[0] || fin);
        const squad = C.ready(camp).sort((a, b)=> b.rank - a.rank).slice(0, camp.squadSize).map(t=> t.id);
        if(!squad.length){ audit.find("info", "campaign", "The ghost ran out of fit wardens", "", Object.assign({ week:camp.week }, repro)); C.advanceWeek(camp); continue; }
        const b = C.launch(camp, m.id, squad);
        if(!b){ audit.find("critical", "campaign", "A mission failed to launch", m.id, repro); break; }
        const sum = playBattle(b, "smart", Object.assign({ mode:"campaign-battle", week:camp.week, threat:m.threat, type:m.type }, repro), seed + camp.week);
        if(sum.result === "victory") log.fights.won++; else log.fights.lost++;
        log.deaths += sum.troops.filter(t=> t.fate === "dead" || t.fate === "lost").length;
        C.resolve(camp, m.id, sum);
        log.caps.push(camp.caps); log.gloom.push(C.forestGloom(camp));
      }
      campaignChecks(camp, repro);
    }catch(err){ audit.find("critical", "crash", "Campaign threw: " + err.message, err.stack.split("\n").slice(0, 3).join(" | "), Object.assign({ week:camp.week }, repro)); }
    log.weeks = camp.week; log.outcome = camp.over || "unfinished"; log.hearts = camp.hearts;
    if(!camp.over) audit.find("minor", "campaign", "A campaign was still going after " + CFG.maxWeeks + " weeks", "", repro);
    audit.m.campaigns.push(log);
  }
}

/* ---- turning numbers into findings ---- */
function analyse(){
  const M = audit.m, F = (s, c, t, d)=> audit.find(s, c, t, d, null);
  // win rates against the kit a squad would have by then
  for(let th=1; th<=8; th++){
    // (the smart ghost plays better than most people, so its bands sit high; small samples are noise)
    const S = M.battles["smart|t" + th]; if(!S || S.n < 15) continue;
    const wr = S.wins/S.n, band = th <= 2 ? [0.75, 1.01] : [0.55, 0.96];
    if(wr < band[0]) F(wr < band[0] - 0.2 ? "major" : "minor", "balance", "Threat " + th + " is too hard for a squad of its tier", Math.round(wr*100) + "% wins (" + S.n + " battles), want " + band.map(x=> Math.round(x*100)).join("–") + "%");
    if(wr > band[1]) F("minor", "balance", "Threat " + th + " is too easy", Math.round(wr*100) + "% wins (" + S.n + " battles)");
    if(S.deaths/S.n > 1.5) F("minor", "balance", "Threat " + th + " kills too many wardens", (S.deaths/S.n).toFixed(2) + " dead per battle");
  }
  // shown hit chances against what happened
  Object.entries(M.calib).forEach(([k, c])=>{
    if(c.n < 150) return;
    const want = c.pred/c.n, got = c.hits/c.n;
    if(Math.abs(want - got) > 0.06) F("major", "rules", "Hit chances in the " + k*10 + "s don't match outcomes", "shown " + Math.round(want*100) + "%, hit " + Math.round(got*100) + "% over " + c.n + " shots");
  });
  // classes: who carries, who dies
  const cl = Object.entries(M.classes).filter(([, c])=> c.deployed >= 20);
  if(cl.length){
    const dpd = cl.map(([k, c])=> [k, c.dmg/c.deployed]), mean = dpd.reduce((s, x)=> s + x[1], 0)/dpd.length;
    dpd.forEach(([k, v])=>{ if(v < mean*0.45) F("minor", "balance", GS.CLASSES[k].name + " deals far less damage than the others", v.toFixed(1) + " a battle vs " + mean.toFixed(1) + " average"); if(v > mean*1.9) F("minor", "balance", GS.CLASSES[k].name + " deals far more damage than the others", v.toFixed(1) + " vs " + mean.toFixed(1)); });
    const drate = cl.map(([k, c])=> [k, c.deaths/c.deployed]), dm = drate.reduce((s, x)=> s + x[1], 0)/drate.length;
    drate.forEach(([k, v])=>{ if(dm > 0.02 && v > dm*2) F("minor", "balance", GS.CLASSES[k].name + " dies much more often than the others", Math.round(v*100) + "% of deployments vs " + Math.round(dm*100) + "%"); });
  }
  // abilities nobody could use, or that never worked
  const offered = new Set(Object.keys(GS.ABILITIES).filter(id=> !GS.ABILITIES[id].passive && GS.ABILITIES[id].cls || GS.ABILITIES[id].generic).concat(Object.keys(GS.ITEMS).map(i=> "item:" + i)));
  offered.forEach(id=>{
    const a = M.abilities[id];
    if(!a) F("info", "coverage", "Never used in any run: " + id, "the ghost never found a reason (or a chance) to use it");
    else if(a.ok === 0 && a.tries >= 5) F("major", "coverage", "Tried " + a.tries + " times and never worked: " + id, "");
  });
  // pacing
  if(M.rounds.length){
    const avg = M.rounds.reduce((s, x)=> s + x, 0)/M.rounds.length;
    if(avg > 14) F("minor", "pacing", "Battles run long", avg.toFixed(1) + " rounds on average");
    const bloom = M.tideMax.filter(t=> t >= 12).length/M.tideMax.length;
    if(bloom > 0.25) F("minor", "pacing", "Too many battles reach Gloom Bloom", Math.round(bloom*100) + "% of battles");
  }
  // the Gloom: which creature does far more than its share
  const en = Object.entries(M.enemies).filter(([k, e])=> e.spawned >= 30 && !GS.ENEMIES[k].structure);
  if(en.length >= 3){
    const per = en.map(([k, e])=> [k, e.dmg/e.spawned]).sort((a, b)=> a[1] - b[1]), med = per[Math.floor(per.length/2)][1];
    per.forEach(([k, v])=>{ if(v > med*2.6 && GS.ENEMIES[k].cost < 4) F("minor", "balance", GS.ENEMIES[k].name + " hits far above its cost", v.toFixed(1) + " damage per spawn vs " + med.toFixed(1) + " median"); });
  }
  // campaigns
  const cs = M.campaigns;
  if(cs.length){
    const won = cs.filter(c=> c.outcome === "victory").length, lost = cs.filter(c=> c.outcome === "defeat").length;
    if(!cs.some(c=> c.finaleSeen)) F("major", "campaign", "No campaign ever unlocked the finale", cs.length + " campaigns, " + lost + " lost");
    if(lost/cs.length > 0.7) F("major", "balance", "Most campaigns are lost", lost + " of " + cs.length);
    if(cs.length >= 6 && won/cs.length > 0.9) F("minor", "balance", "Campaigns are too easy", won + " of " + cs.length + " won");
    const early = cs.filter(c=> c.outcome === "defeat" && c.weeks <= 5).length;
    if(early) F("major", "balance", "Campaigns lost within five weeks", early + " of " + cs.length);
  }
  // performance
  if(M.gloomTurnMs.length){ const avg = M.gloomTurnMs.reduce((s, x)=> s + x, 0)/M.gloomTurnMs.length; if(avg > 60) F("minor", "perf", "The Gloom's turn is slow to think", avg.toFixed(0) + " ms on average"); }
}

/* ---- the report ---- */
const SEV = { critical:0, major:1, minor:2, info:3 }, COST = { critical:25, major:8, minor:2, info:0 };
function report(browser){
  const findings = [...audit.findings.values()].sort((a, b)=> SEV[a.severity] - SEV[b.severity] || b.count - a.count);
  const score = Math.max(0, 100 - findings.reduce((s, f)=> s + COST[f.severity], 0));
  const M = audit.m, cnt = s=> findings.filter(f=> f.severity === s).length;
  const smartAll = Object.entries(M.battles).filter(([k])=> k.startsWith("smart")).reduce((a, [, s])=> ({ n:a.n + s.n, w:a.w + s.wins }), { n:0, w:0 });
  const summary = {
    when:new Date().toISOString(), commit:gitHead(), score, critical:cnt("critical"), major:cnt("major"), minor:cnt("minor"), info:cnt("info"),
    battles:Object.values(M.battles).reduce((s, x)=> s + x.n, 0), campaigns:M.campaigns.length, seconds:Math.round((Date.now() - t0)/1000),
    smartWinRate:smartAll.n ? +(smartAll.w/smartAll.n).toFixed(3) : null,
    avgRounds:M.rounds.length ? +(M.rounds.reduce((s, x)=> s + x, 0)/M.rounds.length).toFixed(1) : null,
    campaignsWon:M.campaigns.filter(c=> c.outcome === "victory").length, browser:browser ? browser.ok : null,
    fingerprints:findings.filter(f=> f.severity !== "info").map(f=> f.key)
  };
  fs.mkdirSync(CFG.out, { recursive:true });
  const histPath = path.join(CFG.out, "history.jsonl");
  const prev = fs.existsSync(histPath) ? fs.readFileSync(histPath, "utf8").trim().split("\n").filter(Boolean).map(l=> JSON.parse(l)).pop() : null;
  const fresh = prev ? summary.fingerprints.filter(k=> !prev.fingerprints.includes(k)) : [];
  const gone = prev ? prev.fingerprints.filter(k=> !summary.fingerprints.includes(k)) : [];
  fs.appendFileSync(histPath, JSON.stringify(summary) + "\n");
  fs.writeFileSync(path.join(CFG.out, "report.json"), JSON.stringify({ summary, config:CFG, findings, metrics:M, browser, diff:{ fresh, gone } }, null, 1));

  const L = [];
  L.push("# Ghost audit", "", "_" + summary.when + " · commit " + summary.commit + " · " + summary.battles + " battles · " + summary.campaigns + " campaigns · " + summary.seconds + " s_", "");
  L.push("**Score " + score + "/100** — " + summary.critical + " critical, " + summary.major + " major, " + summary.minor + " minor, " + summary.info + " notes" + (prev ? " (last run: " + prev.score + ")" : ""), "");
  if(prev){ L.push("Since the last run: **" + fresh.length + " new**, **" + gone.length + " fixed**.", ""); fresh.forEach(k=> L.push("- new: " + k)); gone.forEach(k=> L.push("- fixed: " + k)); if(fresh.length || gone.length) L.push(""); }
  L.push("## Findings", "");
  if(!findings.length) L.push("Nothing found.", "");
  findings.forEach(f=>{
    L.push("### [" + f.severity.toUpperCase() + "] " + f.title, "", "`" + f.category + "` · seen " + f.count + "×", "");
    f.examples.forEach(e=>{ if(e.detail) L.push("- " + e.detail); if(e.repro) L.push("  - repro: `" + JSON.stringify(e.repro) + "`"); });
    L.push("");
  });
  L.push("## Balance", "", "| persona · threat | battles | won | rounds | dead/battle |", "|---|---|---|---|---|");
  Object.keys(M.battles).sort().forEach(k=>{ const s = M.battles[k]; L.push("| " + k.replace("|t", " · ") + " | " + s.n + " | " + Math.round(100*s.wins/s.n) + "% | " + (s.rounds/s.n).toFixed(1) + " | " + (s.deaths/s.n).toFixed(2) + " |"); });
  L.push("", "| class | deployed | dmg/battle | kills/battle | downed | died |", "|---|---|---|---|---|---|");
  Object.entries(M.classes).forEach(([k, c])=> L.push("| " + GS.CLASSES[k].name + " | " + c.deployed + " | " + (c.dmg/c.deployed).toFixed(1) + " | " + (c.kills/c.deployed).toFixed(2) + " | " + Math.round(100*c.downs/c.deployed) + "% | " + Math.round(100*c.deaths/c.deployed) + "% |"));
  L.push("", "| creature | spawned | dmg/spawn | killed | wardens downed |", "|---|---|---|---|---|");
  Object.entries(M.enemies).forEach(([k, e])=> L.push("| " + GS.ENEMIES[k].name + " | " + e.spawned + " | " + (e.dmg/Math.max(1, e.spawned)).toFixed(1) + " | " + e.killed + " | " + e.downed + " |"));
  L.push("", "Hit chance shown vs outcome: " + Object.entries(M.calib).filter(([, c])=> c.n >= 30).map(([k, c])=> k*10 + "s: " + Math.round(100*c.pred/c.n) + "→" + Math.round(100*c.hits/c.n) + "% (" + c.n + ")").join(" · "), "");
  if(M.campaigns.length){
    L.push("## Campaigns", "", "| seed | outcome | weeks | fights won/lost | dead | hearts | finale seen | research |", "|---|---|---|---|---|---|---|---|");
    M.campaigns.forEach(c=> L.push("| " + c.seed + " | " + c.outcome + " | " + c.weeks + " | " + c.fights.won + "/" + c.fights.lost + " | " + c.deaths + " | " + c.hearts + " | " + (c.finaleSeen ? "yes" : "no") + " | " + c.research.join(", ") + " |"));
    L.push("");
  }
  L.push("## Ability use", "", Object.entries(M.abilities).sort((a, b)=> b[1].tries - a[1].tries).map(([k, a])=> k + " " + a.ok + "/" + a.tries).join(" · "), "");
  if(browser){
    L.push("## In the browser", "", browser.ok ? "Played through the real page." : "**The browser pass failed.**", "");
    (browser.notes || []).forEach(n=> L.push("- " + n));
    if(browser.shots && browser.shots.length) L.push("", "Screenshots in `" + path.relative(ROOT, path.join(CFG.out, "shots")) + "/`: " + browser.shots.join(", "));
    L.push("");
  }
  fs.writeFileSync(path.join(CFG.out, "REPORT.md"), L.join("\n"));
  return { summary, findings };
}
function gitHead(){ try{ return require("child_process").execSync("git rev-parse --short HEAD", { cwd:ROOT, stdio:["ignore", "pipe", "ignore"] }).toString().trim(); }catch(e){ return "?"; } }

/* ---- go ---- */
(async ()=>{
  console.log("ghost: " + CFG.battles + " battles, " + CFG.fuzz + " fuzz battles, " + CFG.campaigns + " campaigns" + (CFG.browser ? ", plus the browser" : ""));
  battleSuite();
  console.log("ghost: battles done (" + ((Date.now() - t0)/1000).toFixed(1) + " s)");
  campaignSuite();
  console.log("ghost: campaigns done (" + ((Date.now() - t0)/1000).toFixed(1) + " s)");
  analyse();
  let browser = null;
  if(CFG.browser){
    try{ browser = await require("./browser.js").run(audit, { root:ROOT, out:path.join(CFG.out, "shots"), quick:QUICK }); }
    catch(err){ audit.find("critical", "browser", "The browser pass crashed: " + err.message, (err.stack || "").split("\n")[1], null); browser = { ok:false, notes:[String(err.message)] }; }
  }
  const { summary, findings } = report(browser);
  console.log("ghost: score " + summary.score + "/100 — " + summary.critical + " critical, " + summary.major + " major, " + summary.minor + " minor (" + summary.seconds + " s)");
  findings.filter(f=> f.severity !== "info").slice(0, 12).forEach(f=> console.log("  [" + f.severity + "] " + f.title + " ×" + f.count));
  console.log("ghost: report in " + path.relative(process.cwd(), path.join(CFG.out, "REPORT.md")));
  process.exit(summary.critical ? 1 : 0);
})();
