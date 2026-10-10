# Gloom Shooter — Design

A mushroom-themed, turn-based squad tactics game. The Wardens of Glowcap Hollow, an army of mushroom-folk, hold back **the Gloom**: rot, mould and cordyceps spore beasts spreading through a glowing night forest.

This document does two things:

1. It breaks down the three reference games (XCOM 2, Warhammer 40K: Mechanicus, Jagged Alliance) into their structure and core mechanics.
2. It specifies the **base model** built from them: what Gloom Shooter takes from each, how the rules work, and where each rule lives in the code.

---

## 1. The three references

All three share one skeleton: a **strategic layer** where you manage a roster, an economy and a growing threat, wrapped around a **tactical layer** of turn-based squad battles on a grid. Where they differ is in what's scarce, and in what makes a turn tense.

### 1.1 XCOM 2 (Firaxis, 2016)

**Structure**
- *Strategic:* the Avenger (a mobile base). Research (Labs) unlocks tech, Engineering builds items, Barracks promote soldiers. A world map of regions, with resistance contacts and income.
- *Doom clock:* the Avatar Project. Ignore it and you lose the campaign.
- *Mission choice:* Guerrilla Ops offer two or three missions and you fly one; the others carry a penalty (Dark Events).

**Tactical mechanics**
- **Two-action turns.** Move+move ("dash") or move+shoot. Firing most weapons ends the turn. The move range is shown blue (you can still act after) or yellow (dash).
- **Cover:** half (-20 to be hit) or full (-40), directional. **Flanking** removes cover and adds about +40% crit chance.
- **Transparent hit chance**, with a full breakdown of the sum (aim, range, cover, height, defence).
- **High ground** gives +20 aim. Destructible environment: explosives strip cover.
- **Overwatch:** a reaction shot at reduced aim against anything that moves.
- **Concealment and pods.** The squad starts hidden. Enemies wait in groups ("pods") that activate together and get a free "scamper" move to cover. This enables ambush setups.
- **Turn timers** on many missions; reinforcements dropped from the sky.
- **Classes with branching trees:** one of two skills per rank. Permadeath, wounds, and "bleeding out" for downed soldiers.

**What makes it tense:** probability you can read, and positional risk (flanks). The timer pushes you forward.

### 1.2 Warhammer 40,000: Mechanicus (Bulwark, 2018)

**Structure**
- *Strategic:* the Ark Mechanicus. Tech-Priests are upgraded through skill trees (Doctrines), and Canticles are chosen per mission.
- *Doom clock:* the planetwide **Awakening** meter. The Necrons wake as you dawdle or make noise.
- *Exploration:* node-based tomb exploration between fights, where choices raise or lower the Awakening.

**Tactical mechanics**
- **Cognition Points (CP):** a squad-wide shared resource. It is gained by interacting with objects (obelisks), certain kills and abilities. It is spent on powerful weapons, abilities, and **extra movement**. This one resource creates most of the decisions.
- **Low RNG:** many attacks hit reliably and damage is a narrow range. Tension comes from economy and positioning, not dice.
- **Movement is cheap; actions are what you spend.** Extra movement costs CP.
- **Canticles:** once-per-mission global buffs, fired at the moment you choose.
- **Awakening inside a battle:** the longer the fight, the more Necrons arrive.
- Character-defining **loadouts** (augments, weapons) instead of fixed classes.

**What makes it tense:** resource economy. Do you burn Cognition now, or bank it for the big turn?

### 1.3 Jagged Alliance (2, and 3 in 2023)

**Structure**
- *Strategic:* a **sector map** of a country. You take mines (income), train militia to hold ground, and travel in real time.
- *Mercenaries:* **hired** individuals with personalities, likes and dislikes, a contract fee and **daily wages**. Run out of money and they leave.
- *Doom pressure* is softer: the enemy army counter-attacks and retakes sectors.

**Tactical mechanics**
- **Action Point pool** (JA2: about 20-25 AP per merc). Every step, crouch, aim click, reload and shot has a cost. Firing doesn't end your turn: you spend until you're out.
- **Aimed shots:** spend extra AP for more accuracy. **Called shots** to head, torso or legs. **Stances:** stand, crouch, prone.
- **Interrupts:** a free reaction for whoever spots someone first.
- **Inventory:** ammo, weapon mods, consumables. Morale, suppression, bleeding.
- Experience improves individual stats through use.

**What makes it tense:** fine-grained AP budgeting, and the economic grind of keeping a team paid.

### 1.4 Side by side

| Pillar | XCOM 2 | Mechanicus | Jagged Alliance |
|---|---|---|---|
| Action economy | 2 actions; firing ends turn | AP plus a shared CP pool | Big AP pool, everything costs |
| Accuracy | Visible % with breakdown | Mostly reliable hits | % with aim-AP spending |
| Defence | Directional cover, flanks | Cover-light, positioning | Stances, cover, interrupts |
| Squad resource | — | **Cognition** (shared) | Ammo, consumables |
| In-mission clock | Turn timers, reinforcements | **Awakening** escalations | Enemy reinforcements |
| Once-per-mission | — | **Canticles** | — |
| Roster | Classes, branching trees | Priests, Doctrines, augments | **Hired mercs**, wages, personalities |
| Campaign clock | Avatar Project | Awakening meter | Enemy counter-offensive |
| Map | Regions + mission choice | Tomb nodes | **Sector map** with income |

---

## 2. Gloom Shooter: the synthesis

Each pillar takes the strongest idea from one game and keeps the others from fighting it.

| Mechanic | From | In Gloom Shooter | Code |
|---|---|---|---|
| **4 AP per turn, strides of movement** | JA's AP pool + XCOM's 2-action readability | Each warden has 4 AP. 1 AP buys one "stride" (mobility tiles). Shots cost 2–3 AP. The blue/amber range shows whether you can still shoot after moving. | `battle.js` `move`, `apCost` |
| **Firing ends the turn (mostly)** | XCOM | Guns have `endsTurn`. The Thornblade's melee and the items don't, so they're the flexible picks. | `data.js` `WEAPONS` |
| **Aimed Shot** | JA | +1 AP for +15 aim. | `ABILITIES.aimed` |
| **Directional cover, flanks, high ground** | XCOM | Half -20 / full -40. Cover is checked per cardinal side against the shooter. Exposed means +40 crit. Rock shelves give +10 aim. | `grid.js` `coverAgainst`, `battle.js` `hitInfo` |
| **Step-out line of sight** | XCOM | A unit tucked beside full cover leans out round it. | `grid.js` `canSee` |
| **Transparent to-hit** | XCOM | The HUD prints every line of the sum. The AI reads the same sum, no hidden dice. | `hitInfo` → `hud.js` |
| **Overwatch** | XCOM (JA's interrupts) | -15 aim, triggers per tile stepped. Kill Zone and Long Watch modify it. Melee reactions: Thorn Ward. Shotgun reactions: Riposte. | `battle.js` `reactions` |
| **Concealment, pods, scamper** | XCOM | The squad starts unseen. Pods notice a warden within 3.5 tiles. Once revealed, any pod that sees you wakes and scrambles for cover, through your overwatch. | `detect`, `activatePod`, `AI.scamper` |
| **Lumen (shared resource)** | Mechanicus' Cognition | Squad-wide, max 10. +1 per kill, +3 per glow node. It pays for spells and **Overclock** (+1 AP), the Mechanicus "buy extra movement" lever. | `gainLumen`, `ABILITIES.overclock` |
| **Gloom Tide (in-mission doom)** | Mechanicus' Awakening + XCOM's timers | Rises every round, and when you harvest. At 3: +10 enemy aim. At 6 and 9: spore-pod reinforcements (and +1 damage at 9). At 12: waves every other turn. | `raiseTide`, `GS.TIDE` |
| **Harvest risk/reward** | Mechanicus' obelisks | Draining a glow node pays 3 Lumen and costs 1 Tide. | `act("harvest")` |
| **The Chorus** | Mechanicus' Canticles | Once-per-mission squad songs: +15 aim, +1 armour, or cleanse+heal. Free to use. Research unlocks more. | `GS.CHORUS`, `sing` |
| **Narrow damage ranges, armour pips** | Mechanicus, XCOM 2 | Damage is a small range. Armour subtracts flat. Light ("glow") damage ignores it. | `hitInfo`, `damage` |
| **Classes + one-of-two promotions** | XCOM | 5 classes × 3 ranks × 2 choices. | `CLASSES[].tree`, `Campaign.promote` |
| **Bleeding out** | XCOM | 70% of "deaths" are downed instead, with 3 turns to stabilize. | `damage` |
| **Weekly mission choice, ignored regions rot** | XCOM Guerrilla Ops | 3 missions a week. The ones you skip add +1 Gloom to their region. | `Campaign.resolve` |
| **Sector map with income** | JA | 7 regions. Each safe region (Gloom ≤1) adds 8 caps a week of glowfarm income. | `Campaign.income` |
| **Hired troops, wages, quirks** | JA | Recruits cost a fee and a weekly wage, and carry quirks (Steady, Greedy, Old Root…). Broke? The dearest warden walks out. | `QUIRKS`, `advanceWeek` |
| **Research / Workshop** | XCOM Labs + Engineering | Samples (from kills) fund research: weapon and armour tiers squad-wide, Chorus songs, squad size, Lumen wells. Caps fund mods (2 slots) and items (1 slot). | `RESEARCH`, `MODS`, `ITEMS` |
| **Campaign doom** | XCOM Avatar + JA counter-attacks | The Gloom spreads each week from regions at ≥3. You lose if the Hollow reaches 5 or the forest totals 27. | `advanceWeek` |

### Deliberately left out of the base model (for now)

These are good mechanics, but they would complicate the base before it's proven:

- **JA:** called shots, stances, morale, a full inventory and ammo types.
- **Mechanicus:** tomb exploration between fights.
- **XCOM:** the Chosen and covert ops.

See the roadmap (section 8).

---

## 3. The loops

```
CAMPAIGN (one week per turn)
  Hollow ─► pick 1 of 3 missions ─► deploy 4 (5 with research) ─► BATTLE
     ▲                                                              │
     └── results: XP, wounds, deaths, samples, caps ◄───────────────┘
         skipped missions: +1 Gloom in those regions
         week ticks: income − wages, research +1 week, wounds heal,
                     the Gloom spreads, new missions & recruits

BATTLE (one round = squad turn + Gloom turn)
  squad turn: each warden spends 4 AP (move strides, shoot, cast, harvest)
              + any Chorus song, any time
  Gloom turn: dormant pods wander; active Gloom moves and attacks (AI)
  end of round: Gloom Tide +1 → thresholds → reinforcements
```

---

## 4. Tactical rules (the spec the code implements)

**Grid.** 22×22 tiles; one tile is 2 world units. Moving costs 1 per straight step and 1.5 per diagonal, +1 to step up or down a rock shelf. You can't cut corners past anything solid.

**AP.** Max 4. Moving costs `ceil(path cost ÷ mobility)` AP. Rooted units can't move.

**To hit** (clamped to 5–100; "guaranteed" abilities are 100):

```
aim + weapon tier/mods aim + status aim (+10 tide aim for Gloom)
+ melee bonus (+15)                      | melee ignores cover
+ range bracket (per weapon)
+ ability aim (+15 aimed, −15 overwatch, −15 deadeye, +20 lumen shot)
+10 high ground, +10 Steady Cap (didn't move)
−2 per tile past own sight (Squadsight)
− target defence (+ statuses + Shield Wall aura)
− cover: 20 half / 40 full, ×2 if hunkered
```

**Crit.** Weapon crit (+mods), +40 if the target is exposed (no applicable cover), +research bonus against the Gloom. A crit adds the weapon's `critDmg`.

**Damage.** Roll in range, add crit and bonuses (Point Blank, Execute, Rot-blessed, Tide), multiply (Deadeye ×1.5), then subtract armour. "Glow" (light) damage ignores armour. Shredding strips armour. A Mycelial Stock makes misses graze for 1.

**Statuses.** `start` statuses (hunkered, bulwarked, sanctuary, warded, inspired) last until the owner's next turn. `end` statuses (poison, rooted, dazzled, suppressed, blessed) count down at the end of the owner's turns. Poison deals 1 a turn and gives -10 aim. Rot tiles poison wardens who step in.

**Death.** A warden at 0 HP is downed 70% of the time, with 3 turns of bleeding before death. Stabilize (1 AP, adjacent), Sap Salve, or Rebirth saves them. Victory recovers every downed warden; defeat or retreat leaves them behind.

**Objectives.** *Purge:* kill everything (reinforcements included). *Burn the Heart:* destroy a structure that buds a rotling every 2 turns. *The Crown:* kill the Sporelord.

---

## 5. The cast

### Wardens (the squad)

| Class | Species | Role | Weapon | Base | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|---|---|---|---|
| Capguard | Porcini | Vanguard | Scattergun (close range) | Bulwark | Point Blank / Thick Cap | Riposte / Shield Wall | Breaching Blast / Second Wind |
| Thornblade | Morel | Duellist | Thornblade (melee, no end-turn) | Lunge | Bloodsap / Fleetfoot | Thorn Ward / Momentum | Whirling Thorns / Execute |
| Longcap | Parasol | Sharpshooter | Needle Rifle (3 AP, range 22) | Squadsight | Deadeye / Steady Cap | Kill Zone / Long Watch | Serial Bloom / Lumen Shot |
| Sporecaster | Amanita | Mystic | Lantern Wand (glow) | Mend Bloom, Root Snare | Glowburst / Mycelial Link | Lumen Bloom / Sanctuary | Starfall / Rebirth |
| Puffbomber | Puffball | Grenadier | Bark Repeater + Spore Mortar | Spore Mortar | Heavy Ordnance / Shredder | Suppression / Volatile Mix | Salvo / Hail of Seeds |

### The Gloom (bad spores)

| Creature | Role | Notes |
|---|---|---|
| Rotling | Swarm melee | Fast, weak, never alone |
| Mold Spitter | Ranged | Acid spit poisons; overwatches when it has no shot |
| Bloater | Slow melee | Bursts in a poison cloud when killed: don't pop it next to friends |
| Blight Husk | Armoured melee | A cordyceps-taken mushroom-folk, 1 armour |
| Gloom Shaman | Caster | Rot Blessing (heal, +1 dmg), Call the Brood (summon) |
| Gloom Heart | Objective | Buds rotlings every 2 turns |
| The Sporelord | Boss | Spore Storm (AoE poison), summons, crown maul |

---

## 6. Strategic layer

- **Resources:** **caps** (wages, hiring, Workshop) and **spore samples** (research, from kills and mission rewards).
- **Weekly turn:** income `25 + 8 × safe regions`, minus wages; research advances; wounds heal; the Gloom spreads (1 + week÷4 times) from regions at ≥3 into neighbours; new missions and recruits.
- **Mission threat:** `1 + 0.8 × region Gloom + week÷3`, capped at 8. This sets pod count (2–4), each pod's enemy budget, and the enemy mix.
- **Research tree:**
  - Amber → Starlight (weapons); Chitin → Moonshell (armour).
  - Chorus songs, Deep Lumen Wells, the Fifth Cap (squad of 5), Rot Anatomy (+crit).
  - Trail of the Sporelord: needs both tier-2 projects and 2 Hearts burned. It unlocks the finale.
- **Win:** kill the Sporelord at the Crown.
- **Lose:** the Hollow reaches Gloom 5, the forest totals 27, or no wardens and no money.

---

## 7. Built on Pine Hollow Rally's assets

The visual and audio kit comes straight from *Pine Hollow Rally*'s techniques (the original file is in `reference/`):

| Pine Hollow asset / technique | Reused as |
|---|---|
| **Glowcap Hollow** track: glowing caps, additive halos, ground glow pools, glowworm threads, crystal clusters, blue palette | Giant glowcaps (full cover), border forest, crystal (half cover) and glow nodes — `world.js`, `kit.js` |
| Neon roadside mushrooms (Gator Gulch) | Mushroom clusters (half cover) and the babies round each giant |
| Spore and glowbug point shaders (`uTime`-driven drift and blink) | Ambient spores, glowbugs, the Gloom's miasma — `K.motes` |
| Shelf fungus, lumpy boulders, bushes | Logs with glowing brackets, boulders, stumps |
| **Bigfoot**: faceted lumps with per-corner hash, jointed groups, hair tufts | Every warden and Gloom creature — `models.js` |
| Ground painted in the shader in world space (the road) | The clearing: moss, mycelium threads, glow specks, rot veins, tile grid, fog of war |
| Shadow box that follows the camera | Moonlight shadow following the tactics camera |
| Synthesised audio: compressor buses, noise bursts, sequenced chiptune loop | All SFX and the D-minor score — `audio.js` |
| Front end: Saira fonts, slanted plates, hard ink shadows, programme layout | All menus and the HUD — `style.css` |
| three.js r128 | Same build, vendored in `vendor/` |

---

## 8. Architecture

```
index.html          loads everything in order (no build step; works from any static server)
js/core/            the rules — no THREE, no DOM, runs under Node
  core.js           namespace, seeded RNG, emitter
  data.js           ALL content: weapons, tiers, mods, statuses, abilities, classes, enemies, research, regions, tide
  grid.js           map generation, pathfinding (Dijkstra), line of sight with step-out, cover
  battle.js         the battle state machine; every action resolves instantly and appends events
  ai.js             the Gloom's turn (utility scoring of tiles; same to-hit maths as the HUD)
  campaign.js       weeks, regions, missions, research, workshop, hiring, promotion, save/load
js/render/          three.js
  kit.js            the Pine Hollow asset kit (lumps, glow, motes, halos, cap shader with dithered cut-away)
  stage.js          renderer, night sky, moon, the tactics camera rig
  world.js          builds a battlefield from a map
  models.js         the wardens and the Gloom; portraits
  fx.js             sparks, projectiles, rings, floating text
  view.js           plays battle events back as animation; input; XCOM overlays
js/ui/              DOM: hud.js (battle), menus.js (everything else)
js/main.js          app flow
tests/              node --test (rules + campaign), balance.js (AI vs AI sweeps)
```

**The key decision: logic resolves, the view replays.** `Battle` never waits on animation. Each action resolves every consequence immediately: moves, overwatch interrupts, deaths, pod activations, Tide reinforcements. It records them as an ordered event list (`step`, `attack`, `damage`, `death`, `aoe`, `vis`, …). `BattleView.pump()` drains that list and plays it back.

That's why the rules are fully testable headless, the AI can search freely, and a future replay, network or undo system has a natural seam.

**Content is data.** A new weapon, status, ability, enemy or research project is a table entry in `data.js`. New behaviour only needs code if it introduces a new *effect type* (`applyEffects`) or a new *passive flag* (read in `hitInfo` or `reactions`).

---

## 9. Quality: the ghost

Quality is kept up by an automated playtester and an AI agent that acts on what it finds. See `tools/ghost/`, `.claude/skills/ghost-audit/SKILL.md` and the README.

The ghost found and helped fix these in its first runs:

- **Teleporting.** A patrolling unit woken by overwatch mid-move scrambled for cover, then finished its old path from its new spot.
- **Enemy inside the Heart.** A pod member could spawn on the Gloom Heart's tile.
- **Phantom ability buttons.** Ally spells (Rebirth) lit up with no one to target.
- **Out-of-order events.** A winning blast's after-effects played after the VICTORY banner.
- **Stale number keys.** A key pressed right after switching wardens fired the previous warden's ability.
- **Rigged campaign.** Defeat was all but certain (the Gloom grew ~3 a week even while winning every fight). Rookies faced threat 3–4 in week one. The Hollow could be lost with no warning or chance to defend it.
- **HUD layout.** Panels overlapped on laptop and phone screens.

## 10. Roadmap

1. **Called shots and stances** (JA): head/legs shots that trade aim for effects; crouch for +def.
2. **Morale and panic** (JA, XCOM): troopers seeing allies fall can panic.
3. **Exploration nodes** between missions (Mechanicus): choose paths through a region, trading Tide for rewards.
4. **More objectives:** rescue a captured warden, escort a lantern-bearer, hold the node, and evac zones.
5. **Militia** (JA): train glowfarm guards so liberated regions resist Gloom spread.
6. **More of the Gloom:** flying spore moths, burrowing mycelium tendrils, a Chosen-style nemesis who learns.
7. **Destructible elevation:** blast a rock shelf away; giant caps that topple into cover lines.
8. **Mid-battle save/resume:** the event model makes this a serialization job.
9. **Balance pass with real play data:** `npm run balance` gives AI-vs-AI baselines; humans should beat them.
