# RECURSION: Round-6 chambers, designer B (keys and combination track)

> **Integrated (director, round 6):** these chambers are in `CAMPAIGN_LEVELS` at their planned positions; their goldens
> moved to `src/testing/replays/` (the round6-a/round6-b replay sub-suites were removed). Story lines over 110
> characters were shortened (L15, L16, L17, L18); the level files hold the final text. The registration notes below are
> historical.

Owner: level designer B (round 6). Source of truth: `src/levels/definitions/L14-gold-and-cyan.ts`,
`L15-glass-gallery.ts`, `L17-upstream.ts`, `L18-hour-of-glass.ts` (each carries its ASCII map, a body-count argument
and the intended solution in its header comment), collected in `src/levels/definitions/round6-b-levels.ts`
(`ROUND6_B_LEVELS`). Tests: `src/levels/round6-b.test.ts` (the campaign battery plus each chamber's lessons) and
`src/testing/replays/round6-b.test.ts` (goldens in `src/testing/replays/round6-b/`). Solver configs:
`src/testing/solver/levelConfigs-round6-b.ts`. Mechanics: `docs/architecture/contracts.md` §5 / §9 (round 6).

## Integration notes for the director

* The chambers are **not** in `CAMPAIGN_LEVELS` yet. Each `order` already holds its planned campaign position
  (L14 = 11, L15 = 13, L17 = 16, L18 = 17). Import the constants from `round6-b-levels.ts`.
* Goldens: when a chamber joins `LEVELS`, move `src/testing/replays/round6-b/<id>.golden.json` up one folder (or run
  `npm run replays:update`). `round6-b.test.ts` then skips that chamber by itself. The `levelFingerprint` includes
  `order`, so if the order changes, re-bless.
* `campaign.test.ts` `INTENDED_DIVERGENCES` entries (also asserted in `round6-b.test.ts`):
  `'L14-gold-and-cyan': [{ actorId: 'echo:1', expected: 'fail', actual: 'use', entityId: 'console-echo' }]` and
  `'L18-hour-of-glass': [{ actorId: 'echo:1', expected: 'fail', actual: 'use', entityId: 'console-echo' }]`.
  L15 and L17 have none.
* Story table rows (story.md), with log numbers interleaved in campaign order (L09 = 089):

| # | Chamber | Location | Narration | Log |
|---|---|---|---|---|
| 11 | Gold and Cyan | Paradox Wing — The Attuned Archive | The seal answers the living. The console answers echoes. Gold for now, cyan for then. | LOG 063 · The Archive keys itself to whoever asks. It opens for my past and refuses me. — H.A. |
| 13 | Glass Gallery | Paradox Wing — The Glass Gallery | The seal is glass, and it answers only the living. Glass remembers who walked on it. | LOG 080 · My echoes broke the gallery seal again. They walk where I walked. I have learned to walk the long way. — H.A. |
| 16 | Upstream | Paradox Wing — The Upstream Chute | The chute only lets you down, unless an echo holds the brake. Your copy is five seconds behind you, on the same steps. | LOG 095 · I went down the chute and stayed up top, both at once. I have stopped asking which of me is the copy. — H.A. |
| 17 | Hour of Glass | Paradox Wing — The Hour of Glass | Light, glass, the one-way sump and the long line: every lock here remembers something. Act before you need it. | LOG 098 · The Core is one door away. Every lock between here and there was keyed to me. I set them for whoever comes next. — H.A. |

* Shared files touched (one line each, additive): `src/testing/solver/levelConfigs.ts` (`analysisFor` also looks up
  `ROUND6_B_ANALYSIS`), `src/testing/solver/cli.ts` (`levelById` also finds `ROUND6_B_LEVELS`).

## Summary

| # | Chamber | New idea | Echoes min / limit / par | Par (best verified) | Model score | Est. min (median) | Hint delays |
|---|---|---|---|---|---|---|---|
| 11 | Gold and Cyan | attuned keys: gold = the living player, cyan = echoes; an intended fail -> use | 1 / 2 / 1 | 11 s (6.27 s) | 6.9 | 2.7–12.0 (5.4) | 0/50/100 |
| 13 | Glass Gallery | Paradox Glass: route your echoes around the gold glass seal; keys again (Echo Plate opens the Cyan Door) | 2 / 2 / 2 | 19 s (12.50 s) | 7.4 | 3.5–15.4 (7.0) | 0/65/125 |
| 16 | Upstream | reversible valve + nested loop + ride lift + cyan brake: one recording ends on both sides of the valve | 2 / 2 / 2 | 24 s (16.75 s) | 9.4 | 4.7–20.8 (9.5) | 0/85/170 |
| 17 | Hour of Glass | exam: relay (8 s) + valve + keys + glass with crate, laser and timer | 3 / 3 / 3 | 38 s (27.22 s) | 11.1 | 6.5–28.8 (13.1) | 0/120/235 |

Model scores stay below L10's 15.2, so the Core remains the campaign maximum. The four chambers add about 35 min of
model median (17–77 min low–high). Par = fastest verified completion × 1.25 + 3 s (solver find or plan check), hint delays
from `difficulty.ts` (`estimateLevel`), as for L01–L10. Nobody has playtested these: every time is a model output.

---

## L14 — Gold and Cyan  *"Some locks know who is asking."* (campaign order 11)

* **Teaching goal:** attuned keys. The Gold Seal (pressure plate, `accepts: 'player'`) counts only the living player; an
  echo on it weighs nothing. The Echo Console (timed switch, 5 s, `accepts: 'echoes'`) answers only an echo: a live press
  fails with reason `'attuned'` (toast from `mechanicText.ts`), and the same press replayed by the echo is accepted:
  the intended `fail -> use` divergence, drawn violet on the timeline.
* **Layout and story:** the Attuned Archive. Hall with the Gold Seal directly in front of the Archive Door; behind it a
  3×3 archive (a dead end) with the cyan console at its far wall; the Reading Room Door (exit) is about 3 s from the seal
  and opens for the console's 5 s. Gold and cyan banners flank the seal; hologram "GOLD · NOW   CYAN · THEN".
* **Objective:** have an echo light the Echo Console. **Echoes** 1 / limit 2 / par 1. **Par** 11 s.
* **Hints:** (1) gold answers you now, cyan answers echoes; (2) let the console refuse you, then {echo}: your echo's
  press is accepted; (3) the recipe.
* **Intended solution:** Echo 1 (the honest attempt): step on the seal, slip into the archive before the door shuts (a
  door never closes on a body), press the console: refused. Final run: stand on the seal; the echo walks past you into
  the archive and its press lands (6.8 s authored, 6.27 s solver best); leave the seal as soon as it is through and walk
  to the exit inside the 5 s window.
* **Minimum-echo proof:** keys. The exit needs the console, the console needs an echo's press, and the echo only reaches
  it while the living player holds the seal (nothing else opens the Archive Door, no crate). Solver: k=0, final run of 3
  steps with every wait, **exhaustive, none**.
* **Teaching check:** `attuned(1)` (at least one attuned divergence in the winning pass). The authored winning pass has
  exactly one (asserted).
* **Timing:** one window, the step-off: 243 t (4.05 s) from arriving on the seal.
* **Tests (round6-b.test.ts):** live press fails `'attuned'` and changes nothing; exactly one attuned divergence; if you
  never hold the seal the echo is shut out; staying on the seal too long misses the window.

## L15 — Glass Gallery  *"Route your past selves, not just their timing."* (campaign order 13)

* **Teaching goal:** Paradox Glass, and keys again. The Glass Seal in front of the Crown Door is gold glass
  (`accepts: 'player', shatterOn: 'echoes'`): it counts only you, and the first time an echo stands on it, it shatters
  for the rest of the pass (`shatter` event naming the echo). It sits on the only junction between the hall and the
  gallery, so the short way to either timer crosses it. Your recording walks over it harmlessly; your echo replaying that
  walk breaks it.
* **Layout and story:** the Glass Gallery. Hall (south) → a 1-wide corridor straight onto the seal → the gallery row
  running west to the West Timer and east to the Cyan Door / East Timer alcove. Two service corridors wrap round the
  outside (+4.3 s west, +5.1 s east) and join the gallery beyond the glass. The Echo Plate (cyan) in front of the West
  Timer opens the Cyan Door of the East alcove: standing there live does nothing; your West echo standing there lets
  your East echo in. Crown Door = AND(Glass Seal, West Timer, East Timer), timers 2.5 s, 18 tiles apart.
* **Objective:** hold the Glass Seal while both timers burn. **Echoes** 2 / 2 / 2. **Par** 19 s.
* **Hints:** (1) the door's three needs, and the seal is glass; (2) echoes walk where you walked: record them round the
  service corridors; (3) the recipe.
* **Intended solution:** Echo 1: west service corridor, onto the Echo Plate, West Timer at 13 s. Echo 2: east service
  corridor, through the Cyan Door (open while Echo 1 stands on the Echo Plate), East Timer with Echo 1. You: short
  corridor onto the seal, through the Crown Door when it opens (13.7 s authored, 12.50 s solver best).
* **Minimum-echo proof:** body count + keys. At the door's opening you are on the seal (only you count, no echo may ever
  touch it); both timers were pressed within 2.5 s; each timer's stand cell is 9 tiles (3.75 s) from the seal and 18
  from the other, so neither you nor one echo can light a timer and still be in place. Solver: k=0,1 deep(3)
  **exhaustive, none** (1 echo: 416 echo plans, 131 s); k=0 wide(2) **exhaustive, none**; k=1 wide(2) (auto signal waits) budget-limited: 1200 s, 705 echo plans, none.
* **Teaching check:** `noShatter` (glassIntact). Any win must keep the glass intact (the seal is a Crown Door input), so
  the check doubles as the glass-shortest-route cheese hunt: both route variants (shortest and `~glass`) are in the
  vocabulary; the 2-echo cheese hunt deep(2) with signal waits found **no** win that shatters the glass (budget-limited
  300 s).
* **Timing:** two windows, Echo 2's press relative to Echo 1's: 213 t (3.55 s) and 263 t (4.4 s).
* **Tests:** the short route shatters the glass on replay, named after Echo 1, and the Crown never opens (both
  echoes); walking over it while recording breaks nothing; the winning pass never shatters; the Echo Plate ignores
  you; you cannot press a timer and still reach the seal (both sides); timers 3 s apart never open the door.

## L17 — Upstream  *"The same steps, the other side."* (campaign order 16)

* **Teaching goal:** the reversible valve, with the nested loop (L08), a ride lift (L04) and a cyan key. One recording
  ends on both sides of a one-way valve: L08's "same inputs, changed world", where the change is a direction.
* **Layout and story:** the Upstream Chute (`recursion: { delayTicks: 300 }`). The Freight Lift (ride mode, returns by
  itself after 0.5 s) is the only way up to the Head Gallery. The only way down is the Chute: the Chute Valve
  (southward; `reverseWhenPowered`, wired from the Brake Plate), a fixed Non-return Flap under it, then two ramps to the
  hall. The Head Plate sits in a 1-wide pocket right above the valve. The Foot Plate is in the far west of the hall, the
  Brake Plate (cyan: echoes only) in the far south-east. Exit Door = AND(Head, Foot, Brake). The lift is never in a
  valve-adjacent cell.
* **Objective:** hold the Head, Foot and Brake plates at once. **Echoes** 2 / 2 / 2. **Par** 24 s.
* **Hints:** (1) copies 5 s behind; three plates, four bodies; (2) the brake turns the valve, a copy reaching a turned
  valve stays on the Head Plate; (3) the recipe.
* **Intended solution:** Echo 1: ride the lift, walk onto the Head Plate, down the chute, west to the Foot Plate. Echo 2:
  wait by the Brake Plate and step on after Echo 1 is through the valve (~9.7 s) and before its copy arrives (~14.4 s).
  The copy walks into the turned valve (`valveDenied`) and stays on the Head Plate, its later inputs pushing into the
  pocket wall and the valve. Echo 2's copy joins it on the brake. You walk out (17.7 s authored, 16.75 s plan check).
* **Minimum-echo proof:** body count + the lag argument. Four jobs (three plates + you), one echo = three bodies. With two
  echoes there are five bodies in two pairs, and a copy is always where its echo was 5 s earlier; the plates are pairwise
  at least 7.5 s apart (Head-Foot 7.7 s, Head-Brake 7.5 s, Foot-Brake 10.5 s, walking only), so a pair can hold two plates
  only if the world stops the copy: the turned valve (the lesson) or a missed lift (the copy is then stuck in the lift
  approach, which has no plate). The flap makes the chute unclimbable, so a braked chute is simply shut. Solver: k=0,1
  deep(3) **exhaustive, none**; k=0 wide(2) **exhaustive, none**; k=1 wide(2) budget-limited (300 s, none).
* **Teaching check:** `splitAcrossValve('valve-chute')`: some loop's echo ends downstream (a region that does not
  flood through lift shafts) and passed the valve (`valvePass`), and its copy ends upstream after being turned back
  (`valveDenied`). Position alone is not enough: a copy that merely lags 5 s behind on a plate fails the check.
* **Timing:** Echo 2's brake step: 300 t (5.0 s). The lift wait (172 t, any value up to it works) is a soft bound.
* **Redesign (solver-driven):** the first version (Head/Foot at the top/bottom of a short chute, brake nearby) had a
  7.9 s 2-echo cheese: with the brake held, echoes walked UP through the turned valve, and a copy lagging 5 s behind its
  echo held a second plate with no valve split at all. Fixes: the non-return flap, plates pairwise > 5 s apart, the
  Head pocket, and the event-based teaching check.
* **Tests:** echo on the Foot Plate and copy on the Head Plate at the win, with `valvePass` / `valveDenied`; no
  Recursion Engine → fail; no brake → the copy follows its echo down; braking too early shuts out the echo too; braking
  too late lets the copy through; you on the cyan brake turn nothing; one echo is not enough.

## L18 — Hour of Glass  *"Everything you learned, eight seconds early."* (campaign order 17, penultimate exam)

* **Teaching goal:** the exam: chrono relay + check valve + attuned keys + Paradox Glass, with the old crate, laser and
  timer. Act before you need it.
* **Layout and story:** the Hour of Glass. Crown Door = AND(Hour Relay, Echo Plate, Crown Timer, Glass Seal).
  * The Echo Console (cyan, 3 s, no retrigger, 4 s cooldown) sits in the Lens alcove deep in the Sump: through the Sump
    Valve (eastward: whoever goes in stays in), then the Lens Door, which opens while the Hour Laser is on and its beam
    does not reach the receiver. The console feeds the Hour Relay (8 s, mounted in the wall) to the Crown Door.
  * The Echo Plate (cyan) is in the west room; the Crown Timer (2.5 s, no retrigger, cooldown) in the far south-east.
  * The Glass Seal (gold glass) is in front of the Crown Door, on the junction of the gallery: the crate's shortest way
    from the west room to the Sump crosses it, so the Courier carries it down the west stair, across the hall and up the
    east stair.
* **Objective:** relay, Echo Plate, timer and seal at once. **Echoes** 3 / 3 / 3. **Par** 38 s.
* **Hints:** (1) the four needs, the relay is 8 s late; (2) the Sump is one-way, the crate opens the Lens Door, take it the
  long way; (3) the recipe.
* **Intended solution:** Echo 1 (Courier): crate the long way, through the valve, into the beam; through the Lens Door;
  press the console (recorded `fail 'attuned'`, replayed `use`, at 18.7 s). Echo 2: the Echo Plate. Echo 3 (Timekeeper):
  the Crown Timer at 26 s, as the relayed pulse arrives. You: onto the seal by the short stair, through the Crown Door
  (27.5 s authored, 27.22 s plan check).
* **Minimum-echo proof:** keys + valve + body count. At the opening: you on the seal (only you count); an echo on the
  Echo Plate (only echoes count); the timer pressed within 2.5 s by a body 7 s from the seal and 10 s from the plate; the
  console pressed 8 s earlier by an echo (cyan) from inside the Sump, which nobody leaves. Three different echoes. The
  crate is needed because the beam cell is 2 tiles from the Lens Door, which shuts within 6 ticks of the beam reaching
  the receiver again. Solver (vocabulary adds the beam cell as a drop target and stand cell): k=0 deep(2) and wide(1)
  **exhaustive, none**; k=1 and k=2 deep(2) and wide(1) budget-limited (300 s each, none), backed by the body count,
  as for L10. The open find search ran out of budget; the intended plan is verified as a plan of the vocabulary.
* **Teaching check:** all of `attuned(1)`, `noShatter`, `relayMatters('relay-hour')` (relay output on while its input is
  off, and the console was never held on through the delay) and an echo ending downstream of the Sump Valve.
* **Timing:** one constrained window, the Timekeeper's press: 311 t (5.2 s). The console's no-retrigger + cooldown stops
  a relay bypass by mashing.
* **Model:** score 11.1 (target 10–12, below L10's 15.2), one intended divergence.
* **Tests:** the crate across the glass shatters it (named Echo 1); the Sump cannot be left; a body in the beam opens
  the Lens Door but cannot reach it; the console cannot be held on (`busy`, then `cooldown`); pressing the timer with
  the console instead of 8 s later fails; two echoes are not enough (no holder, no Timekeeper, or you on the timer).

## Cheese hunts (all four)

| Hunt | L14 | L15 | L17 | L18 |
|---|---|---|---|---|
| doorstop | none: the Archive Door opens only on the seal; holding it from the doorway is still the attuned plan | none: the Crown Door opens only with you on the seal | none: the Exit Door opens only with all three plates | none: the Crown and Lens doors open only on their conditions |
| walk-back | n/a | n/a | impossible: valve + flap (chute unclimbable) | impossible: Sump Valve (test) |
| relay-bypass | n/a | n/a | n/a | closed: console no retrigger + cooldown (test, `relayMatters`) |
| glass shortest route | n/a | fails: shatter (tests, cheese hunt) | n/a | fails: shatter (test) |
| k−1 echoes | k=0 exhaustive | k=1 deep(3) exhaustive | k=1 deep(3) exhaustive | k=2 budget-limited + body count |
| lesson bypass (solver cheese job) | 1 echo × 2 steps, every wait: **exhaustive, none** | 2 echoes × 2 steps: budget, none | 2 echoes × 2 steps deep: **exhaustive, none**; wide: budget, none | (no separate job: the space is too large) |

## Deviations from the round-6 plan (and why)

* **L18 has one constrained timing window, not "about 3".** With 3 the model score is 13.8 (2: 12.4), above the 10–12
  target and close to L10's 15.2, which must stay the maximum. The cap won; the exam's difficulty is in planning (four
  mechanics, three echoes, an 8 s anticipation), not in timing.
* **L18 uses one combined gold-glass seal** for "a glass plate in the shortest corridor" and "a gold plate as the
  player's last job": the seal is both, and the crate's shortest route crosses it.
* **L14 recording reaches the console live** (the player stands on the seal and slips into the archive before the door
  shuts), so the recorded press really fails `'attuned'` and the toast explains it; the plan's "walk to the shut door and
  keep pushing" would record `none` instead.
* **L15's Echo Plate** (the cyan plate in the plan) opens the East alcove's Cyan Door: the West echo is the key for the
  East echo, keys reinforced without a third body.
* **L17 targets and proves 2 echoes,** with the Brake also wired to the Exit Door so the body count is airtight; the
  teaching check is stronger than "echo downstream, copy not" (it also needs the valve events) because the 5 s copy lag
  alone can put an echo and its copy on two plates.
* **Visuals not checked in a browser:** `graphics/preview.ts` only loads campaign and sandbox ids. After the director adds
  the chambers, `graphics-preview.html?scene=level&id=<order>` shows them. Decor uses existing types.
