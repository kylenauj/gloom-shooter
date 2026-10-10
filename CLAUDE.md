# Gloom Shooter

A mushroom-themed, turn-based squad tactics game (XCOM 2 × Mechanicus × Jagged Alliance) in plain JavaScript and three.js r128. There's no build step.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Rules and campaign tests (`node --test`). Run before and after every change. |
| `npm run ghost` | The ghost playtester, headless (about 1 min). Writes `audit/REPORT.md`. |
| `npm run ghost:full` | The ghost plus a real-browser pass in Chromium (about 5 min). |
| `npm run ghost:quick` | A fast smoke pass. |
| `npm start` | Serves the game on http://localhost:8080. Shortcut: `?skirmish=purge&threat=3&rank=1`. |

To audit and improve the game, use the `/ghost-audit` skill or the `ghost-auditor` agent.

## Layout

- `js/core/` holds the rules. It's pure logic with no THREE and no DOM, and it runs under Node.
  - `data.js` is all the content: weapons, abilities, classes, enemies, research, regions, the Tide.
  - `grid.js` covers maps, pathfinding, line of sight and cover.
  - `battle.js` is the battle state machine.
  - `ai.js` is the Gloom's turn.
  - `campaign.js` covers the weeks between battles.
- `js/render/` is three.js. `view.js` plays the battle's event list back as animation and owns battle input.
- `js/ui/` holds `hud.js` (battle HUD) and `menus.js` (everything else).
- `tools/ghost/` is the ghost:
  - `policy.js`: how it plays.
  - `audit.js`: invariants, the event checks, contracts, metrics.
  - `run.js`: the suites and the report.
  - `browser.js`: the Chromium pass.
- `docs/DESIGN.md` is the design and rules spec.

## Rules of the house

- **The battle never waits on the view.** Actions resolve at once and append events; `BattleView.pump()` plays them. Keep it that way.
- **New content goes in `data.js`.** New behaviour needs code only for a new effect type (`applyEffects`) or passive flag (`hitInfo` / `reactions`).
- **Every logic bug fixed gets a regression test** in `tests/rules.test.js`.
- **Balance is tuned against the ghost's numbers**, one knob at a time. Quote before/after.
- **Don't edit** `reference/` (the Pine Hollow Rally source the assets came from) or `vendor/`.
