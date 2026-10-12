# RECURSION: Round-6 Chambers, Designer A (valve and relay track)

> **Integrated (director, round 6):** these chambers are in `CAMPAIGN_LEVELS` at their planned positions; their goldens
> moved to `src/testing/replays/` (the round6-a/round6-b replay sub-suites were removed). Story lines over 110
> characters were shortened (L15, L16, L17, L18); the level files hold the final text. The registration notes below are
> historical.

Owner: level designer A (round 6). Chambers: **L11 The Sump**, **L12 Late Light**, **L13 Roundabout**, **L16 Afterimage**.
Source of truth: `src/levels/definitions/L11-the-sump.ts`, `L12-late-light.ts`, `L13-roundabout.ts`, `L16-afterimage.ts`
(each carries an ASCII map in its header comment). They are collected, in campaign order, in
`src/levels/definitions/round6-a-levels.ts` (`ROUND6_A_LEVELS`) for the director to add to `CAMPAIGN_LEVELS`; each
level's `order` already holds its planned campaign position (5, 8, 9, 15).

Verification: `src/levels/round6-a.test.ts` (the L01-L10 bar from `campaign.test.ts` plus each chamber's minimum-echo
strategies, cheese hunts and the solver's machine teaching check), golden replays in `src/testing/replays/round6-a/`
(checked by `src/testing/replays/round6-a.test.ts`), solver configs in `src/testing/solver/levelConfigs-round6-a.ts`
(`npm run solve -- L11` etc. find them through `cli.ts`).

**Director, when registering:** add the four levels to `CAMPAIGN_LEVELS` in campaign order, then move each golden from
`src/testing/replays/round6-a/` up to `src/testing/replays/` (or run `npm run replays:update`); `round6-a.test.ts`
skips any chamber that is already in `LEVELS`, and its orphan check tells you if a file was left behind.

New components used: `checkValve` (fixed only; reversible valves are designer B's L17) and `chronoRelay`. No attuned
or glass devices. L11-L13 use no inverted wire (first taught in L09); L16 (after L09) does.

## Summary

| Order | Chamber | New idea | Echoes min / limit / par | Par time (best verified) | Model score | Est. minutes (median) | Tightest window |
|---|---|---|---|---|---|---|---|
| 5 | L11 The Sump | check valve: passing is permanent; give the one who commits its other job first | 1 / 2 / 1 | 17 s (10.6 s) | 3.7 | 1.5-6.5 (2.9) | none |
| 8 | L12 Late Light | chrono relay: act now for an effect 6 s later | 1 / 1 / 1 | 27 s (19.0 s) | 5.6 | 2.6-11.4 (5.2) | none (bell hold 0-12 s all work) |
| 9 | L13 Roundabout | relay + one-way ring: two hands 5 s apart, timed to your lap | 2 / 3 / 2 | 33 s (23.6 s) | 9.2 | 5.2-22.7 (10.3) | **271 t (4.5 s)**, both hands |
| 15 | L16 Afterimage | relay + inverted wire + valve: "held 6 s ago AND empty now" | 2 / 2 / 2 | 26 s (17.9 s) | 8.0 | 3.8-16.8 (7.7) | 384 t (6.4 s), Echo 2's hold |

Model (`npm run solve -- L11 L12 L13 L16 --difficulty=<find.json>`, same coefficients as round 5 plus the round-6 relay
terms): **13-57 min for the four chambers, median 26 min** (L11 2.9, L12 5.2, L13 10.3, L16 7.7). Every model score
is below L10's 15.2 (the finale stays the campaign maximum). Par times and hint delays in the level files equal the
model's output. Best verified times are the solver's (L11, L12, L13) or the authored solution (L16, faster than the
solver's 18.95 s).

| # | loops | interactions | walk s | record s | constraints | tightest t | score | est. min (median) | best / authored s | par | hints |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L11 | 2 | 2 | 17.7 | 23.3 | 0 | 813 (capped) | 3.7 | 1.5-6.5 (2.9) | 10.62 / 12.33 | 17 | 0/25/55 |
| L12 | 2 | 1 | 34.7 | 37.2 | 0 | 721 (capped) | 5.6 | 2.6-11.4 (5.2) | 18.98 / 19.00 | 27 | 0/45/95 |
| L13 | 3 | 2 | 47.5 | 66.6 | 2 | 271 | 9.2 | 5.2-22.7 (10.3) | 23.65 / 25.47 | 33 | 0/60/125/185 |
| L16 | 3 | 0 | 25.9 | 40.9 | 1 | 384 | 8.0 | 3.8-16.8 (7.7) | 17.88 / 17.88 | 26 | 0/45/90/140 |

(L12 and L16 also pay the round-6 terms: +60 s relay insight and +35 s per delayed press, two each.)

---

## L11 The Sump (order 5) *"Whatever goes down stays down."*

* **Teaching goal:** the check valve. A valve lets bodies (and what they carry) through one way and never back, so
  passing is a commitment. Plan who commits, and give that echo every other job before it goes down.
* **Layout and story:** Chronometry Lab, the Sump. A hall with a crate Store in its north-west corner (the Store Door
  opens only while the Store Plate, 7 tiles away by the valve, is held), the Sump Valve in the east wall, and the sump
  behind it with the Pump Plate (bodies only). The Hall Plate sits 5 tiles from the Exit Door, which needs the Pump
  Plate AND the Hall Plate. Pistons, a cyan abyss light in the sump, a "ONE WAY DOWN" hologram.
* **Story:** "Chronometry Lab — The Sump." / "The sump valve turns one way only. Whatever goes down stays down, so send it
  down last." / "LOG 036 · Pumped the sump dry again. Somebody was already standing at the bottom. Same coat as mine. —
  H.A." (036 sits between L04's 033 and L05's 041.)
* **Hints:** (1) the Exit Door needs both plates; the Pump Plate counts bodies only; (2) the valve only turns inward,
  give that echo its other job first, a crate carried down never comes back; (3) the full recipe.
* **Intended solution (1 echo):** Echo 1 stands on the Store Plate for 5 s, then walks through the valve onto the Pump
  Plate and stays (it has no choice). You walk into the open Store, take the crate, put it on the Hall Plate and walk
  out. Completes at 12.3 s.
* **Lesson beats (tested):** an echo recorded straight into the sump first leaves the Store shut and the crate out of
  reach (the natural first recording has to be redone with the Store job first); the crate carried down and dropped on
  the Pump Plate does nothing and is lost (you are sealed in with it); the echo's walk-back inputs replay against the
  valve; alone the Store closes behind you before you reach it.
* **Why 1 (body count):** at the win somebody stands on the Pump Plate, sealed in the sump, and you stand at the exit,
  outside it. The Exit Door has no deadline and the pump holder can never leave, so no doorstop exists. Standing on the
  Hall Plate yourself and running for the door fails (5 tiles; the door shuts in 0.1 s).
* **Teaching check:** `endsDownstream(echo)` for `valve-sump`.
* **Solver:** rediscovers the intended plan (`stand plate-store -> +180t stand plate-pump`; final `pick crate-store ->
  drop-on plate-hall -> exit`, 10.6 s; the find job is exhaustive within its task list). k=0 exhaustive with a 4-step
  final run (no waits) and a 3-step final run (every wait). Cheese (1 echo, 2 + 2 steps, every wait, blind): no
  teaching violation in 600 s (budget-limited; structurally impossible anyway, since the pump holder can only be an
  echo and it is downstream of the valve).

## L12 Late Light (order 8) *"Ring it now. It answers later."*

* **Teaching goal:** the chrono relay ("Echo Line"): its output is its input, 6 s later, waveform and all. Your past
  opens doors for your future, so act before you need it.
* **Layout and story:** Machine Hall, the Echo Line. Beat 1 (solo, reads the tube): the Bell Console (a 2 s timed
  switch) feeds the Gallery Door through Echo Line A (6 s). The door is a 4.6 s walk from the console: a direct wire
  would shut 2 s after the press; through the line it opens as you arrive and stays open for the 2 s you rang it.
  Beat 2 (body count): the Exit Door needs Echo Line B (the Bell Plate, 6 s late) AND the Lamp Plate. Bell to Lamp is
  3.3 s of walking; Bell to the Exit Door is 7.9 s. Holograms "LINE A 6 s" / "LINE B 6 s" label the two tubes.
* **Story:** "Machine Hall — The Echo Line." / "The line remembers. Ring the bell now, and the doors will hear it six
  seconds from now." / "LOG 055 · The line delivers my own footsteps six seconds late. I have started walking ahead of
  them. — H.A." (055 sits between L06's 052 and L07's 060, before L13's 058.)
* **Hints:** (1) the tubes repeat what they are told 6 s later, and the Exit Door needs the Bell Line and the Lamp Plate
  at once; (2) the lamp is close enough to the bell, the door is not; (3) the full recipe.
* **Intended solution (1 echo):** Echo 1 presses the console, waits at the Gallery Door and passes when the line opens
  it, stands on the Bell Plate for 2 s, then walks to the Lamp Plate and stays. You follow it through the Gallery Door
  and wait at the Exit Door; its own bell arrives while it holds the lamp, and you walk through. Completes at 19.0 s.
* **Why 1 (body count):** at the opening someone holds the Lamp Plate and you are in the doorway; the bell must have been
  rung 6 s earlier by someone who can be on the Lamp Plate (3.3 s away) or in the doorway (7.9 s away) by now: only the
  lamp holder can. Tested: alone (bell, lamp, then run) fails; you on the bell with the echo on the lamp fails even
  though the door does open. **Limit 1** keeps out the trivial two-plate-holder plan.
* **Teaching check:** `relayUsed` + no `relay-bypass` for `relay-bell` (the Exit Door opens while the Bell Plate is
  empty; tested directly too).
* **Solver:** rediscovers the plan (`press switch-bell -> stand plate-bell -> stand plate-lamp`, final `exit`, 18.97 s;
  even a brief touch of the Bell Plate works, because you wait at the door). k=0 exhaustive (3-step final run without
  waits; 2-step final run with every wait). Cheese (1 echo x 3 steps, live, every fixed and relay wait): no solution
  that bypasses the relay in 600 s (budget-limited; with one echo the Bell Plate is necessarily empty at the win).

## L13 Roundabout (order 9) *"Every road here runs one way, and so does every second."*

* **Teaching goal:** reinforce relay + valve: timing across one-way geometry.
* **Layout and story:** Machine Hall, the Roundabout. A ring corridor runs clockwise round the Crown; four fixed valves
  make it one-way and the Entry Valve from the west hall is one-way too. The Crown Door needs the North Timer, through
  the 5 s Crown Line, AND the South Timer, at once. Both timers are 2.5 s consoles that cannot be held on (no
  retrigger, 1.5 s cooldown). The Entry Valve drops you into the ring just past the Crown Door, behind the West Valve:
  the door is right there and you cannot go back to it. A clockwork ring hangs over the Crown; holograms read
  "CLOCKWISE ONLY" and "N +5 s = S".
* **Story:** "Machine Hall — The Roundabout." / "The ring turns one way, and so does the line. Whoever rings north rings
  five seconds into the future." / "LOG 058 · Ran the ring to catch my own signal. Lapped myself twice. We waved.
  Neither of us stopped. — H.A."
* **Hints (4):** (1) the door's wiring and the clockwise ring; (2) no single runner can line up the pulses, and the door
  is too far from either timer for you; (3) you enter past the door and must run a lap, so time the hands to your
  arrival, South 5 s after North; (4) the full recipe with times.
* **Intended solution (2 echoes):** Echo 1 enters and presses the North Timer at 17.5 s. Echo 2 runs clockwise round the
  east side and presses the South Timer at 22.6 s, as the delayed North pulse arrives. You run the full lap (about
  19 s) and wait at the Crown Door from 20.8 s, and walk in on the overlap. Completes at 25.5 s.
* **Why 2 (valve-directed distance):** the South press must land 2.5-7.5 s after the North press (in practice 3.5-6.5 s
  so the door is open long enough to step in). The only route North to South is clockwise, 26 tiles (10.8 s), so one
  body cannot do both; South-then-North never works (North must come first). Neither hand can be you: the door is 5 s
  clockwise of the South Timer (window 2.5 s) and 15.8 s from the North Timer (the delayed window closes 7.5 s after
  the press). Tested: one echo doing both, you as either hand, the valve that hides the door, no counter-clockwise
  route, and mashing a timer never keeps it on.
* **Teaching check:** `relayUsed` + no `relay-bypass` for `relay-crown`.
* **Solver:** rediscovers a 2-echo plan (Echo 1 `+600t press timer-north -> press timer-north -> ...`, Echo 2 walks to
  South and presses it when the delayed pulse is due; final `exit`, 23.65 s, faster than the authored 25.5 s). k=0 and
  k=1 exhaustive at deep(2) and wide(1); k=0 also exhaustive at deep(3) / wide(2); k=1 at deep(3) / wide(2) budget-limited (1200 s each, none found). Cheese (2 echoes x 2 steps, live):
  nothing that bypasses the relay in 600 s (budget-limited; the timers cannot be held on, tested).

## L16 Afterimage (order 15) *"The plate remembers you after you leave."*

* **Teaching goal:** combine the relay, the inverted wire (L09) and the valve: memory. "Held 6 s ago AND empty now."
  A deliberate second answer to L09's room: a time offset instead of delete-and-re-record.
* **Layout and story:** Paradox Wing, the Afterimage. L09's room shape (reading room, vault, spire, hall). Vault Door =
  Hall Line (the Hall Plate, 6 s late) AND NOT Hall Plate AND Reading Plate. Spire Door = Vault Plate AND Reading Plate
  AND Hall Line. Behind the Vault Door the one-way Vault Valve seals whoever goes in, and the vault winds 14 tiles to the
  Vault Plate at its far end. Coral (inverted) and teal conduits, a violet clockwork ring over the exit, a "THEN, NOT
  NOW" hologram.
* **Story:** "Paradox Wing — The Afterimage." / "The line remembers who stood on the plate. The vault opens for someone
  who was here and is gone." / "LOG 092 · The plate still feels my weight six seconds after I step off. The vault
  believes it. Some days so do I. — H.A." (092 follows L09's 089.)
* **Hints (4):** (1) the Vault Door's three inputs; (2) an echo that stays on the Hall Plate keeps the vault shut, the
  line remembers you for 6 s after you step off; (3) the ringer should be the one who enters, and the Spire Door wants
  the line too, so ring it again on the way out; (4) the full recipe.
* **Intended solution (2 echoes, every loop recorded live, oldest first):** Echo 1 walks to the Reading Plate and stays.
  Echo 2 stands on the Hall Plate for 4 s, steps off and walks to the Vault Door (2.5 s), which opens as it arrives,
  through the valve and along the vault onto the Vault Plate. You ring the Hall Plate once Echo 2 is in, step off, wait
  at the Spire Door (2 s away) and walk through when your own afterimage arrives. Completes at 17.9 s.
* **Why 2 (body count + edge argument):** at the win the Vault Plate is held by someone sealed in the vault, the Reading
  Plate by someone in the reading room, and you stand at the exit: three bodies. The Hall Plate must have been held
  about 6 s before the vault opened and be empty when it does, so nobody can simply stand on it, and the reader cannot
  have rung it (8.8 s from the Reading Plate). The vaulter's own afterimage fades 2 s before it reaches the Vault Plate
  (8.3 s walk), so the exit needs your own ring. Tested: an echo that stays on the plate, a body that never rang it,
  the reader ringing it first, turning back at the valve, and both one-echo variants.
* **Teaching check:** `relayUsed` + no `relay-bypass` for `relay-hall`, and an echo ends downstream of `valve-vault`.
* **Solver:** rediscovers the plan (Echo 1 `stand plate-reading` (it walks over the Hall Plate on the way, harmlessly),
  Echo 2 `stand plate-hall -> +180t stand plate-vault`, final `+600t stand plate-hall -> exit`, 18.95 s). k=0 and k=1
  exhaustive at deep(2) and wide(1); k=0 also exhaustive at deep(3) and wide(2); k=1 at deep(3) and wide(2)
  budget-limited (600 s each, none found). Cheese (2 echoes x 2 steps + 1 final step, live): no teaching violation in
  600 s (budget-limited).

---

## Solver bounds and results

Same notation as `difficulty-report.md`: `deep(n)` = up to n tasks per echo, no fixed waits, live walking only;
`wide(n)` = up to n tasks per echo, every wait (1 s, 3 s, the relay waits {delay, delay - 60} and the listed signal
edges), blind and live walking. Round 6 adds the relay waits to every vocabulary automatically (even `deep`). "BUDGET"
means the job ran out of time without a solution: evidence, not a proof; the body counts above cover what it does not.
Runs on the shared 4-CPU box (another designer's solver running alongside), 2 worker threads.

| Chamber | Find (intended count) | k | Bounds | Result |
|---|---|---|---|---|
| L11 | 1 echo x 2 steps + 2 final steps, plan tasks only: **10.62 s**, exhaustive | 0 | final run 4 steps, no waits | **exhaustive, none** (4 s) |
| | | 0 | final run 3 steps, every wait | **exhaustive, none** (47 s) |
| | cheese | 1 | 1 echo x 2 steps + 2 final steps, every wait, blind | no teaching violation, BUDGET 600 s |
| L12 | 1 echo x 3 steps, plan tasks only: **18.97 s** | 0 | final run 3 steps, relay waits only | **exhaustive, none** (56 s) |
| | | 0 | final run 2 steps, every wait | **exhaustive, none** (14 s) |
| | cheese | 1 | 1 echo x 3 steps, live, fixed + relay waits | no relay bypass, BUDGET 600 s |
| L13 | 2 echoes x 3 steps, timer tasks + `relay-crown` waits: **23.65 s** | 0, 1 | deep(2) | **exhaustive, none** (k=1: 137 s) |
| | | 0, 1 | wide(1), signals timers / relay / door | **exhaustive, none** (k=1: 46 s) |
| | | 0 | deep(3), wide(2) | **exhaustive, none** |
| | | 1 | deep(3), wide(2) | BUDGET 1200 s each, none (966 / 508 echo plans) |
| | cheese | 2 | 2 echoes x 2 steps, live | no relay bypass, BUDGET 600 s |
| L16 | 2 echoes x 2 steps + 2 final steps, plan tasks only: **18.95 s** | 0, 1 | deep(2) | **exhaustive, none** (k=1: 428 s) |
| | | 0, 1 | wide(1), signals doors / relay | **exhaustive, none** (k=1: 86 s) |
| | | 0 | deep(3), wide(2) | **exhaustive, none** |
| | | 1 | deep(3), wide(2) | BUDGET 600 s each, none |
| | cheese | 2 | 2 echoes x 2 steps + 1 final step, live | no teaching violation, BUDGET 600 s |

Every k below the intended count is also closed by the hand arguments (body counts, valve-directed distances) in each
chamber's section, which hold for every plan, not only plans of the vocabulary.

## Timing slack (`--slack`, via the difficulty table)

Every `wait` / `waitUntil` of the authored solutions swept with everything else fixed (`timingSlack`); width = the
range of values that still wins. No window is under 2.5 s.

| Chamber | Parameter | Authored | Works in | Width |
|---|---|---|---|---|
| L11 | Echo 1 holds the Store Plate (`wait`) | 300 t | 88 .. 900+ t | 813 t+ (capped) |
| L12 | Echo 1 holds the Bell Plate (`wait`) | 120 t | 0 .. 720+ t | 721 t+ (capped) |
| L13 | Echo 1 presses North (`waitUntil`) | 1050 | 919 .. 1189 | **271 t (4.5 s)** |
| L13 | Echo 2 presses South (`waitUntil`) | 1355 | 1216 .. 1486 | **271 t (4.5 s)** |
| L16 | Echo 2 holds the Hall Plate (`wait`) | 240 t | 2 .. 385 t | 384 t (6.4 s) |
| L16 | You start for the Hall Plate (`waitUntil`) | 600 | 459 .. 1200+ | 742 t+ (capped) |
| L16 | You hold the Hall Plate (`wait`) | 60 t | 0 .. 660+ t | 661 t+ (capped) |

Closed-loop steps (waiting at a door) adapt by themselves and have no parameter. Geometric margins that no parameter
measures: L12 Gallery Door, 3.5 s between arriving and the delayed window closing; L12 "you on the bell" fails by
1.9 s; L13 one-hand plan fails by 3.3 s; L16 vaulter's afterimage misses the Vault Plate by 2 s, the reader misses the
ring by 2.8 s.

## Cheese hunts

| Kind | L11 | L12 | L13 | L16 |
|---|---|---|---|---|
| Doorstop | none possible: nothing that opens ever needs to close again (pump holder sealed) | Exit Door opens only on the solution moment | Crown Door opens only on the overlap | Vault Door: holder is sealed behind the valve; Spire Door needs three inputs |
| Walk-back | impossible (valve; tested for player and echo) | n/a | impossible (valves; tested) | impossible (valve; tested) |
| Relay-bypass | n/a | impossible with 1 echo (Bell empty at the win); solver check | timers cannot be held on (tested); solver check | inverted wire forbids holding; solver check |
| k-1 echoes | k=0 exhaustive | k=0 exhaustive | see table | see table |
| Glass shortest route | n/a (no glass) | n/a | n/a | n/a |

## Playtest flags

* **L13** is the longest of the four (about 25 s per pass, three recordings) and the only one with a real scheduling
  window; the full lap after the entry may read as a trick the first time. Hint 3 says it outright.
* **L12** beat 1 relies on players reading the relay tube; the 6 s delay and the console's 2 s window are both visible
  on the timeline relay row.
* **L16**: the second ring (yours, to leave) is the new twist over L09; hint 3 names it.
* **L11** is the cheapest chamber in the model; it is the valve's introduction and sits where L04's breather sat.
