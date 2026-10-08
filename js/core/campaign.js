/* ------------------------------------------------------------------ *
 *  The campaign: the Hollow, the forest map, and the weeks between
 *  missions.
 *
 *  A week is one strategic turn (XCOM's month compressed, Jagged
 *  Alliance's day stretched). Each week offers a few missions in
 *  different regions; you can only fly one, and the Gloom grows where
 *  you didn't go. Research, the Workshop and recruiting spend what the
 *  missions bring home. Lose the Hollow, or let the whole forest rot,
 *  and it's over; kill the Sporelord and it's won.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS;
const C = GS.Campaign = {};
const SAVE_KEY = "gloomshooter.save.v1";

const START_GLOOM = { hollow:1, mossdeep:2, lantern:2, rotfen:3, ashcap:3, under:4, crown:5 };

C.wageOf = t=> 5 + t.rank*2 + ((GS.QUIRKS[t.quirk] || {}).wage || 0);
C.hireFee = t=> 20 + t.rank*10;
C.rankFor = xp=> { let r = 0; GS.RANKS.forEach((R, i)=>{ if(xp >= R.xp) r = i; }); return r; };

function newTrooper(rng, cls, opts){
  opts = opts || {};
  const t = {
    id:"t" + rng.int(100000, 999999), name:rng.pick(GS.NAMES.first) + " " + rng.pick(GS.NAMES.last),
    cls, rank:0, xp:0, picks:[], mods:[], item:null, quirk:opts.quirk !== undefined ? opts.quirk : (rng.chance(0.65) ? rng.pick(Object.keys(GS.QUIRKS)) : null),
    wound:0, kills:0, missions:0, pending:0
  };
  if(GS.QUIRKS[t.quirk] && GS.QUIRKS[t.quirk].xp) t.xp = GS.QUIRKS[t.quirk].xp;
  t.pending = C.rankFor(t.xp);
  return t;
}

C.create = function(seed){
  seed = seed || (Date.now() % 100000);
  const rng = GS.RNG(seed);
  const camp = {
    version:1, seed, week:1, caps:70, samples:4,
    roster:[], memorial:[],
    weaponTier:0, armorTier:0, squadSize:4, lumenStart:0, critVsGloom:0, chorus:["glowHymn"], finale:false,
    research:{ done:[], current:null, progress:0 },
    stock:{ mods:{}, items:{ blastcap:2, salve:2 } },
    regions:{}, missions:[], recruits:[], hearts:0, over:null, report:[], rngState:0
  };
  GS.REGIONS.forEach(r=> camp.regions[r.id] = { gloom:START_GLOOM[r.id] });
  ["capguard", "thornblade", "longcap", "sporecaster", "puffbomber", "capguard"].forEach(c=> camp.roster.push(newTrooper(rng, c, { quirk:null })));
  camp.roster[0].item = "blastcap"; camp.roster[4].item = "salve";
  camp.stock.items.blastcap--; camp.stock.items.salve--;
  camp.rngState = rng.state;
  C.genMissions(camp); C.genRecruits(camp);
  camp.report = ["The Gloom has reached the edge of the Hollow. Six wardens stand ready.", "Pick a mission on the map. The regions you leave alone will rot further."];
  return camp;
};
function rngOf(camp){ const r = GS.RNG(1); r.state = camp.rngState || camp.seed; return { r, save:()=> camp.rngState = r.state }; }

C.threatFor = (camp, region)=> GS.clamp(1 + Math.floor(camp.regions[region].gloom*0.8) + Math.floor((camp.week - 1)/3), 1, 8);
C.genMissions = function(camp){
  const { r, save } = rngOf(camp);
  const pool = GS.REGIONS.filter(R=> !R.finale && camp.regions[R.id].gloom >= 1).map(R=> R.id);
  r.shuffle(pool);
  camp.missions = pool.slice(0, 3).map(id=>{
    const g = camp.regions[id].gloom, type = g >= 3 && r.chance(0.45) ? "heart" : "purge", threat = C.threatFor(camp, id);
    return { id:"m" + camp.week + "_" + id, region:id, type, threat, seed:r.int(1, 1e6),
             reward:{ caps:20 + threat*6 + (type === "heart" ? 15 : 0), samples:type === "heart" ? 3 : 1 } };
  });
  if(camp.finale) camp.missions.push({ id:"m_finale", region:"crown", type:"finale", threat:8, seed:r.int(1, 1e6), reward:{ caps:0, samples:0 } });
  save();
};
C.genRecruits = function(camp){
  const { r, save } = rngOf(camp);
  camp.recruits = [];
  for(let k=0;k<3;k++){ const t = newTrooper(r, r.pick(GS.CLASS_ORDER)); if(r.chance(0.12)){ t.quirk = "veteran"; t.xp = 2; t.pending = 1; } camp.recruits.push(t); }
  save();
};
C.regionName = id=> (GS.REGIONS.find(R=> R.id === id) || {}).name || id;
C.missionName = m=> GS.MISSION_TYPES[m.type].name + " · " + C.regionName(m.region);

/* ---- the squad ---- */
C.ready = camp=> camp.roster.filter(t=> !t.wound);
C.unitSpec = function(camp, t){
  return { id:"b_" + t.id, rosterId:t.id, name:t.name, cls:t.cls, rank:t.rank, picks:t.picks.slice(), mods:t.mods.slice(), item:t.item, quirk:t.quirk };
};
C.launch = function(camp, missionId, ids){
  const m = camp.missions.find(x=> x.id === missionId);
  if(!m) return null;
  const troops = ids.map(id=> camp.roster.find(t=> t.id === id)).filter(t=> t && !t.wound).slice(0, camp.squadSize);
  if(!troops.length) return null;
  const squad = troops.map(t=> GS.makeSquadUnit(C.unitSpec(camp, t), camp));
  return GS.setupBattle({ seed:m.seed, type:m.type, threat:m.threat, squad, where:C.regionName(m.region),
    mods:{ lumenStart:camp.lumenStart, critVsGloom:camp.critVsGloom, chorus:camp.chorus.slice() } });
};

/* ---- after a mission ---- */
C.resolve = function(camp, missionId, sum){
  const m = camp.missions.find(x=> x.id === missionId), rep = [];
  const won = sum.result === "victory";
  sum.troops.forEach(s=>{
    const t = camp.roster.find(x=> x.id === s.id); if(!t) return;
    t.missions++; t.kills += s.kills;
    if(s.fate === "dead" || s.fate === "lost"){
      camp.roster = camp.roster.filter(x=> x !== t);
      camp.memorial.push({ name:t.name, cls:t.cls, rank:t.rank, kills:t.kills, week:camp.week, where:C.regionName(m.region) });
      rep.push(t.name + (s.fate === "lost" ? " was left behind in the Gloom." : " fell in " + C.regionName(m.region) + "."));
      return;
    }
    t.xp += s.xp;
    const lost = s.maxHp - s.hp;
    t.wound = s.fate === "wounded" ? 2 + Math.ceil(s.maxHp/3) : lost > 0 ? Math.ceil(lost/3) : 0;
    if(t.wound) rep.push(t.name + " is in the infirmary for " + t.wound + " week" + (t.wound > 1 ? "s" : "") + ".");
    const r = Math.min(GS.RANKS.length - 1, C.rankFor(t.xp));
    if(r > t.pending){ t.pending = r; rep.push(t.name + " can be promoted to " + GS.RANKS[r].name + "."); }
  });
  const reg = camp.regions[m.region];
  camp.samples += sum.samples;
  if(won){
    camp.caps += m.reward.caps; camp.samples += m.reward.samples;
    reg.gloom = Math.max(0, reg.gloom - 2);
    if(m.type === "heart") camp.hearts++;
    rep.unshift("Victory in " + C.regionName(m.region) + ": +" + m.reward.caps + " caps, +" + (sum.samples + m.reward.samples) + " spore samples. The Gloom there recedes.");
    if(m.type === "finale"){ camp.over = "victory"; rep.unshift("The Sporelord is dead. The forest breathes again."); }
  } else {
    reg.gloom = Math.min(5, reg.gloom + 1);
    rep.unshift((sum.result === "retreat" ? "The squad pulled out of " : "The squad was overrun in ") + C.regionName(m.region) + ". The Gloom spreads there.");
  }
  // every mission you didn't fly: the Gloom grows unchecked
  camp.missions.forEach(o=>{ if(o !== m && o.type !== "finale"){ camp.regions[o.region].gloom = Math.min(5, camp.regions[o.region].gloom + 1); rep.push("Unanswered: " + C.regionName(o.region) + " rots further."); } });
  camp.report = rep;
  C.advanceWeek(camp);
  return rep;
};

C.income = camp=> 25 + 8*GS.REGIONS.filter(R=> !R.finale && camp.regions[R.id].gloom <= 1).length;
C.wages = camp=> camp.roster.reduce((s, t)=> s + C.wageOf(t), 0);

C.advanceWeek = function(camp){
  const { r, save } = rngOf(camp), rep = camp.report;
  camp.week++;
  const inc = C.income(camp), wages = C.wages(camp);
  camp.caps += inc - wages;
  rep.push("Week " + camp.week + ": the glowfarms bring in " + inc + " caps; wages cost " + wages + ".");
  // unpaid wardens walk (Jagged Alliance)
  if(camp.caps < 0 && camp.roster.length){
    const t = camp.roster.slice().sort((a, b)=> C.wageOf(b) - C.wageOf(a))[0];
    camp.roster = camp.roster.filter(x=> x !== t); camp.caps += C.wageOf(t);
    rep.push("The coffers are empty. " + t.name + " walks out.");
  }
  camp.roster.forEach(t=>{ if(t.wound > 0) t.wound--; });
  // research
  const R = camp.research;
  if(R.current){
    R.progress++;
    const D = GS.RESEARCH[R.current];
    if(R.progress >= D.weeks){ C.applyUnlock(camp, D.unlock); R.done.push(R.current); rep.push("Research complete: " + D.name + "."); R.current = null; R.progress = 0; }
  }
  // the Gloom spreads from wherever it's thickest
  const spreads = 1 + Math.floor(camp.week/4);
  for(let k=0;k<spreads;k++){
    const src = GS.REGIONS.filter(X=> camp.regions[X.id].gloom >= 3);
    if(!src.length) break;
    const from = r.pick(src), to = r.pick(from.links.map(id=> GS.REGIONS.find(X=> X.id === id)).filter(X=> !X.finale && camp.regions[X.id].gloom < 5));
    if(!to) continue;
    camp.regions[to.id].gloom++;
    rep.push("The Gloom creeps from " + from.name + " into " + to.name + ".");
  }
  save();
  const total = GS.REGIONS.filter(X=> !X.finale).reduce((s, X)=> s + camp.regions[X.id].gloom, 0);
  if(!camp.over && camp.regions.hollow.gloom >= 5){ camp.over = "defeat"; rep.unshift("The Gloom has taken Glowcap Hollow."); }
  if(!camp.over && total >= 27){ camp.over = "defeat"; rep.unshift("The whole forest has rotted."); }
  if(!camp.over && !camp.roster.length && camp.caps < 20){ camp.over = "defeat"; rep.unshift("No wardens left, and nothing to hire more with."); }
  C.genMissions(camp); C.genRecruits(camp);
};
C.forestGloom = camp=> GS.REGIONS.filter(X=> !X.finale).reduce((s, X)=> s + camp.regions[X.id].gloom, 0);

C.applyUnlock = function(camp, U){
  if(U.weaponTier) camp.weaponTier = Math.max(camp.weaponTier, U.weaponTier);
  if(U.armorTier) camp.armorTier = Math.max(camp.armorTier, U.armorTier);
  if(U.chorus && !camp.chorus.includes(U.chorus)) camp.chorus.push(U.chorus);
  if(U.lumenStart) camp.lumenStart += U.lumenStart;
  if(U.squadSize) camp.squadSize = Math.max(camp.squadSize, U.squadSize);
  if(U.critVsGloom) camp.critVsGloom += U.critVsGloom;
  if(U.finale) camp.finale = true;
};

/* ---- research ---- */
C.researchBlock = function(camp, id){
  const D = GS.RESEARCH[id];
  if(camp.research.done.includes(id)) return "Done";
  if(camp.research.current === id) return "In progress";
  if(camp.research.current) return "The lab is busy";
  if((D.req || []).some(q=> !camp.research.done.includes(q))) return "Needs " + D.req.filter(q=> !camp.research.done.includes(q)).map(q=> GS.RESEARCH[q].name).join(", ");
  if(D.hearts && camp.hearts < D.hearts) return "Burn " + D.hearts + " Gloom Hearts first (" + camp.hearts + ")";
  if(camp.samples < D.samples) return "Needs " + D.samples + " samples";
  return null;
};
C.startResearch = function(camp, id){
  if(C.researchBlock(camp, id)) return false;
  camp.samples -= GS.RESEARCH[id].samples; camp.research.current = id; camp.research.progress = 0;
  return true;
};

/* ---- the Workshop ---- */
C.buy = function(camp, kind, id){
  const D = kind === "mod" ? GS.MODS[id] : GS.ITEMS[id];
  if(!D || camp.caps < D.cost) return false;
  camp.caps -= D.cost;
  const S = kind === "mod" ? camp.stock.mods : camp.stock.items;
  S[id] = (S[id] || 0) + 1;
  return true;
};
C.equipMod = function(camp, tid, slot, id){
  const t = camp.roster.find(x=> x.id === tid); if(!t) return false;
  const cur = t.mods[slot];
  if(id && !(camp.stock.mods[id] > 0)) return false;
  if(cur) camp.stock.mods[cur] = (camp.stock.mods[cur] || 0) + 1;
  if(id){ camp.stock.mods[id]--; t.mods[slot] = id; } else t.mods.splice(slot, 1);
  t.mods = t.mods.filter(Boolean);
  return true;
};
C.equipItem = function(camp, tid, id){
  const t = camp.roster.find(x=> x.id === tid); if(!t) return false;
  if(id && !(camp.stock.items[id] > 0)) return false;
  if(t.item) camp.stock.items[t.item] = (camp.stock.items[t.item] || 0) + 1;
  t.item = id || null;
  if(id) camp.stock.items[id]--;
  return true;
};

/* ---- the barracks ---- */
C.hire = function(camp, idx){
  const t = camp.recruits[idx];
  if(!t || camp.caps < C.hireFee(t)) return false;
  camp.caps -= C.hireFee(t);
  camp.roster.push(t); camp.recruits.splice(idx, 1);
  return true;
};
C.dismiss = function(camp, tid){
  const t = camp.roster.find(x=> x.id === tid); if(!t) return false;
  if(t.item) camp.stock.items[t.item] = (camp.stock.items[t.item] || 0) + 1;
  t.mods.forEach(m=> camp.stock.mods[m] = (camp.stock.mods[m] || 0) + 1);
  camp.roster = camp.roster.filter(x=> x !== t);
  return true;
};
C.canPromote = t=> t.pending > t.rank && t.rank < GS.RANKS.length - 1;
C.promote = function(camp, tid, pick){
  const t = camp.roster.find(x=> x.id === tid);
  if(!t || !C.canPromote(t)) return false;
  const opts = GS.CLASSES[t.cls].tree[t.rank];
  if(!opts || !opts.includes(pick)) return false;
  t.rank++; t.picks.push(pick);
  return true;
};

/* ---- saving (browser only; every access guarded) ---- */
C.save = function(camp){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(camp)); return true; }catch(e){ return false; } };
C.load = function(){ try{ const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }catch(e){ return null; } };
C.clear = function(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} };

})(typeof window !== "undefined" ? window : globalThis);
