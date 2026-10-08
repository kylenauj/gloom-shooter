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

## Develop

```sh
npm test              # rules + campaign tests (node --test)
npm run balance       # AI-vs-AI win rates per threat level
```

- `js/core/` is pure logic, with no THREE and no DOM. It runs under Node.
- All content lives in `js/core/data.js`.
- See [docs/DESIGN.md §8](docs/DESIGN.md#8-architecture) for the architecture.

`reference/Pine_Hollow_Rally.html` is the original game the assets were taken from. `vendor/three.min.js` is three.js r128 (MIT).
