# Gloom Shooter backlog

_Last scouted: 2026-10-10 · ghost score 100/100 · commit bf18ca7 · 683 battles, 12 campaigns, browser pass at 4 screen sizes_

Tick `[x]` the items to build, then ask for **"ghost fix"**. The ghost builds only ticked items, at most three per run, each tested and re-checked.

The rules engine came out clean (no crashes, softlocks, desyncs or illegal moves in 683 battles), so this backlog is about how the game **plays and reads**.

## Bugs

- [ ] **B1 · On touch screens, some abilities fire on the first tap and can end your turn.** Impact: high · effort: S
  - Evidence:
    - Hunker, Bulwark, Overwatch, Reload, Overclock and Whirling Thorns run the instant their button is touched (`js/render/view.js:151`).
    - Three of them end the turn.
    - Touch has no hover, so the description never shows, and on a portrait phone the description line is hidden entirely (`css/style.css`, `.h-desc{display:none}`).
  - Change: on touch, the first tap selects the ability and shows its description with a "Tap again to use" prompt; the second tap uses it. Same pattern targeting already uses.

- [ ] **B2 · Reloading the page mid-mission lets you replay it.** Impact: med · effort: S
  - Evidence: nothing is saved when a mission launches (`js/main.js`, `app.launch`). Refresh during a losing battle, press Continue, and the same mission waits, same seed and all.
  - Change: save "mission in progress" at launch. On Continue, treat an abandoned mission as a retreat (its region rots, the squad comes home wounded). A mid-battle save can replace this later.

- [ ] **B3 · The VICTORY banner sits over the results screen.** Impact: low · effort: S
  - Evidence: `audit/shots/results.png` shows the banner on top of the trooper cards. It may only be the banner's 0.25 s fade, so verify first.
  - Change: hide the banner instantly when a full screen opens.

## Feel & clarity

- [ ] **F1 · The Gloom explains nothing in battle.** Impact: high · effort: S
  - Evidence:
    - Every creature has a description in `data.js` ("Don't pop it next to anyone you like"), but they only appear in menus, never in battle.
    - Nothing warns that a Bloater bursts in poison, that a Shaman summons, or what a Husk's armour means.
    - The target panel shows HP and armour only (`audit/shots/battle-aim.png`).
  - Change:
    - Add the creature's weapon, specials and one-line description to the target panel.
    - Pop a "New Gloom sighted" card the first time each type is seen in a campaign.

- [ ] **F2 · Phone landscape: the HUD covers most of the battlefield.** Impact: high · effort: M
  - Evidence: `audit/shots/battle-phone-landscape.png`. The unit card and ability bar fill the middle third and the meters sit over the field, leaving the squad barely visible.
  - Change: on short screens:
    - collapse the unit card into a one-line strip (name, HP, AP);
    - move the ability bar to a vertical rail on the right;
    - shrink the meters into the top bar.

- [ ] **F3 · Concealment breaks before you can plan an ambush.** Impact: med · effort: M
  - Evidence: the ghost found 69% of reveals were the squad being *spotted*, not springing an ambush. There's no way to see how close is too close.
  - Change: while concealed, tint the tiles within a pod's detection radius (XCOM's red tiles), and warn when a planned path crosses them.

- [ ] **F4 · Giant caps near the camera blot out the screen corners, and the cut-away looks like static.** Impact: med · effort: M
  - Evidence: `audit/shots/battle-aim.png`. Huge unfaded caps fill the bottom-left and the edges, and the dithered cut-away round the selected Longcap reads as noise.
  - Change: fade caps by how close they are to the camera and to any unit on screen, with a smooth alpha fade instead of dithering. Draw a silhouette outline for units hidden behind props.

- [ ] **F5 · The objective isn't marked.** Impact: med · effort: S
  - Evidence: in Burn the Heart, the Heart only appears once a warden has seen its tile (`battle.js`, `refreshVision`), so the first turns are a blind search.
  - Change: mark the objective on the ground from the start, with an arrow at the screen edge when it's off-screen.

- [ ] **F6 · The Chorus buttons are three identical music notes.** Impact: med · effort: S
  - Evidence: `audit/shots/battle-mid.png`, top right. The song names live only in hover titles, which touch players never see.
  - Change: one icon per song (lantern, roots, hush), the song's name on tap or hover, and a used state that reads clearly.

- [ ] **F7 · No first-mission guidance.** Impact: med · effort: M
  - Evidence: a new player meets ten unlabeled ability icons (`audit/shots/battle-mid.png`); the help lives in a menu page.
  - Change: the campaign's first mission shows five contextual tips, one at a time: move and the blue/amber range, cover shields, fire and the hit breakdown, overwatch, end turn. Skippable, and shown once.

- [ ] **F8 · The results screen is thin.** Impact: low · effort: S
  - Evidence: `audit/shots/results.png` shows kills, XP and HP only. No caps or samples earned, no "ready to promote", and it says "1 rounds".
  - Change:
    - Show the rewards and the Gloom change in the region.
    - Flag promotions.
    - Name an MVP.
    - Fix the plural.

- [ ] **F9 · Mission intel on the deploy screen.** Impact: low · effort: S
  - Evidence: `audit/shots/deploy.png` says only "Threat 1".
  - Change: list the creature types expected (from the threat pool) and the map's notable features (rot, rock shelves, glow nodes), so the squad pick is a decision.

## Balance & pacing

- [ ] **P1 · Campaigns snowball: they're decided in the first weeks.** Impact: high · effort: M
  - Evidence: of 12 ghost campaigns, 6 were flawless 21–0 wins and 4 were defeats within 16 weeks. Battle balance per threat is healthy (86–97% wins for the smart ghost at every threat), so the problem is the campaign's shape.
  - Change:
    - **Pressure for strong squads:** a Gloom counter-offensive every few weeks that attacks a cleansed region, or a recurring Sporelord lieutenant.
    - **Catch-up for struggling ones:** cheaper rookies after a defeat, and a rescue mission to recover a downed warden.

- [ ] **P2 · Battles are short (5.8 rounds on average).** Impact: low · effort: M
  - Evidence: ghost battle averages. The Tide rarely gets past "The Gloom Stirs".
  - Change: a mid-battle twist on some missions, such as a second objective, a timed spore-pod landing, or an evac zone that opens after the main goal.

## Content & depth

- [ ] **C1 · A small roster of Gloom (5 regular types).** Impact: med · effort: L
  - Evidence: `GS.ENEMIES`. By week 10 a player has seen everything.
  - Change: three creatures that ask new questions:
    - a spore moth that flies over cover;
    - a burrowing mycelium tendril that surfaces behind the line;
    - a rot totem that buffs and heals nearby Gloom until it's destroyed.

- [ ] **C2 · Only two mission types (plus the finale).** Impact: med · effort: L
  - Evidence: `GS.MISSION_TYPES` has Purge and Burn the Heart.
  - Change: Rescue (a captured warden, with a timer), Hold the Node (survive N rounds on a glow node), and Escort (a lantern-bearer to an exit). All three are already on the roadmap in `docs/DESIGN.md`.

## Done

_(nothing yet)_
