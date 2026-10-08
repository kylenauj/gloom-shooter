/* AI against AI, many seeds: a quick read on how hard each threat level is
   for a squad of a given rank and kit. The squad is driven by the same AI
   as the Gloom (no spells, no items, no concealment tricks), so a human
   should do noticeably better than these numbers.  `npm run balance` */
const GS = require("./load.js");
function run(rank, tier, threat, N){
  let wins = 0, rounds = 0, dead = 0;
  for(let seed=1; seed<=N; seed++){
    const squad = GS.CLASS_ORDER.slice(0, 4).map(c=> GS.makeSquadUnit({ cls:c, rank, picks:GS.CLASSES[c].tree.slice(0, rank).map(p=> p[0]) }, { weaponTier:tier, armorTier:tier }));
    const b = GS.setupBattle({ seed, type:seed % 3 === 0 ? "heart" : "purge", threat, squad });
    for(let k=0; k<40 && !b.over; k++){
      for(const u of b.squad()){ if(b.over || !b.able(u)) continue; if(u.weapon.clip && !u.ammo) b.act(u, "reload"); u.weapon.melee ? GS.AI.melee(b, u) : GS.AI.ranged(b, u); }
      b.endTurn(); b.drain();
    }
    if(b.over === "victory") wins++;
    rounds += b.round; dead += b.summary().troops.filter(t=> t.fate === "dead" || t.fate === "lost").length;
  }
  console.log(`rank ${rank} tier ${tier} vs threat ${threat}: won ${wins}/${N}, ${(rounds/N).toFixed(1)} rounds, ${(dead/N).toFixed(2)} dead a mission`);
}
[[0,0,1],[0,0,2],[1,0,3],[1,1,4],[2,1,5],[3,2,7],[3,2,8]].forEach(([r, t, th])=> run(r, t, th, 30));
