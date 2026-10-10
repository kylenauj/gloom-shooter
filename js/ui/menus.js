/* ------------------------------------------------------------------ *
 *  The screens between battles, printed like Pine Hollow's programme:
 *  slanted plates on the left, the detail on the right, over the
 *  clearing at night turning slowly behind them.
 * ------------------------------------------------------------------ */
(function(){
"use strict";
const GS = window.GS, C = GS.Campaign;
const UI = GS.UI = {};
const esc = s=> GS.HUD.esc(s), ico = (k, c)=> GS.HUD.icon(k, c);
UI.touch = matchMedia("(pointer:coarse)").matches;

const root = ()=> document.getElementById("screens");
UI.show = function(html, cls){
  const r = root(), bn = document.getElementById("banner"); if(bn) bn.className = "banner"; r.className = "screens on " + (cls || ""); r.innerHTML = html;
  r.querySelectorAll("button,[data-go]").forEach(b=> b.addEventListener("click", ()=>{ GS.Audio.start(); GS.Audio.play("click"); }, true));
  return r;
};
UI.hide = function(){ const r = root(); r.className = "screens"; r.innerHTML = ""; };
const on = (sel, fn)=> root().querySelectorAll(sel).forEach(el=> el.onclick = e=> fn(el, e));

UI.confirm = function(title, text, yes, fn){
  const d = document.createElement("div"); d.className = "modal";
  d.innerHTML = '<div class="plate dlg"><h3>' + esc(title) + "</h3><p>" + esc(text) + '</p><div class="row"><button class="item sel" id="dYes"><span>' + esc(yes) + '</span></button><button class="item" id="dNo"><span>Cancel</span></button></div></div>';
  document.body.appendChild(d);
  d.querySelector("#dYes").onclick = ()=>{ d.remove(); fn(); };
  d.querySelector("#dNo").onclick = ()=> d.remove();
};

const logo = '<div class="logo"><span class="l1">GLOOM</span><span class="plank">SHOOTER</span><span class="sub">Wardens of Glowcap Hollow</span></div>';

/* ---- title ---- */
UI.title = function(app){
  const save = C.load();
  UI.show('<div class="title-wrap">' + logo +
    '<div class="menu">' +
    (save && !save.over ? '<button class="item sel" data-go="continue"><span>Continue</span><small>Week ' + save.week + " · " + save.roster.length + " wardens</small></button>" : "") +
    '<button class="item' + (save && !save.over ? "" : " sel") + '" data-go="new"><span>New Campaign</span><small>Defend the Hollow</small></button>' +
    '<button class="item" data-go="skirmish"><span>Skirmish</span><small>One battle, your rules</small></button>' +
    '<button class="item" data-go="howto"><span>How to Play</span></button>' +
    "</div>" +
    '<p class="hint">A turn-based tactics game: <b>XCOM 2</b>\'s cover and squads, <b>Mechanicus</b>\'s shared Lumen and doom track, <b>Jagged Alliance</b>\'s AP, wages and quirks.</p></div>', "title");
  on("[data-go]", el=>{
    const g = el.dataset.go;
    if(g === "continue") app.continueCampaign();
    if(g === "new"){ if(save && !save.over) UI.confirm("Start a new campaign?", "Your current campaign will be overwritten.", "Start", ()=> app.newCampaign()); else app.newCampaign(); }
    if(g === "skirmish") UI.skirmish(app);
    if(g === "howto") UI.howto(app);
  });
};

/* ---- how to play ---- */
UI.howto = function(app){
  UI.show('<div class="cols"><div class="left"><h2 class="head">How to Play</h2><div class="menu"><button class="item back" data-go="back"><span>Back</span></button></div></div>' +
    '<div class="right note scroll">' +
    "<p><b>Turns.</b> Each warden has <b>4 AP</b> a turn. Moving costs 1 AP per stride (their mobility in tiles). Blue tiles leave you enough AP to shoot; amber tiles are a dash. Most guns end your turn when they fire; the Thornblade's strikes don't.</p>" +
    "<p><b>Cover.</b> Logs, clusters, crystals and stumps are <b>half cover</b> (-20 to be hit); giant caps and boulders are <b>full cover</b> (-40) and block sight. Cover only counts on the side facing the shooter. Caught in the open, you're <b>exposed</b>: +40 to be crit. Rock shelves give the <b>high ground</b>: +10 aim.</p>" +
    "<p><b>Concealment.</b> You start unseen. The Gloom waits in pods and only notices a warden who walks right up to it. Set up overwatch, then open fire: the pod scrambles for cover through your overwatch.</p>" +
    "<p><b>Lumen</b> is the squad's shared power (the cogitation of Mechanicus). Kills give 1, glow nodes give 3. Spend it on Sporecaster spells, or to <b>Overclock</b> any warden for +1 AP.</p>" +
    "<p><b>The Gloom Tide</b> rises every round, and every time you drain a node. At 3 the Gloom gets +10 aim, at 6 and 9 spore pods drop reinforcements, at 12 they never stop. Don't dawdle.</p>" +
    "<p><b>The Chorus.</b> Once a mission each, a squad song: a free buff for everyone. Research more.</p>" +
    "<p><b>Wounds.</b> A warden at 0 HP is usually <b>down and bleeding</b>: stabilize them (1 AP, adjacent) or win before they bleed out. Some just die.</p>" +
    "<p><b>The Hollow.</b> Each week, pick one mission; the most dangerous one you skip rots further, and the Gloom spreads from its strongholds. Spore samples pay for research; caps pay wages, recruits and the Workshop. Promote wardens and choose one of two skills at each rank.</p>" +
    '<p class="keys"><kbd>1</kbd>–<kbd>9</kbd> abilities · <kbd>Tab</kbd> next warden · <kbd>Esc</kbd> cancel · <kbd>Enter</kbd> end turn · <kbd>Q</kbd>/<kbd>E</kbd> turn camera · <kbd>WASD</kbd> pan · wheel zoom · <kbd>M</kbd> sound</p>' +
    "</div></div>");
  on("[data-go=back]", ()=> UI.title(app));
};

/* ---- skirmish ---- */
UI.skirmish = function(app){
  const st = UI.skirmishState = UI.skirmishState || { type:"purge", threat:2, rank:1, tier:0, size:4 };
  const opt = (k, label, vals, fmt)=> '<button class="item opt" data-k="' + k + '"><span>' + label + '</span><span class="val"><i class="ar" data-d="-1">‹</i><b>' + fmt(st[k]) + '</b><i class="ar" data-d="1">›</i></span></button>';
  UI.show('<div class="cols"><div class="left"><h2 class="head">Skirmish</h2><div class="menu">' +
    opt("type", "Mission", null, v=> GS.MISSION_TYPES[v].name) + opt("threat", "Threat", null, v=> v) + opt("rank", "Squad rank", null, v=> GS.RANKS[v].name) +
    opt("tier", "Kit", null, v=> GS.WEAPON_TIERS[v].name + " / " + GS.ARMOR_TIERS[v].name) + opt("size", "Squad", null, v=> v + " wardens") +
    '<button class="item sel" data-go="go"><span>Deploy</span></button><button class="item back" data-go="back"><span>Back</span></button></div></div>' +
    '<div class="right note"><p>One battle in a fresh clearing. Pick how dangerous the Gloom is, how seasoned the squad, and what they carry. Nothing here touches your campaign.</p></div></div>');
  const ranges = { type:["purge", "heart", "finale"], threat:[1, 2, 3, 4, 5, 6, 7, 8], rank:[0, 1, 2, 3], tier:[0, 1, 2], size:[3, 4, 5] };
  root().querySelectorAll(".opt").forEach(el=>{
    const step = d=>{ const k = el.dataset.k, R = ranges[k], i = R.indexOf(st[k]); st[k] = R[(i + d + R.length) % R.length]; UI.skirmish(app); };
    el.onclick = e=>{ const a = e.target.closest(".ar"); step(a ? +a.dataset.d : 1); };
  });
  on("[data-go=go]", ()=> app.skirmish(st));
  on("[data-go=back]", ()=> UI.title(app));
};

/* ---- the Hollow ---- */
const TABS = [["map", "The Forest"], ["squad", "Barracks"], ["research", "Mycology Lab"], ["workshop", "Workshop"], ["recruit", "Recruit"], ["report", "Report"]];
UI.hollow = function(app, tab, sel){
  const camp = app.camp;
  tab = tab || UI.tab || "map"; UI.tab = tab;
  if(camp.over) return UI.campaignOver(app);
  const head = '<div class="hollow-top plate"><b>GLOWCAP HOLLOW</b><span>Week <b>' + camp.week + '</b></span><span title="Caps pay wages, recruits and the Workshop">' + ico("gem") + " <b>" + camp.caps + '</b> caps</span>' +
    '<span title="Spore samples pay for research">' + ico("root") + " <b>" + camp.samples + "</b> samples</span>" +
    '<span title="Income from glowfarms in safe regions, less wages">+' + C.income(camp) + " / −" + C.wages(camp) + " a week</span>" +
    '<span class="fg" title="When the forest\'s total Gloom reaches 27, or the Hollow\'s reaches 5, the campaign is lost">Forest Gloom <b>' + C.forestGloom(camp) + "</b>/27</span>" +
    (camp.regions.hollow.gloom >= 3 ? '<span class="danger">The Hollow is at Gloom <b>' + camp.regions.hollow.gloom + "</b>/5: defend it</span>" : "") + "</div>";
  const tabs = '<div class="menu tabs">' + TABS.map(t=> '<button class="item' + (t[0] === tab ? " sel" : "") + '" data-tab="' + t[0] + '"><span>' + t[1] + "</span>" +
    (t[0] === "squad" && camp.roster.some(C.canPromote) ? '<small class="dot">promotion</small>' : "") +
    (t[0] === "research" && !camp.research.current ? '<small class="dot">idle</small>' : "") + "</button>").join("") +
    '<button class="item back" data-go="save"><span>Save &amp; Quit</span></button></div>';
  const body = UI["tab_" + tab](app, sel);
  UI.show(head + '<div class="hollow"><div class="left">' + tabs + '</div><div class="right">' + body + "</div></div>", "hollow");
  on("[data-tab]", el=> UI.hollow(app, el.dataset.tab));
  on("[data-go=save]", ()=>{ C.save(camp); UI.title(app); });
  UI["wire_" + tab] && UI["wire_" + tab](app, sel);
};

/* the forest map: regions, their gloom, this week's missions */
UI.tab_map = function(app, sel){
  const camp = app.camp, W = 1000, Hh = 620;
  const gcol = g=> ["#46e4ff", "#7fd0a0", "#c6d050", "#e09040", "#e0508a", "#b02ad0"][g];
  let svg = '<svg class="forest" viewBox="0 0 ' + W + " " + Hh + '">';
  svg += '<defs><radialGradient id="rg"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".5"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></radialGradient></defs>';
  const P = id=>{ const R = GS.REGIONS.find(r=> r.id === id); return [R.x*W, R.y*Hh]; };
  const done = new Set();
  GS.REGIONS.forEach(R=> R.links.forEach(l=>{ const k = [R.id, l].sort().join(); if(done.has(k)) return; done.add(k); const a = P(R.id), b = P(l);
    svg += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" class="link"/>'; }));
  GS.REGIONS.forEach(R=>{
    const g = camp.regions[R.id].gloom, [x, y] = P(R.id), m = camp.missions.find(mm=> mm.region === R.id);
    if(g >= 3) svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (40 + g*12) + '" fill="url(#rg)" opacity="' + (g/6) + '"/>';
    svg += '<g class="reg' + (m ? " has" : "") + (sel === (m && m.id) ? " sel" : "") + '"' + (m ? ' data-m="' + m.id + '"' : "") + '>';
    svg += '<circle cx="' + x + '" cy="' + y + '" r="30" fill="#0b1626" stroke="' + gcol(g) + '" stroke-width="4"/>';
    if(R.home) svg += '<path d="M' + (x - 12) + " " + (y + 8) + "l12-18 12 18z" + '" fill="#ffd23d"/>';
    else if(R.finale) svg += '<path d="M' + (x - 13) + " " + (y + 8) + "l4-16 5 8 4-12 4 12 5-8 4 16z" + '" fill="#ff4fd8"/>';
    else svg += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + gcol(g) + '"/>';
    for(let i=0;i<5;i++) svg += '<rect x="' + (x - 24 + i*10) + '" y="' + (y + 38) + '" width="8" height="6" fill="' + (i < g ? gcol(g) : "#22324a") + '"/>';
    svg += '<text x="' + x + '" y="' + (y - 42) + '" text-anchor="middle">' + esc(R.name.toUpperCase()) + "</text>";
    if(m) svg += '<circle class="pulse" cx="' + x + '" cy="' + y + '" r="36" fill="none" stroke="' + (m.type === "finale" ? "#ff4fd8" : "#ffd23d") + '" stroke-width="3"/>';
    svg += "</g>";
  });
  svg += "</svg>";
  const m = camp.missions.find(mm=> mm.id === sel) || null;
  const detail = m ? '<div class="plate mdetail"><h3>' + esc(C.missionName(m)) + "</h3><p>" + esc(GS.MISSION_TYPES[m.type].desc) + "</p>" +
    '<div class="kv"><span>Threat</span><b>' + "◆".repeat(m.threat) + '</b><span>Region gloom</span><b>' + camp.regions[m.region].gloom + "/5</b>" +
    (m.reward.caps ? '<span>Reward</span><b>' + m.reward.caps + " caps, " + m.reward.samples + " samples + kills</b>" : "") + "</div>" +
    '<p class="warn">The most dangerous mission you skip goes unanswered: its region rots further.</p>' +
    '<button class="item sel" data-go="deploy"><span>Choose the squad</span></button></div>'
    : '<div class="plate mdetail"><h3>This week</h3>' + camp.missions.map(mm=> '<button class="item" data-m="' + mm.id + '"><span>' + esc(C.missionName(mm)) + "</span><small>Threat " + mm.threat + "</small></button>").join("") + "</div>";
  return '<div class="mapwrap">' + svg + detail + "</div>";
};
UI.wire_map = function(app, sel){
  root().querySelectorAll("[data-m]").forEach(el=> el.onclick = ()=>{ GS.Audio.play("click"); UI.hollow(app, "map", el.dataset.m); });
  on("[data-go=deploy]", ()=> UI.deploy(app, sel));
};

/* the barracks */
UI.tab_squad = function(app, sel){
  const camp = app.camp;
  const t = camp.roster.find(x=> x.id === sel) || camp.roster[0];
  const list = camp.roster.map(r=> '<button class="trooper' + (t && r.id === t.id ? " sel" : "") + '" data-t="' + r.id + '"><img src="' + GS.Models.portrait(r.cls + camp.armorTier, { team:"squad", cls:r.cls, armorTier:camp.armorTier, type:r.cls }) + '" alt="">' +
    "<span><b>" + esc(r.name) + "</b><small>" + GS.RANKS[r.rank].name + " " + GS.CLASSES[r.cls].name + (r.wound ? ' · <i class="bad">wounded ' + r.wound + "w</i>" : "") + (C.canPromote(r) ? ' · <i class="good">PROMOTE</i>' : "") + "</small></span></button>").join("");
  if(!t) return '<div class="note">No wardens. Recruit some.</div>';
  const C0 = GS.CLASSES[t.cls], u = GS.makeSquadUnit(C.unitSpec(camp, t), camp), Q = GS.QUIRKS[t.quirk];
  const abil = u.abilities.map(a=>{ const D = GS.ABILITIES[a]; return '<div class="abrow">' + ico(D.icon) + "<b>" + esc(D.name) + "</b> " + esc(D.desc) + "</div>"; }).join("");
  let promo = "";
  if(C.canPromote(t)){
    const opts = C0.tree[t.rank];
    promo = '<div class="promo"><h4>Promote to ' + GS.RANKS[t.rank + 1].name + " — choose one</h4>" + opts.map(p=>{ const D = GS.ABILITIES[p];
      return '<button class="item" data-pick="' + p + '">' + ico(D.icon) + "<span>" + esc(D.name) + "<small>" + esc(D.desc) + "</small></span></button>"; }).join("") + "</div>";
  }
  const modOpts = cur=> '<option value="">— empty —</option>' + Object.keys(GS.MODS).map(m=> (camp.stock.mods[m] > 0 || cur === m) ? '<option value="' + m + '"' + (cur === m ? " selected" : "") + ">" + GS.MODS[m].name + " (" + GS.MODS[m].desc + ")" + (cur === m ? "" : " ×" + camp.stock.mods[m]) + "</option>" : "").join("");
  const itemOpts = cur=> '<option value="">— none —</option>' + Object.keys(GS.ITEMS).map(m=> (camp.stock.items[m] > 0 || cur === m) ? '<option value="' + m + '"' + (cur === m ? " selected" : "") + ">" + GS.ITEMS[m].name + (cur === m ? "" : " ×" + camp.stock.items[m]) + "</option>" : "").join("");
  return '<div class="barracks"><div class="roster">' + list + '</div><div class="plate tdetail">' +
    '<div class="thead"><img src="' + GS.Models.portrait(t.cls + camp.armorTier, u) + '" alt=""><div><h3>' + esc(t.name) + "</h3><small>" + GS.RANKS[t.rank].name + " " + C0.name + " · " + C0.role + " · " + t.xp + " xp · " + t.kills + " kills · " + t.missions + " missions</small>" +
    '<p class="blurb">' + esc(C0.blurb) + "</p>" + (Q ? '<p><span class="tag">' + Q.name + "</span> " + esc(Q.desc) + "</p>" : "") + "</div></div>" +
    '<div class="u-stats big"><span>HP <b>' + u.maxHp + "</b></span><span>ARM <b>" + u.armor + "</b></span><span>AIM <b>" + (u.aim + u.weapon.aim) + "</b></span><span>DEF <b>" + u.def + "</b></span><span>MOB <b>" + u.mob + "</b></span><span>WAGE <b>" + C.wageOf(t) + "</b></span></div>" +
    promo +
    '<h4>Loadout</h4><div class="loadout"><div><label>Weapon</label><b>' + esc(u.weapon.name) + "</b> " + u.weapon.dmg[0] + "-" + u.weapon.dmg[1] + " dmg" + (u.weapon.clip ? ", " + u.weapon.clip + " shots" : "") + "</div>" +
    '<div><label>Armour</label><b>' + GS.ARMOR_TIERS[camp.armorTier].name + "</b></div>" +
    [0, 1].map(i=> '<div><label>Mod ' + (i + 1) + '</label><select data-mod="' + i + '">' + modOpts(t.mods[i]) + "</select></div>").join("") +
    '<div><label>Item</label><select data-item="1">' + itemOpts(t.item) + "</select></div></div>" +
    "<h4>Abilities</h4>" + abil +
    '<div class="row"><button class="item back" data-go="dismiss"><span>Dismiss</span></button></div></div></div>';
};
UI.wire_squad = function(app, sel){
  const camp = app.camp, t = camp.roster.find(x=> x.id === sel) || camp.roster[0];
  root().querySelectorAll("[data-t]").forEach(el=> el.onclick = ()=> UI.hollow(app, "squad", el.dataset.t));
  if(!t) return;
  root().querySelectorAll("[data-pick]").forEach(el=> el.onclick = ()=>{ if(C.promote(camp, t.id, el.dataset.pick)){ GS.Audio.play("victory"); C.save(camp); } UI.hollow(app, "squad", t.id); });
  root().querySelectorAll("[data-mod]").forEach(el=> el.onchange = ()=>{ C.equipMod(camp, t.id, +el.dataset.mod, el.value || null); C.save(camp); UI.hollow(app, "squad", t.id); });
  root().querySelectorAll("[data-item]").forEach(el=> el.onchange = ()=>{ C.equipItem(camp, t.id, el.value || null); C.save(camp); UI.hollow(app, "squad", t.id); });
  on("[data-go=dismiss]", ()=> UI.confirm("Dismiss " + t.name + "?", "They'll leave the Hollow for good. Their kit goes back to the stores.", "Dismiss", ()=>{ C.dismiss(camp, t.id); C.save(camp); UI.hollow(app, "squad"); }));
};

/* the lab */
UI.tab_research = function(app){
  const camp = app.camp, R = camp.research;
  const cur = R.current ? '<div class="plate"><h3>In progress: ' + esc(GS.RESEARCH[R.current].name) + "</h3><p>" + R.progress + " of " + GS.RESEARCH[R.current].weeks + " weeks</p></div>" : '<div class="plate warn">The lab is idle. Start something.</div>';
  return cur + '<div class="cards">' + Object.keys(GS.RESEARCH).map(id=>{
    const D = GS.RESEARCH[id], why = C.researchBlock(camp, id), done = R.done.includes(id);
    return '<div class="card plate' + (done ? " done" : "") + '"><h4>' + esc(D.name) + "</h4><p>" + esc(D.desc) + '</p><div class="kv"><span>Cost</span><b>' + D.samples + " samples</b><span>Time</span><b>" + D.weeks + " week" + (D.weeks > 1 ? "s" : "") + "</b></div>" +
      (done ? '<b class="good">Done</b>' : why ? '<small class="why">' + esc(why) + "</small>" : '<button class="item sel" data-r="' + id + '"><span>Research</span></button>') + "</div>";
  }).join("") + "</div>";
};
UI.wire_research = function(app){ root().querySelectorAll("[data-r]").forEach(el=> el.onclick = ()=>{ if(C.startResearch(app.camp, el.dataset.r)) C.save(app.camp); UI.hollow(app, "research"); }); };

/* the workshop */
UI.tab_workshop = function(app){
  const camp = app.camp;
  const row = (kind, id, D, have)=> '<div class="card plate"><h4>' + esc(D.name) + "</h4><p>" + esc(D.desc) + '</p><div class="kv"><span>Cost</span><b>' + D.cost + " caps</b><span>In stores</span><b>" + (have || 0) + "</b></div>" +
    '<button class="item' + (camp.caps >= D.cost ? " sel" : "") + '" data-buy="' + kind + ":" + id + '"' + (camp.caps >= D.cost ? "" : " disabled") + "><span>Build</span></button></div>";
  return '<div class="plate"><h3>The squad\'s kit</h3><p>Weapons: <b>' + GS.WEAPON_TIERS[camp.weaponTier].name + "</b> tier · Armour: <b>" + GS.ARMOR_TIERS[camp.armorTier].name + "</b> · Chorus songs: <b>" + camp.chorus.map(c=> GS.CHORUS[c].name).join(", ") + "</b>. Better tiers come from the lab; mods and items are built here and fitted in the Barracks.</p></div>" +
    "<h4>Weapon mods</h4><div class=\"cards\">" + Object.keys(GS.MODS).map(id=> row("mod", id, GS.MODS[id], camp.stock.mods[id])).join("") + "</div>" +
    "<h4>Items</h4><div class=\"cards\">" + Object.keys(GS.ITEMS).map(id=> row("item", id, GS.ITEMS[id], camp.stock.items[id])).join("") + "</div>";
};
UI.wire_workshop = function(app){ root().querySelectorAll("[data-buy]").forEach(el=> el.onclick = ()=>{ const [k, id] = el.dataset.buy.split(":"); if(C.buy(app.camp, k, id)) C.save(app.camp); UI.hollow(app, "workshop"); }); };

/* recruits */
UI.tab_recruit = function(app){
  const camp = app.camp;
  return '<p class="note">Wardens for hire this week. They want a fee up front and a wage every week; if the coffers run dry, the dearest walks out.</p><div class="cards">' + camp.recruits.map((t, i)=>{
    const Q = GS.QUIRKS[t.quirk], fee = C.hireFee(t);
    return '<div class="card plate"><div class="thead"><img src="' + GS.Models.portrait(t.cls + camp.armorTier, { team:"squad", cls:t.cls, armorTier:camp.armorTier, type:t.cls }) + '" alt=""><div><h4>' + esc(t.name) + "</h4><small>" + GS.RANKS[t.rank].name + " " + GS.CLASSES[t.cls].name + "</small></div></div>" +
      "<p>" + esc(GS.CLASSES[t.cls].blurb) + "</p>" + (Q ? '<p><span class="tag">' + Q.name + "</span> " + esc(Q.desc) + "</p>" : "") +
      '<div class="kv"><span>Fee</span><b>' + fee + " caps</b><span>Wage</span><b>" + C.wageOf(t) + " a week</b></div>" +
      '<button class="item' + (camp.caps >= fee ? " sel" : "") + '" data-hire="' + i + '"' + (camp.caps >= fee ? "" : " disabled") + "><span>Hire</span></button></div>";
  }).join("") + "</div>";
};
UI.wire_recruit = function(app){ root().querySelectorAll("[data-hire]").forEach(el=> el.onclick = ()=>{ if(C.hire(app.camp, +el.dataset.hire)) C.save(app.camp); UI.hollow(app, "recruit"); }); };

/* the week's report, and the fallen */
UI.tab_report = function(app){
  const camp = app.camp;
  return '<div class="plate report"><h3>Week ' + camp.week + "</h3>" + (camp.report || []).map(l=> "<p>" + esc(l) + "</p>").join("") + "</div>" +
    (camp.memorial.length ? '<div class="plate"><h3>The fallen</h3>' + camp.memorial.map(m=> "<p><b>" + esc(m.name) + "</b>, " + GS.RANKS[m.rank].name + " " + GS.CLASSES[m.cls].name + " · " + m.kills + " kills · fell in " + esc(m.where) + ", week " + m.week + "</p>").join("") + "</div>" : "");
};

/* ---- deploy ---- */
UI.deploy = function(app, mid){
  const camp = app.camp, m = camp.missions.find(x=> x.id === mid);
  const ready = C.ready(camp);
  UI.picked = (UI.picked || []).filter(id=> ready.some(t=> t.id === id));
  if(!UI.picked.length) UI.picked = ready.slice(0, camp.squadSize).map(t=> t.id);
  const draw = ()=>{
    UI.show('<div class="deploy"><h2 class="head">' + esc(C.missionName(m)) + '</h2><p class="note">Pick up to ' + camp.squadSize + " wardens. Threat " + m.threat + ".</p>" +
      '<div class="cards">' + camp.roster.map(t=>{
        const on = UI.picked.includes(t.id), u = GS.makeSquadUnit(C.unitSpec(camp, t), camp);
        return '<button class="card plate trooper-card' + (on ? " on" : "") + (t.wound ? " off" : "") + '" data-t="' + t.id + '"' + (t.wound ? " disabled" : "") + '><img src="' + GS.Models.portrait(t.cls + camp.armorTier, u) + '" alt=""><b>' + esc(t.name) + "</b><small>" + GS.RANKS[t.rank].name + " " + GS.CLASSES[t.cls].name + "</small>" +
          (t.wound ? '<small class="bad">Wounded: ' + t.wound + " weeks</small>" : '<small>' + u.maxHp + " HP · " + esc(u.weapon.name) + (t.item ? " · " + GS.ITEMS[t.item].name : "") + "</small>") + "</button>";
      }).join("") + '</div><div class="row"><button class="item back" data-go="back"><span>Back</span></button><button class="item sel" data-go="launch"' + (UI.picked.length ? "" : " disabled") + "><span>Launch · " + UI.picked.length + "/" + camp.squadSize + "</span></button></div></div>", "deploy");
    root().querySelectorAll("[data-t]").forEach(el=> el.onclick = ()=>{
      const id = el.dataset.t, i = UI.picked.indexOf(id);
      if(i >= 0) UI.picked.splice(i, 1); else if(UI.picked.length < camp.squadSize) UI.picked.push(id);
      draw();
    });
    on("[data-go=back]", ()=> UI.hollow(app, "map", mid));
    on("[data-go=launch]", ()=> app.launch(mid, UI.picked.slice()));
  };
  draw();
};

/* ---- after a battle ---- */
UI.results = function(app, sum, onContinue){
  const won = sum.result === "victory";
  const fate = { ok:"Returned", wounded:"Badly wounded", dead:"Killed in action", lost:"Left behind" };
  UI.show('<div class="results"><h2 class="head ' + (won ? "win" : "lose") + '">' + (won ? "VICTORY" : sum.result === "retreat" ? "RETREAT" : "DEFEAT") + "</h2>" +
    '<p class="note">' + sum.rounds + " rounds · " + sum.samples + " spore samples recovered · the Gloom Tide reached " + sum.tide + ".</p>" +
    '<div class="cards">' + sum.troops.map(t=> '<div class="card plate ' + (t.fate === "ok" ? "" : t.fate === "wounded" ? "warn" : "bad") + '"><b>' + esc(t.name) + "</b><small>" + fate[t.fate] + "</small><small>" + t.kills + " kills · +" + (t.fate === "dead" || t.fate === "lost" ? 0 : t.xp) + " xp · " + Math.max(0, t.hp) + "/" + t.maxHp + " HP</small></div>").join("") + "</div>" +
    '<div class="row"><button class="item sel" data-go="on"><span>Continue</span></button></div></div>', "results");
  on("[data-go=on]", onContinue);
};

UI.campaignOver = function(app){
  const camp = app.camp, won = camp.over === "victory";
  UI.show('<div class="results"><h2 class="head ' + (won ? "win" : "lose") + '">' + (won ? "THE FOREST IS SAVED" : "THE GLOOM TAKES THE FOREST") + "</h2>" +
    '<div class="plate report">' + (camp.report || []).slice(0, 4).map(l=> "<p>" + esc(l) + "</p>").join("") + "<p>Week " + camp.week + " · " + camp.memorial.length + " wardens fell.</p></div>" +
    '<div class="row"><button class="item sel" data-go="t"><span>Title</span></button></div></div>', "results");
  on("[data-go=t]", ()=>{ C.clear(); UI.title(app); });
};

})();
