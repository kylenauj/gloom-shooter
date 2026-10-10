---
name: ghost-audit
description: Run the Gloom Shooter ghost playtester, triage what it finds (rules bugs, softlocks, desyncs, layout, balance), fix the worst few with regression tests, re-run to prove the fixes, and commit the audit. Use when asked to audit, playtest, QA, polish or "improve the game", or when a scheduled run fires.
---

# Ghost audit: play, find, fix, prove

The ghost (`tools/ghost/`) plays Gloom Shooter the way a player would and
checks everything a player could break:

- **Headless:** hundreds of battles (smart, aggressive and fuzz personas) and whole campaigns.
- **In Chromium:** the real page.
- **Output:** `audit/REPORT.md` (findings worst-first, each with a seed to reproduce) and one line per run in `audit/history.jsonl`.

Your job is the part the ghost can't do: judge, fix, and prove the fix.

## 1. Start clean

```sh
git status                 # must be clean; work on the branch you were given
npm test                   # every test must pass before you touch anything
```

If tests fail before you start, fix that first. It is finding number one.

## 2. Run the ghost

```sh
npm run ghost:full         # headless suites + the browser pass (about 5 min)
# no Chromium available?   npm run ghost     (headless only, about 1 min)
```

Read `audit/REPORT.md` top to bottom. Then **look at the screenshots** in
`audit/shots/` (open the PNGs with the Read tool): title, battle at every
screen size, the Hollow's tabs, deploy, results.

The checks catch overlaps, clipping and spills. You catch what they can't:

- text you can't read against the scene;
- a unit lost under a glowcap;
- a panel that looks broken;
- art that reads wrong;
- anything a first-time player would be confused by.

Write down what you see, with the screenshot name.

## 3. Triage

Rank everything (ghost findings and your own visual notes):

1. `critical`: crashes, softlocks, illegal actions accepted, units in walls.
2. `major`: desyncs between screen and rules, wrong numbers shown, broken input, events out of order.
3. Visual problems a player would notice immediately.
4. `minor`: layout, balance, pacing.
5. `info`: coverage notes. These are usually gaps in the ghost, not the game.

Pick **at most three** to fix this run, worst first. Small, sure fixes beat ambitious ones.

**Before fixing, decide whether the finding is real.** The ghost can be wrong:

- a check firing at the wrong moment;
- a sample too small;
- its policy never trying something.

If it's the ghost's fault, fix the ghost and say so in the commit. Never silence a true finding by loosening a check.

## 4. Fix each one properly

**Reproduce first.** Every finding carries a `repro` (seed, threat, type, persona, rank, tier, round). Write a throwaway script in your scratchpad that rebuilds that battle the way `tools/ghost/run.js` does (`squadFor`, `GS.setupBattle`, `GS.Ghost.smartUnit`). Run it until you see the bug happen. Repro scripts stay in your scratchpad; don't commit them.

**Find the root cause.** Fix that, not the symptom.

**Logic bugs get a regression test** in `tests/rules.test.js`, named `regression (ghost, seed N): …`. It must fail without your fix (check it does) and pass with it.

**Balance changes:**
- Turn one knob at a time, in the data tables (`js/core/data.js`, the `PODS`/`BUDGET` tables in `js/core/battle.js`, `js/core/campaign.js`).
- Re-run `npm run ghost` and quote the before/after numbers.
- The smart ghost plays better than most people. Prefer making late game harder over early game easier.

**Layout and visual fixes:** in `css/style.css` or the view. Re-run the browser pass and look at the new screenshot.

## 5. Prove it

```sh
npm test                   # all green, including your new tests
npm run ghost:full         # or `npm run ghost` without Chromium
```

- The score must not drop.
- There must be no new critical or major findings.
- The fixed ones show under "fixed" in the report's diff.

If something regressed, fix it or revert your change. Never commit a regression.

## 6. Commit

Commit the code, the tests, `audit/REPORT.md` and `audit/history.jsonl`. `audit/shots/` and `audit/report.json` are ignored on purpose.

Message:

```
ghost: <what you fixed, briefly> (score A → B)
```

Then push to your branch. Open a pull request only if the person (or the scheduled run's prompt) asked for one.

## 7. Report back

In a few lines:
- the score before and after;
- what you fixed and how you proved it;
- what you saw in the screenshots;
- the top three things still open, for next time.

## Guardrails

- Never skip, delete or weaken a test or an invariant to get green.
- Never edit `reference/` or `vendor/`.
- Keep each run small: at most three fixes, one balance knob per finding.
- Content changes (new enemies, abilities, missions) are design decisions. Propose them; don't make them.
