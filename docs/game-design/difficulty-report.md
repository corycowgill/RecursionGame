# RECURSION: Difficulty and Solvability Report (rounds 5 and 6)

> **Round 6 (expansion to 18 chambers).** In the tables below, `#` is the level id number (L01..L18), not the play
> order: the campaign order since round 6 is L01, L02, L03, L04, **L11**, L05, L06, **L12**, **L13**, L07, **L14**, L08,
> **L15**, L09, **L16**, **L17**, **L18**, L10 (The Core stays the finale). The round-6 rows come from the level designers'
> solver runs (details in [`levels-round6-A.md`](./levels-round6-A.md) and [`levels-round6-B.md`](./levels-round6-B.md))
> and the director's re-run of `npm run solve -- all --difficulty` on the integrated campaign (section 5).
> **New campaign estimate: 61–268 min, median ≈ 122 min** (round 5: 31–134, median ≈ 61).

Owner: puzzle analyst / level designer. Tools: `src/testing/solver/*` (`npm run solve -- <level>`), CI subset in
`src/testing/solver/solver.test.ts`. **Nobody has playtested yet.** Every time estimate in this document comes from
a model with stated assumptions. Nothing here is a measurement of people, and every subjective call is marked
**needs playtest**.

## 1. The solver in one paragraph

A bounded depth-first search over the real, deterministic simulation (`SolverWorld` wraps the same `step()` the game
uses). It does not search raw ticks. Each loop (echo or final run) is a short sequence of **macro steps**: an optional
wait (N ticks, or until entity X's signal turns on/off), then one task: walk to a cell (plate, doorway, lift, ferry),
press a console, pick up an item, drop it on a cell or into a socket, hold, or (final run only) exit. Echoes can walk
**live** (closed loop against their real position) or **blind** (dead reckoning along the path they would take if every
door were open, the "inputs, not results" mechanic of L07/L09/L10). Echoes are recorded in order, each in the world
of the loops before it, exactly as a player records them. Pruning is sound with respect to the bounds (duplicate input
sequences, already-satisfied or never-satisfied waits, identical final-run states). Every solution found is
re-verified through `TemporalGame` (the golden-replay path) before it is reported.

**What "proof" means here:** *exhaustive within the stated bounds* means that no plan of at most that many steps per
loop, drawn from that vocabulary, solves the level with that many echoes. It is not an absolute proof: a plan
outside the vocabulary (an odd mid-tile position, a wait value not in the list) is not covered. Where a hand-made
body-count argument exists (L01, L02, L06, L08, L10), it covers what the search does not. Bound notation:
`deep(n)` = up to n tasks per echo, no waits, live walking only; `wide(n)` = up to n tasks per echo, every wait
(1 s, 3 s and listed signal edges), blind and live walking. The final run gets 1 step before its exit task unless noted.

Running it: `npm run solve -- L07` (find + proofs + cheese hunts, 300 s budget per job, sharded over 3 worker
threads), `npm run solve -- all --kinds=proof --budget=900`, `npm run solve -- all --difficulty` (model table below),
`--slack` (timing sweep). CI (`npm test`) runs only the fast subset for L01–L04, about 20 s.

## 2. Per-level results

| # | Intended / limit | Fewer-echo search (k < intended) | Status | Cheese found | Fixed? |
|---|---|---|---|---|---|
| 1 | 1 / 2 | k=0: final run of 3 steps, every wait | **exhaustive, none** | none | - |
| 2 | 2 / 3 | k=0,1: deep(3) and wide(2) | **exhaustive, none** | 1-echo doorstop route | **Yes** (Door B needs both plates) |
| 3 | 2 / 2 | k=0,1: deep(3); k=0: wide(2) | **exhaustive, none**; k=1 wide(2) budget-limited (900 s, none) | crate-free 2-echo route: searched deep(3) exhaustively, **none** | - |
| 4 | 2 / 3 | k=0,1: deep(3) and wide(2) | **exhaustive, none** | none | - |
| 5 | 2 / 3 | k=1: deep(3) and wide(2) | **1-echo solutions exist** | one echo presses Drive, then walks to Gate | **No, flagged (see 3.1)** |
| 6 | 3 / 3 | k=0,1,2: deep(2); k=0,1: wide(1) | **exhaustive, none**; k=2 wide(1) budget-limited (900 s, none) + body count | 2-echo "doorstop" route | **Yes** (Core Door also needs the Hall Plate) |
| 7 | 2 / 2 | k=0,1: deep(3); k=0: wide(2) | **exhaustive, none**; k=1 wide(2) budget-limited (480 s, none) | 2-echo routes without a blind recording: deep(3) budget-limited (480 s), **none** | - |
| 8 | 1 / 1 | k=0: final run of 3 steps, every wait | **exhaustive, none** | wins with the Recursion Engine off: 1 echo × 2 steps, every wait, **exhaustive, none** | - |
| 9 | 2 / 2 | k=0,1: deep(3); k=0: wide(2) | **exhaustive, none**; k=1 wide(2) budget-limited (480 s, none) | none (no separate cheese set; every find solution uses a blind recording) | - |
| 10 | 3 / 3 | k=0,1,2: 2 steps per echo, live | k=0,1 **exhaustive, none**; k=2 budget-limited (480 s, none) + body count | 2-echo route: the Courier walks back out of the Reliquary | **Yes** (gate seals once the socket is powered) |
| 11 | 1 / 2 | k=0: final run 4 steps no waits; 3 steps every wait | **exhaustive, none** | doorstop / walk-back: none (nothing ever closes; the valve forbids walking back up) | - |
| 12 | 1 / 1 | k=0: final run 3 steps; 2 steps every wait | **exhaustive, none** | relay bypass (`relayBypassed`): none; budget-limited at 600 s | - |
| 13 | 2 / 3 | k=0,1: deep(2) and wide(1); k=0: deep(3)/wide(2) | **exhaustive, none**; k=1 deep(3)/wide(2) budget-limited (1200 s, none) + valve-directed distance (N→S 10.8 s > 5 + 2.5 s) | walk-back impossible by valves; relay bypass none (600 s budget) | - |
| 14 | 1 / 2 | k=0: exhaustive | **exhaustive, none** | 1 echo × 2 steps, every wait: **exhaustive**, nothing skips the lesson | - |
| 15 | 2 / 2 | k=0,1: deep(3); k=0: wide(2) | **exhaustive, none**; k=1 wide(2) budget-limited (1200 s, none) + keys/body count | shortest (glass) route fails on replay (teaching check `noShatter`); 2-echo cheese hunt budget-limited (300 s, none) | - |
| 16 | 2 / 2 | k=0,1: deep(2) and wide(1); k=0: deep(3)/wide(2) | **exhaustive, none**; k=1 deep(3)/wide(2) budget-limited (600 s, none) + body count and edge argument | doorstop / walk-back / relay bypass: none (600 s budget) | - |
| 17 | 2 / 2 | k=0,1: deep(3) | **exhaustive, none**; k=1 wide(2) budget-limited (300 s, none) | a 7.9 s route with no valve involved (copy holds a second plate) | **Yes** (designer B: Non-return Flap valve, plates ≥ 7.5 s apart, Head Plate pocket, teaching check) |
| 18 | 3 / 3 | k=0: exhaustive; k=1,2: budget-limited (300 s each, none) | k=0 **exhaustive, none**; k=1,2 + body count (as for L10) | none found; open search budget-limited, intended plan verified as a plan | - |

"Find" evidence (the vocabulary is expressive enough for the proofs to mean something): the solver rediscovers a
verified intended-count solution for every level from L01 to L09, usually faster than the authored one (L03 8.6 s vs
9.8 s, L05 9.4 s vs 11.4 s, L07 10.9 s vs 12.6 s, L08 14.3 s vs 19.8 s, L09 12.3 s vs 14.8 s). For L10 the
open search runs out of budget; the intended plan is checked as a plan of the vocabulary instead (`plan` in
`levelConfigs.ts`).

## 3. Cheese

### 3.1 L05 Perfect Timing: one echo is enough (OPEN, flagged for the product owner)

The solver's 1-echo routes (verified through `TemporalGame`):

* `Echo 1: wait 1 s, press Drive Switch, press Gate Switch. Final: exit.` Completes at 9.42 s.
* `Echo 1: press Gate, press Drive, press Gate. Final: exit.` Completes at 12.02 s (the first Gate press is wasted).

Why: the intended solution is **sequential**, not simultaneous. Echo 1 presses Drive at 5 s, Echo 2 presses Gate at
9.3 s, and the Drive Switch is already dark by then. The walk Drive to Gate takes about 3.8 s, and the island door has
**no deadline**: the player can stand in front of it for as long as they like after the ferry lands. So one body can
always do both jobs in turn.

Tried this round and rejected: a partition wall across the hall (row 6, gap at the dock) that makes the walk Drive to
Gate about 7 s. The intended solution still works (Drive at 6 s, Gate at 10.3 s), but the cheese survives: the player
simply waits longer on the island. No layout tweak alone can fix this. A real fix needs a **deadline on the island
side**. Options, none implemented (they all change the feel of the level and need a playtest):

1. **No island to wait on.** The door sits at the ferry's far end, and the Drive Switch lasts longer than one round trip
   (e.g. 8 s), so a ferry that isn't left during its 0.5 s dock pause carries the rider back. The Gate press must
   then land inside a window of about 2.5 s around the docking. One body cannot cover both, because the walk is
   longer than the window. This is the cleanest fix, but it is the biggest change in difficulty: the tightest window
   goes from 4 s to about 2.5 s plus a step-off timing.
2. **AND the door with the Drive Switch** (wire `switch-drive -> door-island` as a second input) and shorten the ride
   so the door can only be passed while the ferry still has charge. This also needs the ferry speed retuned.
3. **Keep it, and make it a lesson:** state the 1-echo route as the "efficiency" goal for L05 (see 6). Zero risk, and
   the level still teaches platforms, windows and scheduling. One echo just schedules two moments instead of two
   echoes scheduling one each.

Recommendation: option 3 now, option 1 if the playtest shows L05 reads as "too easy for its slot". The
behaviour is pinned by the campaign test "KNOWN, flagged ... ONE echo can press the Drive Switch and then the Gate
Switch". Par stays 15 s; it is derived from the fastest legal 2-echo completion (9.43 s), which uses the same trick.

### 3.2 Fixed this round (layout/wiring tweaks; intended solutions unchanged)

* **L02 Two Places at Once, the doorstop route (1 echo).** You stood in the Atrium doorway while your only echo walked
  off Plate A, through the door you were holding, and out to Plate B. **Fix:** Door B needs both plates (one wire plus
  a conduit decor), so the minimum is a plain body count.
* **L06 Chain Reaction, the doorstop route (2 echoes).** A door never closes on a body. One echo stood in the Lab
  doorway while the Hall Plate echo walked in blind and became the Vault Plate holder. **Fix:** the Core Door also
  needs the Hall Plate (one extra wire plus a conduit decor). The body count is now airtight: Hall Plate, Vault Plate
  and a recent switch press from more than 2 s away, all at once. Regression test: "the doorstop route is closed".
* **L10 The Core, the Courier walks back out (2 echoes).** The Courier's blind recording left through the open echo
  gate and pressed the East Timer itself. **Fix:** inverted wire `socket-reliquary -> gate-reliquary`, so the
  Reliquary seals once the cell is in. Regression test: "the Reliquary seals behind the Courier".
* Goldens re-blessed for all three: the hashes change because the wiring changed, not the solutions (both complete on the
  same tick as before). The L05 golden was re-blessed for its par/hint metadata only: every per-tick hash is identical.

### 3.3 Searched and clean (no cheese within bounds)

* **L03:** no 2-echo route leaves the crate off both plates (deep(3), exhaustive). The crate lesson holds.
* **L07, L09:** no 1-echo route. Every 2-echo solution the solver found records an echo blind. The search for 2-echo
  routes *without* a blind recording in L07 ran out of budget at 480 s with none found; that is evidence, not a proof.
* **L08:** no route wins with the Recursion Engine switched off (exhaustive within 1 echo × 2 steps, every wait). The
  nested loop is required.
* **L10:** no route with 0 or 1 echo (exhaustive). The 2-echo search ran 480 s without finding anything; together with
  the body count (two timer hands 6.7 s apart, plus a sealed Courier) it supports 3. The intended plan is verified as
  a plan of the vocabulary (completes at 17.78 s). The `usesBlindEcho` check reports a false positive on that plan,
  because the plan check walks live and the gate only blocks the live player in-game. Ignore it.
* Budget-limited rows are the honest limit of a 4-CPU box shared with other teams. Re-run them with
  `npm run solve -- L07 --kinds=proof --budget=3600` on a free machine to try to make them exhaustive.

## 4. Timing slack (intended solution, `--slack`)

Each `waitUntil`/`wait` value of the authored solution is swept while everything else stays fixed. The width is the
range of values that still wins, counted from the moment the actor arrives. Closed-loop steps (pushing at a door)
adapt by themselves and have no parameter.

| # | Tightest window | Notes |
|---|---|---|
| 1, 2 | none | no timed step; any timing works |
| 3 | 656 t (10.9 s) | very loose |
| 4 | 815 t (13.6 s) | very loose |
| 5 | **239 t (4.0 s)** | Echo 1's Drive press; the player's step-off has 413 t |
| 6 | **217 t (3.6 s)** | Echo 2's first Relay press (for Echo 3's vault entry) |
| 7 | 620 t (10.3 s) | loose; the difficulty is conceptual (blind recording) |
| 8 | 800 t (13.3 s) | loose; the difficulty is conceptual (nested loop) |
| 9 | 676 t (11.3 s) | loose; conceptual |
| 10 | **162 t (2.7 s)** | Ferryman's West Timer press; also 260 t, 281 t, 410 t windows |
| 11 | 813 t (capped) | loose; the difficulty is the commitment (valve) |
| 12 | 721 t (capped) | loose: the bell hold works anywhere from 0 to 12 s |
| 13 | **271 t (4.5 s)** | both timer hands |
| 14 | **243 t (4.05 s)** | the echo's console press vs your seal hold |
| 15 | **213 t (3.55 s)** | the twin-timer schedule on the long (glass-free) route |
| 16 | 384 t (6.4 s) | Echo 2's Hall Plate hold |
| 17 | **172 t (2.87 s)** | the 5 s brake window (copy turned back by the braked valve) |
| 18 | 311 t (5.2 s) | one constrained window (the relayed console press); designer kept 1 window, not ~3, to hold the model score at 11.1 |

No window is under 2.5 s (the round-6 bar), the tightest being L10's 2.7 s and L17's 2.87 s. L10 has four constrained
moments and is the timing peak: **flagged for playtest**.

## 5. Playtime and difficulty model

`src/testing/solver/difficulty.ts`, table via `npm run solve -- all --difficulty=<find.json>`. Inputs are measured on
the verified intended solution through the real simulation. Assumptions (seconds), each a guess to be replaced by
playtest data:

* Orientation (intro, fly-through, looking around): 25. Thinking: 25 per loop, 15 per meaningful interaction, 35 per
  constrained timing window (< 10 s wide), 12 per new idea taught; plus 120 if an echo must be recorded blind and 90
  for nested loops.
* One full attempt = all recordings back to back plus 4 s overhead per loop.
* Attempts = 1.5 + 0.5 per loop beyond 2 + 0.75 per constrained window (+1 if a window is under 3 s).
* Median = thinking + attempts × attempt length. Low = 0.5 × median (puzzle fans), high = 2.2 × median (first-timers
  who get stuck). The hint system caps the high end in practice.
* **Par** = fastest verified completion × 1.25 + 3 s, rounded up. **Hints:** the first at 0 s, the last (the full
  recipe) at 30 % of the median, the rest evenly spaced between, rounded to 5 s and at least 15 s apart. 0.3 is the
  average ratio of the round-4 hand-set delays to this model's medians, so the overall hint pace stays the same; only
  the per-level spacing becomes consistent. (The HUD also unlocks a hint every 3 failed attempts.)

| Order | Id | Loops | Interactions | Constrained windows | Blind / nested | Score | Est. minutes low–high (median) | Best / authored s | Par s | Hint delays s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | L01 | 2 | 0 | 0 |  | 3.6 | 1.2-5.4 (2.5) | 4.77 / 4.77 | 9 | 0/20/45 |
| 2 | L02 | 3 | 0 | 0 |  | 4.3 | 1.7-7.3 (3.3) | 8.05 / 8.05 | 14 | 0/30/60 |
| 3 | L03 | 3 | 3 | 0 |  | 5.4 | 2.4-10.3 (4.7) | 8.60 / 9.77 | 14 | 0/30/55/85 |
| 4 | L04 | 3 | 0 | 0 |  | 4.3 | 1.9-8.2 (3.7) | 12.88 / 13.38 | 20 | 0/35/65 |
| 5 | L11 | 2 | 2 | 0 |  | 3.7 | 1.5-6.5 (2.9) | 10.62 / 12.33 | 17 | 0/25/55 |
| 6 | L05 | 3 | 2 | 2 |  | 7.6 | 3.2-14.1 (6.4) | 9.43 / 11.38 | 15 | 0/60/115 |
| 7 | L06 | 4 | 1 | 1 |  | 6.8 | 3.3-14.3 (6.5) | 12.27 / 12.27 | 19 | 0/60/115 |
| 8 | L12 | 2 | 1 | 0 |  | 5.6 | 2.6-11.4 (5.2) | 18.98 / 19.00 | 27 | 0/45/95 |
| 9 | L13 | 3 | 2 | 2 |  | 9.2 | 5.2-22.7 (10.3) | 23.65 / 25.47 | 33 | 0/60/125/185 |
| 10 | L07 | 3 | 1 | 0 | yes | 6.5 | 3.2-14 (6.3) | 10.88 / 12.62 | 17 | 0/55/115 |
| 11 | L14 | 2 | 1 | 1 | yes | 6.9 | 2.7-12 (5.4) | 6.28 / 6.83 | 11 | 0/50/100 |
| 12 | L08 | 2 | 0 | 0 | nested | 4.9 | 2.3-10 (4.6) | 14.30 / 19.80 | 21 | 0/40/80 |
| 13 | L15 | 3 | 2 | 2 |  | 7.4 | 3.5-15.4 (7) | 12.52 / 13.73 | 19 | 0/65/125 |
| 14 | L09 | 3 | 0 | 0 | yes | 6.5 | 3.1-13.5 (6.2) | 12.33 / 14.78 | 19 | 0/55/110 |
| 15 | L16 | 3 | 0 | 1 |  | 8 | 3.8-16.8 (7.7) | 17.88 / 17.88 | 26 | 0/45/90/140 |
| 16 | L17 | 3 | 0 | 2 | nested | 9.4 | 4.7-20.8 (9.5) | 16.77 / 17.70 | 24 | 0/85/170 |
| 17 | L18 | 4 | 4 | 1 | yes | 11.1 | 6.5-28.8 (13.1) | 27.23 / 27.48 | 38 | 0/120/235 |
| 18 | L10 | 4 | 6 | 4 | yes | 15.2 | 8.4-36.9 (16.8) | 17.73 / 17.73 | 26 | 0/100/200/300 |

**Total (round 6, 18 chambers): 61–268 min, median ≈ 122 min** (round 5, 10 chambers: 31–134, median ≈ 61). The eight
new chambers add ≈ 61 min of model median (L11 2.9, L12 5.2, L13 10.3, L14 5.4, L15 7.0, L16 7.7, L17 9.5, L18 13.1),
inside the planned +55–75 min. Run: `npm run solve -- all --difficulty=<find.json>` on the integrated campaign, with
the fastest verified completions merged from the round-5 find run and the round-6 designers' and director's find runs
(L11 and L15 re-found by the director: 10.60 s and 12.50 s). Every par time and hint delay in the level files equals the
model's output ("old -> model" matches on all 18 rows). The round-6 model adds +35 s per press that lands more than
3 s later and +60 s for any chamber with a relay (`difficulty.ts`). L10 (score 15.2) is still the campaign maximum;
the highest new chamber is L18 at 11.1. Round-5 note kept below: the model ignores the menu, the story cards and
replaying levels for stars.

Model observations (all **need playtest**):

* **The curve is not monotonic.** L04 (4.3) scores below L03 (5.4), and L08 (4.9) below L07 (6.5). Both dips are
  deliberate breathers after a new idea: L04 reuses L03's "be there before the moment" in a vertical space, and L08's
  difficulty is the nested-loop insight, which the model prices at a flat 90 s. Round 6 adds planned breathers: L11
  (3.7, the valve introduction) after L04, L12 (5.6) after L06's 3-echo chain and L14 (6.9) after L07. From L15 on the
  scores climb to the end (7.4, then L09 6.5 as the one exception, 8.0, 9.4, 11.1, 15.2). L11 scores below its 4.5 slot
  and L13 (9.2) above its 6.5 slot: both **need playtest**.
* **L10 is about 2.5× any round-5 chamber** (median 17 min; ~27 % of the round-5 campaign, ~14 % of the round-6 one).
  L18 (13.1 min) now sits just before it as the penultimate exam. Expected for a finale, but the
  high-end estimate (37 min) is a frustration risk.
* **L05 is likely over-scored**, because the model measures the authored 2-echo solution, not the 1-echo cheese.

## 6. Optional challenge variants (proposal, not implemented)

The median is at the bottom of the target, so here are three cheap, data-driven ways to add replay time without new
levels. Each reuses existing fields (`parEchoes`, `parTimeSeconds`, the stars) and the solver's verified bests:

1. **Efficiency goal (fewer echoes).** Allowed where the solver shows a cheaper solution exists within the limit, or
   where `maxEchoes > parEchoes`: L05 with 1 echo (verified, 9.4 s), and L01/L02/L04 as "no spare echo" (already
   expressed by the echo star). Data: a new optional `challengeEchoes` per level, which the solver verifies as
   solvable.
2. **Speedrun goal.** A "gold" time = the solver's fastest verified completion + 10 % (L08 14.3 s against the
   authored 19.8 s is a nice target). Data: `goldTimeSeconds`, generated by the same formula as par.
3. **No-hint clear.** Track whether any timed hint was shown; it costs nothing in level data.

Not implemented: each needs UI and save-format work outside this role's ownership. Item 1 for L05 is the natural
partner of option 3 in section 3.1.

## 7. Levels flagged for playtest attention

* **L05**: the 1-echo route (section 3.1) and whether it reads as too easy; the hint pace (60 s / 115 s) is derived
  from a model that over-scores it.
* **L06**: the tightest window in the first half of the game (3.6 s on Echo 2's first press).
* **L07, L09**: blind recording is priced as a flat 120 s "insight" cost; real players may need far longer, or far less.
* **L08**: the model's cheapest late chamber; check that the nested-loop idea lands without the third hint.
* **L10**: about 27 % of the round-5 campaign (14 % of round 6); four timing constraints, the tightest 2.7 s; first hint at 100 s.
* **Round 6 chambers** (nobody has played them): L13's forced lap after entering the ring and L16's second ring of the
  Hall Plate to leave (designer A); L17's 2.87 s brake window and the "same recording, both sides of the valve" idea;
  L18's one constrained window (the plan asked for about three; the designer kept the model score at 11.1 instead);
  L15 and L18's glass galleries are 1-tile corridors behind thick walls, so the glass seal is hard to see from the
  follow camera (director screenshots).
* **Campaign length** (round 5 note; round 6 brings the median to 122 min, the middle of the target): the first playtest should time real
  sessions per chamber to recalibrate the coefficients in `difficulty.ts`.
