/* the rules engine, headless: node --test tests/ */
const test = require("node:test");
const assert = require("node:assert");
const GS = require("./load.js");

/* an empty w x h field, with props dropped where asked */
function field(w, h, props){
  const m = GS.Grid.generate({ seed:1, w, h, pods:0, nodes:0 });
  m.tiles.forEach(t=>{ t.h = 0; t.block = false; t.cover = 0; t.los = false; t.prop = null; t.hazard = null; t.destructible = false; });
  m.pods = []; m.nodes = []; m.heart = null;
  (props || []).forEach(([x, y, p])=>{ const t = m.at(x, y), P = GS.PROPS[p]; Object.assign(t, { prop:p, block:true, cover:P.cover, los:P.los, destructible:P.destructible }); });
  return m;
}
function duel(map, a, b, opts){
  const s = GS.makeSquadUnit({ cls:a.cls || "capguard", name:"A", picks:a.picks || [] });
  const g = GS.makeEnemyUnit(b.type || "spitter");
  const bt = new GS.Battle(Object.assign({ map, squad:[s], enemies:[{ unit:g, x:b.x, y:b.y, pod:null }], seed:3, concealed:false }, opts));
  s.x = a.x; s.y = a.y; bt.refreshVision();
  return { bt, s, g };
}

test("map generation is deterministic and fully connected", ()=>{
  const a = GS.Grid.generate({ seed:42 }), b = GS.Grid.generate({ seed:42 });
  assert.deepStrictEqual(a.tiles.map(t=> t.prop), b.tiles.map(t=> t.prop));
  const s = a.spawn[0], R = GS.Grid.reach(a, s.x, s.y, 999);
  a.tiles.forEach(t=>{ if(!t.block) assert.notStrictEqual(R.cost[t.y*a.w + t.x], Infinity, "unreachable open tile " + t.x + "," + t.y); });
  assert.ok(a.pods.length >= 2 && a.nodes.length === 3);
});

test("movement: diagonals cost 1.5, no corner cutting, ledges cost extra", ()=>{
  const m = field(6, 6, [[1, 0, "boulder"]]);
  let R = GS.Grid.reach(m, 0, 0, 10);
  assert.strictEqual(R.cost[1*6 + 1], 2, "can't cut the boulder's corner diagonally");
  R = GS.Grid.reach(m, 0, 2, 10);
  assert.strictEqual(R.cost[3*6 + 1], 1.5);
  m.at(2, 2).h = 1;
  R = GS.Grid.reach(m, 0, 2, 10);
  assert.strictEqual(R.cost[2*6 + 2], 3);
});

test("line of sight: full cover blocks, half cover doesn't, stepping out works", ()=>{
  const m = field(9, 9, [[4, 4, "giant"], [4, 6, "log"]]);
  assert.strictEqual(GS.Grid.clearLine(m, 2, 4, 6, 4), false);
  assert.strictEqual(GS.Grid.clearLine(m, 2, 6, 6, 6), true);
  // tucked in right behind the giant cap, a unit leans out round it
  assert.strictEqual(GS.Grid.canSee(m, 3, 4, 7, 4), true);
  assert.strictEqual(GS.Grid.canSee(m, 1, 4, 7, 4), false);
});

test("cover counts only from the side the attacker is on", ()=>{
  const m = field(9, 9, [[5, 4, "log"], [4, 3, "boulder"]]);
  assert.strictEqual(GS.Grid.coverAgainst(m, 4, 4, 8, 4), 1);     // east, behind the log
  assert.strictEqual(GS.Grid.coverAgainst(m, 4, 4, 4, 0), 2);     // north, behind the boulder
  assert.strictEqual(GS.Grid.coverAgainst(m, 4, 4, 8, 0), 2);     // north-east: best of both
  assert.strictEqual(GS.Grid.coverAgainst(m, 4, 4, 0, 8), 0);     // flanked from the south-west
});

test("to-hit: half cover -20, full -40, flank adds crit, high ground +10", ()=>{
  const m = field(12, 12, [[6, 5, "log"]]);
  const { bt, s, g } = duel(m, { x:6, y:9 }, { x:6, y:4, type:"spitter" });
  const open = bt.hitInfo(s, g); // spitter at (6,4): the log is south of it, the attacker is south: half cover
  assert.strictEqual(open.cover, 1);
  assert.ok(open.rows.some(r=> r[0] === "Half cover" && r[1] === -20));
  g.x = 1; g.y = 4; bt.refreshVision();
  const fl = bt.hitInfo(s, g);
  assert.strictEqual(fl.cover, 0);
  assert.ok(fl.crit >= 40, "exposed target gives +40 crit");
  m.at(s.x, s.y).h = 1;
  assert.ok(bt.hitInfo(s, g).rows.some(r=> r[0] === "High ground"));
});

test("AP: moving costs one AP per mobility stride, firing ends the turn", ()=>{
  const m = field(14, 14);
  const { bt, s, g } = duel(m, { x:6, y:12 }, { x:6, y:4 });
  assert.strictEqual(s.ap, 4);
  assert.ok(bt.move(s, 6, 10));            // 2 tiles, mob 3: 1 AP
  assert.strictEqual(s.ap, 3);
  assert.ok(bt.move(s, 6, 6));             // 4 tiles: 2 AP
  assert.strictEqual(s.ap, 1);
  s.ap = 4;
  assert.ok(bt.act(s, "fire", g));
  assert.strictEqual(s.ap, 0, "the scattergun ends the turn");
  assert.strictEqual(s.ammo, s.weapon.clip - 1);
});

test("melee strike walks up to the target first", ()=>{
  const m = field(14, 14);
  const { bt, s, g } = duel(m, { x:6, y:12, cls:"thornblade" }, { x:6, y:7, type:"husk" });
  assert.ok(bt.targetsFor(s, "fire").includes(g));
  assert.ok(bt.act(s, "fire", g));
  assert.ok(Math.abs(s.x - g.x) <= 1 && Math.abs(s.y - g.y) <= 1);
  assert.ok(s.ap >= 0 && s.ap < 4);
});

test("overwatch fires at a moving enemy", ()=>{
  const m = field(14, 14);
  const { bt, s, g } = duel(m, { x:6, y:12, cls:"longcap" }, { x:2, y:4, type:"rotling" });
  assert.ok(bt.act(s, "overwatch"));
  assert.strictEqual(s.overwatch, 1);
  bt.drain();
  bt.team = "gloom"; g.ap = 4;
  bt.move(g, 4, 6);
  const ev = bt.drain();
  assert.ok(ev.some(e=> e.type === "attack" && e.reaction === "overwatch"), "overwatch shot taken");
});

test("concealment: pods stay dormant until spotted close, then scamper", ()=>{
  const m = field(16, 16);
  const s = GS.makeSquadUnit({ cls:"capguard" });
  const bt = new GS.Battle({ map:m, squad:[s], enemies:[{ type:"rotling", x:8, y:3, pod:"p0" }, { type:"spitter", x:9, y:3, pod:"p0" }], seed:5 });
  s.x = 8; s.y = 12; bt.refreshVision();
  assert.strictEqual(bt.concealed, true);
  assert.ok(bt.gloom().every(g=> !g.active));
  bt.move(s, 8, 9);
  assert.strictEqual(bt.concealed, true, "seen from 6 tiles, but concealed: not noticed");
  s.ap = 4; bt.move(s, 8, 6);
  assert.strictEqual(bt.concealed, false, "walked right up to them");
  assert.ok(bt.gloom().every(g=> g.active));
});

test("statuses: poison ticks, root stops movement, hunker doubles cover", ()=>{
  const m = field(12, 12, [[6, 5, "log"]]);
  const { bt, s, g } = duel(m, { x:6, y:9 }, { x:6, y:4, type:"spitter" });
  bt.addStatus(g, "rooted", 1);
  assert.strictEqual(bt.moveBudget(g), 0);
  const before = bt.hitInfo(s, g).chance;
  bt.addStatus(g, "hunkered", 1);
  assert.strictEqual(bt.hitInfo(s, g).chance, Math.max(5, before - 20 - 20));
  bt.addStatus(s, "poison", 2);
  const hp = s.hp; bt.endTurn();
  assert.strictEqual(s.hp <= hp - 1 || s.dead || s.downed, true);
});

test("area spells: glow spares the squad, the mortar doesn't, and it smashes cover", ()=>{
  const m = field(14, 14, [[7, 6, "log"]]);
  const caster = GS.makeSquadUnit({ cls:"sporecaster", picks:["glowburst"] });
  const bomber = GS.makeSquadUnit({ cls:"puffbomber" });
  const ally = GS.makeSquadUnit({ cls:"capguard" });
  const bt = new GS.Battle({ map:m, squad:[caster, bomber, ally], enemies:[{ type:"rotling", x:7, y:5, pod:null }], seed:9, concealed:false });
  caster.x = 7; caster.y = 11; bomber.x = 5; bomber.y = 11; ally.x = 8; ally.y = 6; bt.refreshVision();
  bt.lumen = 5;
  const allyHp = ally.hp;
  assert.ok(bt.act(caster, "glowburst", { x:7, y:6 }));
  assert.strictEqual(ally.hp, allyHp, "glow doesn't hurt wardens");
  assert.ok(bt.act(bomber, "mortar", { x:7, y:6 }));
  assert.ok(ally.hp < allyHp || ally.downed || ally.dead, "the mortar does");
  assert.strictEqual(m.at(7, 6).prop, null, "the log is smashed");
});

test("gloom tide: thresholds bring reinforcements", ()=>{
  const m = field(22, 22);
  const s = GS.makeSquadUnit({ cls:"capguard" });
  const bt = new GS.Battle({ map:m, squad:[s], enemies:[{ type:"heart", x:11, y:2, pod:null }], seed:2, concealed:false, mission:{ type:"heart" } });
  const n0 = bt.gloom().length;
  bt.raiseTide(6);
  assert.strictEqual(bt.tideAim, 10);
  assert.ok(bt.gloom().length > n0, "a spore pod landed");
});

test("victory and defeat", ()=>{
  const m = field(12, 12);
  const { bt, s, g } = duel(m, { x:6, y:9 }, { x:6, y:4, type:"rotling" });
  bt.damage(g, 99, { src:s });
  assert.strictEqual(bt.over, "victory");
  assert.strictEqual(s.kills, 1);
  const d = duel(field(12, 12), { x:6, y:9 }, { x:6, y:4, type:"rotling" });
  d.bt.damage(d.s, 99); if(!d.s.dead) d.bt.damage(d.s, 1);
  assert.strictEqual(d.bt.over, "defeat");
});

test("whole battles run to the end, AI against AI", ()=>{
  for(let seed=1; seed<=12; seed++){
    const squad = GS.CLASS_ORDER.slice(0, 4).map(c=> GS.makeSquadUnit({ cls:c, rank:1, picks:[GS.CLASSES[c].tree[0][0]] }));
    const b = GS.setupBattle({ seed, type:seed % 3 ? "purge" : "heart", threat:1 + seed % 4, squad });
    for(let k=0; k<40 && !b.over; k++){
      for(const u of b.squad()){ if(b.over || !b.able(u)) continue; if(u.weapon.clip && !u.ammo) b.act(u, "reload"); u.weapon.melee ? GS.AI.melee(b, u) : GS.AI.ranged(b, u); }
      b.endTurn(); b.drain();
    }
    assert.ok(b.over, "seed " + seed + " ended");
  }
});

test("campaign: a week turns, research completes, the Gloom spreads", ()=>{
  const C = GS.Campaign, camp = C.create(77);
  assert.strictEqual(camp.roster.length, 6);
  assert.strictEqual(camp.missions.length, 3);
  camp.samples = 20;
  assert.ok(C.startResearch(camp, "rootHymn"));
  const m = camp.missions[0];
  const b = C.launch(camp, m.id, camp.roster.slice(0, 4).map(t=> t.id));
  assert.ok(b && b.squad().length === 4);
  b.gloom().forEach(g=> b.damage(g, 99, { src:b.squad()[0] }));
  assert.strictEqual(b.over, "victory");
  const g0 = camp.regions[m.region].gloom;
  C.resolve(camp, m.id, b.summary());
  assert.strictEqual(camp.week, 2);
  assert.ok(camp.chorus.includes("rootHymn"));
  assert.ok(camp.regions[m.region].gloom <= g0, "the region was cleansed");
  assert.ok(camp.roster[0].xp >= 1);
});

test("campaign: workshop, equip, hire, promote", ()=>{
  const C = GS.Campaign, camp = C.create(5);
  camp.caps = 500;
  assert.ok(C.buy(camp, "mod", "scope"));
  const t = camp.roster[2];
  assert.ok(C.equipMod(camp, t.id, 0, "scope"));
  assert.strictEqual(GS.makeSquadUnit(C.unitSpec(camp, t), camp).weapon.aim, 10);
  assert.ok(C.hire(camp, 0));
  assert.strictEqual(camp.roster.length, 7);
  t.xp = 2; t.pending = 1;
  assert.ok(C.promote(camp, t.id, GS.CLASSES[t.cls].tree[0][1]));
  assert.strictEqual(t.rank, 1);
});
