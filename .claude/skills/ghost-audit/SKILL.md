---
name: ghost-audit
description: The Gloom Shooter ghost: play the game, find what could be better, and (only for items the person approved) fix it. Two modes. "scout" (default) runs the ghost playtester, studies the report, screenshots, design doc and code, and writes a ranked improvement backlog to audit/BACKLOG.md without touching the game. "fix" builds the backlog items the person ticked, with tests, and re-runs the ghost to prove them. Use when asked to audit, playtest, QA, find improvements, polish or "improve the game", or when a scheduled run fires.
---

# The ghost: scout, then fix what's approved

There are two modes. Pick by what you were asked:

- **scout** (the default, and what scheduled runs do): find things to improve and write them into `audit/BACKLOG.md`. **Change no game code.** Only the backlog, the audit report and history, and (if the ghost itself was wrong) the ghost may change.
- **fix**: build the backlog items the person ticked (`- [x]`), and nothing else.

Exception: a **critical** finding (a crash, softlock, or illegal action accepted) may be fixed in scout mode. Say so in the backlog and in your report.

## Scout mode

1. **Start clean.** Run `git status` and `npm test`. A failing test is the top backlog item.
2. **Run the ghost.** Use `npm run ghost:full`, or `npm run ghost` without Chromium.
3. **Read `audit/REPORT.md`**: findings (bugs), opportunities (feel, pacing, clarity, depth, balance, content), and the balance, feel and campaign tables.
4. **Look at every screenshot** in `audit/shots/` with the Read tool, as a first-time player would. Note what's unclear, ugly, unreadable, cramped, or missing (feedback, tutorials, juice), naming the screenshot.
5. **Think like a designer.** Read `docs/DESIGN.md` and skim the code the findings point at. Ask:
   - What would make this more fun?
   - What would a player find confusing?
   - What do XCOM 2, Mechanicus and Jagged Alliance do here that this doesn't?
   - What's missing for a first-time player?
6. **Write `audit/BACKLOG.md`** in the format below:
   - **Merge** with the existing file: keep every item's id and tick state.
   - **Update** evidence on items you saw again.
   - **Mark done** the items the ghost shows are fixed: move them to Done with the date.
   - **Add** new items at the end of their section.
   - Aim for 5–15 open items. Quality over volume; drop anything you can't back with evidence or a clear reason.
7. **Commit** `audit/BACKLOG.md`, `audit/REPORT.md` and `audit/history.jsonl` with the message `ghost scout: N new, M resolved (score X)`. Push.
8. **Report back:** the top five items, one line each, and ask which to build.

### Backlog format

```markdown
# Gloom Shooter backlog

_Last scouted: <date> · ghost score <X>/100 · <commit>_

Tick `[x]` the items to build, then ask for "ghost fix".

## Bugs
- [ ] **B3 · Short title** — impact: high · effort: S
  - Evidence: what the ghost or a screenshot showed (seed, metric, screenshot name).
  - Change: the concrete fix proposed.

## Feel & clarity
## Balance & pacing
## Content & depth
## Done
- **B1 · …** — fixed <date> (<commit>)
```

- **Ids:** `B` bugs, `F` feel and clarity, `P` balance and pacing, `C` content. Never reuse an id.
- **Impact** is how much a player would notice: high / med / low.
- **Effort:** S is under an hour, M is a session, L is several.
- Order each section by impact ÷ effort.

## Fix mode

The ghost (`tools/ghost/`) plays Gloom Shooter the way a player would and
checks everything a player could break:

- **Headless:** hundreds of battles (smart, aggressive and fuzz personas) and whole campaigns.
- **In Chromium:** the real page.
- **Output:** `audit/REPORT.md` (findings worst-first, each with a seed to reproduce) and one line per run in `audit/history.jsonl`.

Your job is the part the ghost can't do: judge, fix, and prove the fix.

Build only the ticked `[x]` items in `audit/BACKLOG.md`, best impact ÷ effort first, at most three per run. If nothing is ticked, say so and stop.

### 1. Start clean

```sh
git status                 # must be clean; work on the branch you were given
npm test                   # every test must pass before you touch anything
```

If tests fail before you start, fix that first. It is finding number one.

### 2. Run the ghost

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

### 3. Triage

Rank everything (ghost findings and your own visual notes):

1. `critical`: crashes, softlocks, illegal actions accepted, units in walls.
2. `major`: desyncs between screen and rules, wrong numbers shown, broken input, events out of order.
3. Visual problems a player would notice immediately.
4. `minor`: layout, balance, pacing.
5. `info`: coverage notes. These are usually gaps in the ghost, not the game.

The ticked backlog items are the work; the triage order decides which go first. Pick **at most three** to fix this run. Small, sure fixes beat ambitious ones.

**Before fixing, decide whether the finding is real.** The ghost can be wrong:

- a check firing at the wrong moment;
- a sample too small;
- its policy never trying something.

If it's the ghost's fault, fix the ghost and say so in the commit. Never silence a true finding by loosening a check.

### 4. Fix each one properly

**Reproduce first.** Every finding carries a `repro` (seed, threat, type, persona, rank, tier, round). Write a throwaway script in your scratchpad that rebuilds that battle the way `tools/ghost/run.js` does (`squadFor`, `GS.setupBattle`, `GS.Ghost.smartUnit`). Run it until you see the bug happen. Repro scripts stay in your scratchpad; don't commit them.

**Find the root cause.** Fix that, not the symptom.

**Logic bugs get a regression test** in `tests/rules.test.js`, named `regression (ghost, seed N): …`. It must fail without your fix (check it does) and pass with it.

**Balance changes:**
- Turn one knob at a time, in the data tables (`js/core/data.js`, the `PODS`/`BUDGET` tables in `js/core/battle.js`, `js/core/campaign.js`).
- Re-run `npm run ghost` and quote the before/after numbers.
- The smart ghost plays better than most people. Prefer making late game harder over early game easier.

**Layout and visual fixes:** in `css/style.css` or the view. Re-run the browser pass and look at the new screenshot.

### 5. Prove it

```sh
npm test                   # all green, including your new tests
npm run ghost:full         # or `npm run ghost` without Chromium
```

- The score must not drop.
- There must be no new critical or major findings.
- The fixed ones show under "fixed" in the report's diff.

If something regressed, fix it or revert your change. Never commit a regression.

### 6. Commit

In `audit/BACKLOG.md`, move each item you finished to Done with the date and commit. Commit the code, the tests, `audit/BACKLOG.md`, `audit/REPORT.md` and `audit/history.jsonl`. `audit/shots/` and `audit/report.json` are ignored on purpose.

Message:

```
ghost: <what you fixed, briefly> (score A → B)
```

Then push to your branch. Open a pull request only if the person (or the scheduled run's prompt) asked for one.

### 7. Report back

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
