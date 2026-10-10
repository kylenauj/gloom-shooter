# Gloom Shooter

A mushroom-themed, turn-based squad tactics game. Mushroom-folk wardens hold a glowing night forest against **the Gloom**: rot, mould and cordyceps spore beasts.

It takes **XCOM 2**'s cover, flanks, overwatch and concealment; **Warhammer 40K: Mechanicus**'s shared resource, doom meter and canticles; and **Jagged Alliance**'s AP, hired troops with wages, and sector map. It's built on the three.js asset kit from *Pine Hollow Rally*.

- [Design doc](docs/DESIGN.md): a breakdown of the three games and the full rules spec.

## Run it

There's no build step. Serve the folder with any static server and open it:

```sh
npm start             # http-server on http://localhost:8080
# or: python3 -m http.server 8080
```

URL shortcuts for testing:
- `index.html?skirmish=purge&threat=3&rank=1`
- `type`: `purge` | `heart` | `finale`
- `rank`: 0–3
- `tier`: 0–2
- `size`: 3–5

## Controls

| | |
|---|---|
| Click a tile | Move (blue: you can still shoot; amber: dash) |
| Click an enemy | Fire (hover shows the hit chance breakdown) |
| `1`–`9` | Abilities |
| `Tab` | Next warden |
| `Esc` / right-click | Cancel |
| `Enter` | End turn |
| `Q` / `E` | Turn the camera |
| `WASD` / drag | Pan |
| Wheel / pinch | Zoom |
| `M` | Sound |

On touch screens, tap once to aim and tap again to confirm.

## The ghost: automated playtesting

`tools/ghost/` is a playtester that plays the game and audits it:

- **Headless:** hundreds of battles (a smart player, an aggressive one, and a fuzzer that also tries illegal moves) and whole campaigns.
- **In the browser:** the real page in Chromium, at desktop, laptop and phone sizes.

Every action is checked against the rules: units in walls, two on a tile, HP and AP out of range, softlocks, events out of order, illegal actions accepted. In the page it also checks that the screen matches the rules, that real clicks and keys work, and that the HUD fits.

The results go into `audit/REPORT.md`, worst first with a seed to reproduce each finding. Each run is scored and compared with the last one in `audit/history.jsonl`.

```sh
npm run ghost         # headless, ~1 min
npm run ghost:full    # plus the browser pass, ~5 min
```

The **AI** half is a Claude Code agent and skill that closes the loop: `.claude/agents/ghost-auditor.md` and `/ghost-audit`. The agent:

1. runs the ghost;
2. reads the report;
3. looks at every screenshot for problems the checks can't see;
4. fixes the worst few problems, each reproduced from its seed and covered by a regression test;
5. re-runs to prove the fixes;
6. commits with the score.

Run it on demand, or on a schedule so the game keeps getting better.

## Develop

```sh
npm test              # rules + campaign tests (node --test)
npm run balance       # AI-vs-AI win rates per threat level
```

- `js/core/` is pure logic, with no THREE and no DOM. It runs under Node.
- All content lives in `js/core/data.js`.
- See [docs/DESIGN.md §8](docs/DESIGN.md#8-architecture) for the architecture.

`reference/Pine_Hollow_Rally.html` is the original game the assets were taken from. `vendor/three.min.js` is three.js r128 (MIT).
