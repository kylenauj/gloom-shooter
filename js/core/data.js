/* ------------------------------------------------------------------ *
 *  The content: who fights, with what, and what they can learn.
 *
 *  Everything here is data. The rules in battle.js read it, the
 *  campaign reads it, the HUD prints it. Adding a weapon, a spell or a
 *  new kind of spore beast is a table entry, not new code, unless it
 *  needs a new kind of effect.
 * ------------------------------------------------------------------ */
(function(root){
"use strict";
const GS = root.GS;

/* ---- weapons ----------------------------------------------------------
   rangeMods: [up to this many tiles, aim modifier], first match wins.
   ap: what a shot costs. endsTurn: firing spends whatever AP is left
   (the XCOM rule; melee and the lighter guns don't). */
GS.WEAPONS = {
  scattergun: { name:"Scattergun", kind:"shotgun", dmg:[3,5], crit:10, critDmg:2, clip:4, ap:2, endsTurn:true, range:10,
    rangeMods:[[2,30],[4,15],[7,0],[10,-20]], dmgType:"kinetic", fx:"pellets",
    desc:"Packed spore-shot. Brutal up close, useless at the far edge of a clearing." },
  thornblade: { name:"Thornblade", kind:"melee", dmg:[4,6], crit:15, critDmg:2, clip:0, ap:2, endsTurn:false, range:1.5, melee:true,
    aimBonus:15, dmgType:"blade", fx:"slash",
    desc:"A sap-hardened thorn as long as an arm. Strikes ignore cover and never need reloading." },
  needle: { name:"Needle Rifle", kind:"sniper", dmg:[4,6], crit:15, critDmg:3, clip:3, ap:3, endsTurn:true, range:22,
    rangeMods:[[3,-15],[22,5]], dmgType:"kinetic", fx:"needle",
    desc:"Fires a single hardened needle. Slow to aim and fire, but nothing reaches further." },
  wand: { name:"Lantern Wand", kind:"wand", dmg:[2,4], crit:5, critDmg:2, clip:5, ap:2, endsTurn:true, range:12,
    rangeMods:[[4,10],[8,0],[12,-15]], dmgType:"glow", fx:"glowbolt",
    desc:"A caged glowworm on a staff. Its light burns the Gloom straight through armour." },
  repeater: { name:"Bark Repeater", kind:"repeater", dmg:[3,5], crit:5, critDmg:2, clip:5, ap:2, endsTurn:true, range:14,
    rangeMods:[[3,10],[9,0],[14,-10]], dmgType:"kinetic", fx:"burst",
    desc:"A hand-cranked seed gun. Steady at any range, and it carries a lot of ammunition." }
};

/* the three smithing tiers; researching a tier upgrades every gun at once */
GS.WEAPON_TIERS = [
  { name:"Spore",     dmg:0, aim:0,  crit:0 },
  { name:"Amber",     dmg:1, aim:5,  crit:0 },
  { name:"Starlight", dmg:2, aim:10, crit:5 }
];
GS.ARMOR_TIERS = [
  { name:"Bark Weave",   hp:0, armor:0, def:0,  desc:"Woven bark over a padded gill-vest." },
  { name:"Chitin Plate", hp:2, armor:1, def:0,  desc:"Beetle chitin, cured in resin. Turns a claw." },
  { name:"Moonshell",    hp:4, armor:1, def:10, desc:"Pale nacre grown in the moon pools. Light, hard, hard to see." }
];

/* weapon mods: two slots per weapon, built in the Workshop */
GS.MODS = {
  scope:   { name:"Dewlens Scope",    cost:25, aim:10, desc:"+10 aim." },
  drum:    { name:"Seed Drum",        cost:20, clip:2, desc:"+2 ammunition." },
  stock:   { name:"Mycelial Stock",   cost:25, graze:1, desc:"Missed shots still deal 1 damage." },
  capsule: { name:"Spore Capsule",    cost:30, crit:15, desc:"+15 critical chance." }
};

/* ---- statuses ----------------------------------------------------------
   expire "start": gone when the owner's next turn begins (guards, buffs).
   expire "end": counts down at the end of each of the owner's turns.  */
GS.STATUS = {
  poison:     { name:"Spored",     expire:"end",   dot:1, aim:-10, bad:true,  desc:"Takes 1 damage a turn, -10 aim." },
  rooted:     { name:"Rooted",     expire:"end",   noMove:true,    bad:true,  desc:"Cannot move." },
  dazzled:    { name:"Dazzled",    expire:"end",   aim:-20,        bad:true,  desc:"-20 aim." },
  suppressed: { name:"Suppressed", expire:"end",   aim:-30,        bad:true,  desc:"Pinned down: -30 aim." },
  hunkered:   { name:"Hunkered",   expire:"start", def:20, coverMult:2,       desc:"+20 defence, cover counts double." },
  bulwarked:  { name:"Bulwarked",  expire:"start", def:20,                    desc:"Behind a Capguard's shield: +20 defence." },
  sanctuary:  { name:"Sanctuary",  expire:"start", def:30,                    desc:"Wrapped in light: +30 defence." },
  warded:     { name:"Warded",     expire:"start", armor:1,                   desc:"+1 armour." },
  inspired:   { name:"Inspired",   expire:"start", aim:15,                    desc:"+15 aim." },
  blessed:    { name:"Rot-blessed",expire:"end",   dmg:1,                     desc:"+1 damage." }
};

/* ---- abilities -----------------------------------------------------------
   target: enemy | ally | allyOther | self | tile | downed | node | adjacent
   attack: a weapon attack with modifiers (rolls to hit)
   effects: applied without a roll, to the target or to everyone in radius
   ap: number, or "weapon" (what the weapon's shot costs), or "rest"
   friendly: false means area effects spare the caster's own side        */
GS.ABILITIES = {
  /* -- things everyone can do -- */
  fire:      { name:"Fire", icon:"cross", generic:true, target:"enemy", ap:"weapon", attack:{}, ammo:1, hotkey:"1",
               desc:"Shoot (or strike) with the primary weapon." },
  aimed:     { name:"Aimed Shot", icon:"eye", generic:true, target:"enemy", ap:"weapon+1", attack:{aimMod:15}, ammo:1, ranged:true,
               desc:"Take a breath first: one more AP for +15 aim." },
  overwatch: { name:"Overwatch", icon:"watch", generic:true, target:"self", ap:"rest", minAp:2, endsTurn:true, ranged:true,
               desc:"Spend the rest of the turn watching. Fire at the first enemy that moves in sight (-15 aim)." },
  hunker:    { name:"Hunker Down", icon:"shield", generic:true, target:"self", ap:1, endsTurn:true,
               effects:[{t:"status", s:"hunkered", turns:1}], desc:"+20 defence and double cover until your next turn." },
  reload:    { name:"Reload", icon:"reload", generic:true, target:"self", ap:1, desc:"Refill the weapon." },
  overclock: { name:"Overclock", icon:"bolt", generic:true, target:"self", ap:0, lumen:1,
               desc:"Burn 1 Lumen for +1 AP. Once per unit per turn." },
  harvest:   { name:"Harvest Lumen", icon:"gem", generic:true, target:"node", ap:1, range:1.5,
               desc:"Drain an adjacent glow node: +3 Lumen. The Gloom feels it (+1 Tide)." },
  stabilize: { name:"Stabilize", icon:"hand", generic:true, target:"downed", ap:1, range:1.5,
               desc:"Bind a downed ally's wounds. They stop bleeding out." },

  /* -- Capguard -- */
  bulwark:     { name:"Bulwark", icon:"shield", cls:"capguard", target:"self", ap:1, endsTurn:true,
                 effects:[{t:"status", s:"hunkered", turns:1}, {t:"statusAdjacentAllies", s:"bulwarked", turns:1}],
                 desc:"Plant the cap-shield: hunker down, and adjacent allies get +20 defence." },
  pointBlank:  { name:"Point Blank", icon:"cross", cls:"capguard", passive:true, flags:{pointBlank:2}, desc:"+2 damage within 2 tiles." },
  thickCap:    { name:"Thick Cap", icon:"shield", cls:"capguard", passive:true, stats:{hp:2, armor:1}, desc:"+2 HP and +1 armour." },
  riposte:     { name:"Riposte", icon:"watch", cls:"capguard", passive:true, flags:{riposte:true},
                 desc:"Once per enemy turn, fire at any enemy that steps adjacent." },
  bulwarkAura: { name:"Shield Wall", icon:"shield", cls:"capguard", passive:true, flags:{aura:10}, desc:"Adjacent allies always get +10 defence." },
  breach:      { name:"Breaching Blast", icon:"burst", cls:"capguard", target:"enemy", ap:"weapon", attack:{ignoreCover:true, shred:1},
                 ammo:1, cooldown:3, desc:"A shot that ignores cover and strips 1 armour." },
  secondWind:  { name:"Second Wind", icon:"heart", cls:"capguard", passive:true, flags:{secondWind:true},
                 desc:"Once per mission, a killing blow leaves you on 1 HP instead." },

  /* -- Thornblade -- */
  lunge:     { name:"Lunge", icon:"blade", cls:"thornblade", target:"enemy", ap:"weapon", attack:{reach:2.9}, cooldown:2,
               desc:"Strike an enemy up to 2 tiles away without stepping in." },
  bloodsap:  { name:"Bloodsap", icon:"heart", cls:"thornblade", passive:true, flags:{bloodsap:2}, desc:"Melee kills restore 2 HP." },
  fleetfoot: { name:"Fleetfoot", icon:"bolt", cls:"thornblade", passive:true, stats:{mob:1}, desc:"+1 tile of movement per AP." },
  thornWard: { name:"Thorn Ward", icon:"blade", cls:"thornblade", passive:true, flags:{thornWard:true},
               desc:"Once per enemy turn, strike any enemy that steps adjacent." },
  momentum:  { name:"Momentum", icon:"bolt", cls:"thornblade", passive:true, flags:{momentum:1}, desc:"A melee kill refunds 1 AP (once a turn)." },
  whirl:     { name:"Whirling Thorns", icon:"burst", cls:"thornblade", target:"adjacent", ap:2, cooldown:3,
               desc:"Strike every adjacent enemy." },
  execute:   { name:"Execute", icon:"skull", cls:"thornblade", passive:true, flags:{execute:3}, desc:"+3 damage against enemies under half health." },

  /* -- Longcap -- */
  squadsight: { name:"Squadsight", icon:"eye", cls:"longcap", passive:true, flags:{squadsight:true},
                desc:"Can shoot anything the squad can see (-2 aim per tile past own sight)." },
  deadeye:    { name:"Deadeye", icon:"eye", cls:"longcap", target:"enemy", ap:"weapon", attack:{aimMod:-15, dmgMult:1.5}, ammo:1, cooldown:2,
                desc:"-15 aim, +50% damage." },
  steady:     { name:"Steady Cap", icon:"eye", cls:"longcap", passive:true, flags:{steady:true}, desc:"+10 aim and +10 crit if you haven't moved this turn." },
  killZone:   { name:"Kill Zone", icon:"watch", cls:"longcap", passive:true, flags:{owShots:2}, desc:"Overwatch can fire twice." },
  longWatch:  { name:"Long Watch", icon:"watch", cls:"longcap", passive:true, flags:{owNoPenalty:true}, desc:"Overwatch shots take no aim penalty." },
  serial:     { name:"Serial Bloom", icon:"skull", cls:"longcap", passive:true, flags:{serial:true},
                desc:"A kill with the rifle doesn't end the turn, and refunds 2 AP (once a turn)." },
  lumenShot:  { name:"Lumen Shot", icon:"gem", cls:"longcap", target:"enemy", ap:"weapon", lumen:1, attack:{aimMod:20, dmgType:"glow"}, ammo:1, cooldown:1,
                desc:"+20 aim, and the needle burns with light: ignores armour." },

  /* -- Sporecaster -- */
  mend:      { name:"Mend Bloom", icon:"heart", cls:"sporecaster", target:"ally", ap:1, lumen:1, range:6,
               effects:[{t:"heal", n:4}, {t:"cleanse"}], desc:"Heal an ally (or yourself) for 4 and clear their afflictions." },
  rootSnare: { name:"Root Snare", icon:"root", cls:"sporecaster", target:"enemy", ap:2, lumen:1, range:9, los:true,
               effects:[{t:"status", s:"rooted", turns:1}, {t:"damage", dmg:[1,1], dmgType:"glow"}], desc:"Roots burst up round an enemy: it cannot move next turn." },
  glowburst: { name:"Glowburst", icon:"burst", cls:"sporecaster", target:"tile", ap:2, lumen:2, range:10, radius:1.5, friendly:false,
               effects:[{t:"damage", dmg:[3,4], dmgType:"glow"}], desc:"A burst of light: 3-4 damage to every Gloom creature in it. Ignores armour; harmless to the squad." },
  link:      { name:"Mycelial Link", icon:"bolt", cls:"sporecaster", target:"allyOther", ap:1, lumen:1, range:6, cooldown:1,
               effects:[{t:"ap", n:1}], desc:"Lend an ally your strength through the roots: +1 AP." },
  lumenBloom:{ name:"Lumen Bloom", icon:"gem", cls:"sporecaster", passive:true, flags:{lumenBloom:1}, desc:"+1 Lumen at the start of every squad turn." },
  sanctuary: { name:"Sanctuary", icon:"shield", cls:"sporecaster", target:"ally", ap:1, lumen:1, range:8,
               effects:[{t:"status", s:"sanctuary", turns:1}, {t:"cleanse"}], desc:"+30 defence until your next turn, and clear afflictions." },
  starfall:  { name:"Starfall", icon:"star", cls:"sporecaster", target:"tile", ap:2, lumen:3, range:12, radius:2.5, endsTurn:true, cooldown:4, friendly:false,
               effects:[{t:"damage", dmg:[4,6], dmgType:"glow"}], desc:"Call the light down: 4-6 to every Gloom creature in a wide circle." },
  rebirth:   { name:"Rebirth", icon:"heart", cls:"sporecaster", target:"downed", ap:2, lumen:2, range:6, charges:1,
               effects:[{t:"revive"}], desc:"Once a mission: raise a downed ally to half health." },

  /* -- Puffbomber -- */
  mortar:        { name:"Spore Mortar", icon:"burst", cls:"puffbomber", target:"tile", ap:2, endsTurn:true, range:10, radius:1.5, charges:2, lobbed:true,
                   effects:[{t:"damage", dmg:[3,5], dmgType:"blast"}, {t:"destroyCover"}],
                   desc:"Lob a spore bomb anywhere in range: 3-5 to everyone in the blast (allies too). Smashes light cover." },
  heavyOrdnance: { name:"Heavy Ordnance", icon:"burst", cls:"puffbomber", passive:true, flags:{mortarCharges:1}, desc:"+1 mortar shell." },
  shredder:      { name:"Shredder", icon:"cross", cls:"puffbomber", passive:true, flags:{shred:1}, desc:"Repeater hits strip 1 armour." },
  suppress:      { name:"Suppressing Fire", icon:"watch", cls:"puffbomber", target:"enemy", ap:2, endsTurn:true, ammo:2, cooldown:2, los:true, range:14,
                   effects:[{t:"status", s:"suppressed", turns:1}], desc:"Pin an enemy down: -30 aim on its next turn." },
  volatile:      { name:"Volatile Mix", icon:"burst", cls:"puffbomber", passive:true, flags:{mortarDmg:2}, desc:"+2 mortar damage." },
  salvo:         { name:"Salvo", icon:"bolt", cls:"puffbomber", passive:true, flags:{salvo:true}, desc:"The mortar no longer ends your turn." },
  hail:          { name:"Hail of Seeds", icon:"cross", cls:"puffbomber", target:"enemy", ap:"weapon", attack:{guaranteed:true}, ammo:3, cooldown:4,
                   desc:"Empty the drum into one target: a guaranteed hit. Uses 3 ammunition." },

  /* -- the Gloom's -- */
  rotBlessing:  { name:"Rot Blessing", target:"ally", ap:2, range:7, cooldown:2,
                  effects:[{t:"heal", n:2}, {t:"status", s:"blessed", turns:2}], desc:"Heals a Gloom creature and gives it +1 damage." },
  callRotlings: { name:"Call the Brood", target:"self", ap:2, cooldown:3, effects:[{t:"summon", what:"rotling", n:1}], desc:"Summons a rotling." },
  sporeStorm:   { name:"Spore Storm", target:"tile", ap:2, range:10, radius:2, cooldown:2, endsTurn:true, friendly:false,
                  effects:[{t:"damage", dmg:[3,4], dmgType:"spore"}, {t:"status", s:"poison", turns:2}], desc:"A choking cloud of spores." },
  heartSpawn:   { name:"Bud", target:"self", ap:0, cooldown:2, effects:[{t:"summon", what:"rotling", n:1}], desc:"The heart buds a rotling." }
};

/* ---- utility items: one slot per trooper, refilled every mission ---- */
GS.ITEMS = {
  blastcap: { name:"Blastcap", icon:"burst", cost:15, target:"tile", ap:2, range:9, radius:1.5, charges:1,
              effects:[{t:"damage", dmg:[3,4], dmgType:"blast"}, {t:"destroyCover"}], desc:"A thrown puffball bomb: 3-4 in a small blast, smashes light cover." },
  salve:    { name:"Sap Salve", icon:"heart", cost:10, target:"ally", ap:1, range:1.5, charges:2, allowDowned:true,
              effects:[{t:"heal", n:4}, {t:"stabilize"}], desc:"Heal yourself or an adjacent ally for 4 (stabilizes the downed). Two uses." },
  flare:    { name:"Glow Flare", icon:"star", cost:15, target:"tile", ap:1, range:10, radius:2, charges:1, friendly:false,
              effects:[{t:"damage", dmg:[1,2], dmgType:"glow"}, {t:"status", s:"dazzled", turns:1}], desc:"Blinding light: 1-2 damage and -20 aim to Gloom in the burst." }
};

/* ---- the Chorus: once-per-mission squad songs (AdMech's canticles) ---- */
GS.CHORUS = {
  glowHymn: { name:"Hymn of the Lantern", status:"inspired", desc:"Every trooper gets +15 aim this turn." },
  rootHymn: { name:"Hymn of Deep Roots",  status:"warded",   desc:"Every trooper gets +1 armour until your next turn." },
  hushHymn: { name:"Spore Hush",          heal:2, cleanse:true, desc:"Every trooper is cleansed of afflictions and heals 2." }
};

/* ---- the squad's classes --------------------------------------------- */
GS.CLASSES = {
  capguard: { name:"Capguard", role:"Vanguard", hp:7, aim:65, def:5, mob:3, sight:9, weapon:"scattergun",
    base:["bulwark"], tree:[["pointBlank","thickCap"],["riposte","bulwarkAura"],["breach","secondWind"]],
    blurb:"Porcini shock troops. Broad caps, broad shields, and a scattergun for whatever gets too close." },
  thornblade: { name:"Thornblade", role:"Duellist", hp:6, aim:70, def:10, mob:4, sight:9, weapon:"thornblade",
    base:["lunge"], tree:[["bloodsap","fleetfoot"],["thornWard","momentum"],["whirl","execute"]],
    blurb:"Morel duellists. Fast, light, and in among the spores with a thorn before they can spit." },
  longcap: { name:"Longcap", role:"Sharpshooter", hp:5, aim:75, def:0, mob:3, sight:10, weapon:"needle",
    base:["squadsight"], tree:[["deadeye","steady"],["killZone","longWatch"],["serial","lumenShot"]],
    blurb:"Parasol snipers. Tall enough to see over the brambles, patient enough to wait." },
  sporecaster: { name:"Sporecaster", role:"Mystic", hp:5, aim:60, def:10, mob:3, sight:9, weapon:"wand",
    base:["mend","rootSnare"], tree:[["glowburst","link"],["lumenBloom","sanctuary"],["starfall","rebirth"]],
    blurb:"Amanita mystics who spend the squad's Lumen: healing, rooting and burning with light." },
  puffbomber: { name:"Puffbomber", role:"Grenadier", hp:8, aim:60, def:0, mob:3, sight:9, weapon:"repeater",
    base:["mortar"], tree:[["heavyOrdnance","shredder"],["suppress","volatile"],["salvo","hail"]],
    blurb:"Puffball heavies with a seed repeater and a mortar full of spores of their own." }
};
GS.CLASS_ORDER = ["capguard", "thornblade", "longcap", "sporecaster", "puffbomber"];
GS.RANKS = [
  { name:"Sprout",   xp:0 },
  { name:"Gill",     xp:2 },
  { name:"Cap",      xp:5 },
  { name:"Elder",    xp:9 }
];

/* ---- the Gloom -------------------------------------------------------- */
GS.ENEMIES = {
  rotling: { name:"Rotling", hp:4, armor:0, aim:70, def:5, mob:4, ap:4, sight:9, cost:1, samples:1, ai:"melee",
    weapon:{ name:"Rot Claws", kind:"melee", dmg:[2,3], crit:10, critDmg:1, ap:2, endsTurn:true, range:1.5, melee:true, dmgType:"rot", fx:"claw" },
    blurb:"A scuttling knot of rot on spindly claws. Weak alone, never alone." },
  spitter: { name:"Mold Spitter", hp:5, armor:0, aim:65, def:5, mob:3, ap:4, sight:10, cost:2, samples:1, ai:"ranged",
    weapon:{ name:"Acid Spit", kind:"spit", dmg:[2,3], crit:5, critDmg:1, ap:2, endsTurn:true, range:11, rangeMods:[[4,10],[8,0],[11,-15]],
             dmgType:"spore", fx:"acid", onHit:{s:"poison", turns:2} },
    blurb:"A mould-furred sac that spits acid spores. The spores keep eating after they land." },
  bloater: { name:"Bloater", hp:8, armor:0, aim:65, def:0, mob:2, ap:4, sight:8, cost:2, samples:2, ai:"melee",
    weapon:{ name:"Slam", kind:"melee", dmg:[3,4], crit:5, critDmg:1, ap:2, endsTurn:true, range:1.5, melee:true, dmgType:"rot", fx:"claw" },
    deathBurst:{ radius:1.5, dmg:[2,3], status:"poison", turns:2 },
    blurb:"A rotten puffball the size of a cart. Don't pop it next to anyone you like." },
  husk: { name:"Blight Husk", hp:11, armor:1, aim:70, def:0, mob:3, ap:4, sight:9, cost:3, samples:2, ai:"melee",
    weapon:{ name:"Cordyceps Maul", kind:"melee", dmg:[4,5], crit:10, critDmg:2, ap:2, endsTurn:true, range:1.5, melee:true, dmgType:"rot", fx:"claw" },
    blurb:"What's left of a mushroom-folk once the cordyceps has it. Armoured in its own dead cap." },
  shaman: { name:"Gloom Shaman", hp:7, armor:0, aim:65, def:10, mob:3, ap:4, sight:10, cost:3, samples:3, ai:"caster",
    weapon:{ name:"Hex Bolt", kind:"hex", dmg:[2,4], crit:5, critDmg:1, ap:2, endsTurn:true, range:11, rangeMods:[[11,0]], dmgType:"spore", fx:"hex" },
    abilities:["rotBlessing", "callRotlings"],
    blurb:"A hooded thing hung with spore sacs. It heals its brood, and calls more." },
  sporelord: { name:"The Sporelord", hp:26, armor:2, aim:75, def:5, mob:3, ap:4, sight:12, cost:10, samples:10, ai:"boss", boss:true,
    weapon:{ name:"Crown Maul", kind:"melee", dmg:[5,7], crit:10, critDmg:2, ap:2, endsTurn:true, range:1.5, melee:true, dmgType:"rot", fx:"claw" },
    abilities:["sporeStorm", "callRotlings"],
    blurb:"The thing at the root of the Gloom. Every spore in the forest answers to it." },
  heart: { name:"Gloom Heart", hp:18, armor:1, aim:0, def:0, mob:0, ap:0, sight:6, cost:0, samples:5, ai:"heart", structure:true,
    weapon:null, abilities:["heartSpawn"],
    blurb:"A beating knot of corrupted mycelium. It buds new rot every other turn until it's burned out." }
};

/* ---- recruits: names, and the quirks that make each one theirs (Jagged Alliance) ---- */
GS.NAMES = {
  first:["Pip","Moss","Fen","Bram","Wick","Tansy","Juniper","Bolete","Inky","Russ","Enoki","Truff","Chanter","Puck","Sorrel",
         "Burdock","Lumi","Glimmer","Thistle","Nettle","Clover","Tuck","Sage","Hob","Wren","Bracken","Quill","Dewey","Myra","Oona"],
  last:["Porcini","Morelson","Capwell","Inkcap","Puffwood","Gillmore","Sporrow","Hollowstem","Brightgill","Rootling",
        "Mycel","Shaggymane","Chanterelle","Fairyring","Stinkhorn","Lanternjaw","Bracketfoot","Velvetshank"]
};
GS.QUIRKS = {
  steady:     { name:"Steady",       aim:5,   desc:"+5 aim." },
  hardy:      { name:"Hardy",        hp:1,    desc:"+1 HP." },
  nimble:     { name:"Nimble",       def:5,   desc:"+5 defence." },
  glowtouched:{ name:"Glow-touched", lumen:1, desc:"+1 Lumen when the mission starts." },
  greedy:     { name:"Greedy",       wage:3,  aim:5, desc:"+5 aim, but wants 3 more caps a week." },
  veteran:    { name:"Old Root",     xp:2, wage:2, desc:"Starts with experience; wants 2 more a week." },
  jumpy:      { name:"Jumpy",        def:5, aim:-5, desc:"+5 defence, -5 aim." }
};

/* ---- the Hollow's research (XCOM's labs) ---- */
GS.RESEARCH = {
  amber:     { name:"Amber Resin Smithing", weeks:2, samples:6,  desc:"Every weapon to the Amber tier: +1 damage, +5 aim.", unlock:{weaponTier:1} },
  chitin:    { name:"Chitin Plating",       weeks:2, samples:6,  desc:"Chitin Plate for the squad: +2 HP, +1 armour.", unlock:{armorTier:1} },
  starlight: { name:"Starlight Forging",    weeks:3, samples:12, req:["amber"],  desc:"Starlight weapons: +2 damage, +10 aim, +5 crit.", unlock:{weaponTier:2} },
  moonshell: { name:"Moonshell Carapace",   weeks:3, samples:12, req:["chitin"], desc:"Moonshell armour: +4 HP, +1 armour, +10 defence.", unlock:{armorTier:2} },
  rootHymn:  { name:"Hymn of Deep Roots",   weeks:1, samples:3,  desc:"A new Chorus song: +1 armour to the whole squad.", unlock:{chorus:"rootHymn"} },
  hushHymn:  { name:"Spore Hush",           weeks:1, samples:4,  desc:"A new Chorus song: cleanse and heal the whole squad.", unlock:{chorus:"hushHymn"} },
  wells:     { name:"Deep Lumen Wells",     weeks:2, samples:5,  desc:"Start every mission with +2 Lumen.", unlock:{lumenStart:2} },
  fifthCap:  { name:"The Fifth Cap",        weeks:2, samples:8,  desc:"Deploy five troopers instead of four.", unlock:{squadSize:5} },
  anatomy:   { name:"Rot Anatomy",          weeks:1, samples:4,  desc:"+10 crit chance against the Gloom.", unlock:{critVsGloom:10} },
  trail:     { name:"Trail of the Sporelord", weeks:3, samples:10, req:["amber", "chitin"], hearts:2,
               desc:"Follow the rot to its root. Unlocks the assault on the Sporelord's Crown.", unlock:{finale:true} }
};

/* ---- the forest the war is fought over (Jagged Alliance's sectors) ---- */
GS.REGIONS = [
  { id:"hollow",  name:"Glowcap Hollow",  x:0.50, y:0.78, home:true,  links:["mossdeep","lantern","rotfen"] },
  { id:"mossdeep",name:"Mossdeep",        x:0.22, y:0.62, links:["hollow","ashcap","rotfen"] },
  { id:"lantern", name:"Lantern Falls",   x:0.78, y:0.60, links:["hollow","under","ashcap"] },
  { id:"rotfen",  name:"Rotfen Mire",     x:0.34, y:0.40, links:["hollow","mossdeep","ashcap","under"] },
  { id:"ashcap",  name:"Ashcap Ridge",    x:0.62, y:0.36, links:["mossdeep","lantern","rotfen","crown"] },
  { id:"under",   name:"The Under-Root",  x:0.84, y:0.24, links:["lantern","rotfen","crown"] },
  { id:"crown",   name:"Sporelord's Crown", x:0.46, y:0.12, links:["ashcap","under"], finale:true }
];

GS.MISSION_TYPES = {
  purge: { name:"Purge", desc:"Kill every Gloom creature in the clearing." },
  heart: { name:"Burn the Heart", desc:"Destroy the Gloom Heart. It buds a new rotling every other turn." },
  finale:{ name:"The Crown", desc:"Kill the Sporelord." }
};

/* the Gloom Tide: AdMech's Awakening, XCOM's timer. Thresholds and what they do */
GS.TIDE = { max:12, steps:[
  { at:3,  name:"The Gloom Stirs", effect:"aim",   desc:"Gloom creatures get +10 aim." },
  { at:6,  name:"Spore Fall",      effect:"wave",  desc:"A spore pod lands: reinforcements." },
  { at:9,  name:"The Rot Rises",   effect:"wave+", desc:"More reinforcements, and Gloom creatures deal +1 damage." },
  { at:12, name:"Gloom Bloom",     effect:"bloom", desc:"Reinforcements every other turn until the end." }
]};

})(typeof window !== "undefined" ? window : globalThis);
