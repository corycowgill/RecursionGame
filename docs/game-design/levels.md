# RECURSION: Campaign Level Design (L01–L10)

Owner: Level Designer (Agent 6). Source of truth: `src/levels/definitions/L*.ts`, where every level carries an ASCII
map in its header comment. Machine verification: `src/levels/campaign.test.ts`, `src/levels/levels.test.ts`, the
golden replays in `src/testing/replays` and the QA fuzz/softlock suites in `src/testing/qa`.

## Design principles

1. **Introduce, reinforce, combine.** Each chamber adds one idea, then the next chamber leans on it. Levels 7–9 each
   twist *what an echo is*, and Level 10 asks for everything at once.
2. **The minimum is the lesson.** Where a level teaches cooperation, its echo minimum is proven in tests,
   usually by a body count: at the moment of the win, N bodies must be in N places that no one body can reach in
   time. Proofs are hand-written negative strategies plus geometry and timing arguments, backed since round 5 by a
   bounded macro-action solver (`npm run solve`, `src/testing/solver`; results in
   [`difficulty-report.md`](./difficulty-report.md)). **Doorstops count:** a door (or temporal gate) never closes on a
   body, so any body can hold a door it walked into. A body count only holds if it survives that.
3. **Readable cause and effect.** Every door, lift, laser and portal is wired to something you can see from the
   room it affects. Conduit decor runs from the trigger toward the target. Names in the HUD (`label`) describe
   the job: "Call Plate", "Gate Switch", "Reliquary Gate".
4. **Determinism first.** Every solution is a closed-loop `InputScript` compiled through the real engine. Each
   level has golden per-tick hashes, and its winning pass replays identically in pure re-simulation.
5. **Humane timing.** Every window has at least 0.5–1 s of slack over the scripted optimum. Since round 5 every par
   time comes from one formula: fastest verified completion (authored or solver) × 1.25 + 3 s, rounded up; hint
   delays are derived from the same playtime model (see [`difficulty-report.md`](./difficulty-report.md)).

## Difficulty curve

| # | Chamber | New idea | Echoes: min / limit / par | Par time (verified best) | Difficulty (1–10) |
|---|---|---|---|---|---|
| 1 | First Echo | record → rewind → echo holds a plate | 1 / 2 / 1 | 9 s (4.8 s) | 1 |
| 2 | Two Places at Once | echoes act simultaneously; chained doors | 2 / 3 / 2 | 14 s (8.1 s) | 2 |
| 3 | The Relay | carrying crates; timed switch; three loops | 2 / 2 / 2 | 14 s (8.6 s) | 3.5 |
| 4 | The Lift | elevators; vertical separation; boarding before the call | 2 / 3 / 2 | 20 s (12.9 s) | 4 |
| 5 | Perfect Timing | moving platform; switch windows + cooldown; scheduling two echoes against a ride | 2 / 3 / 2 | 15 s (9.4 s) | 5 |
| 6 | Chain Reaction | lasers & receivers; signal chains; 3-echo dependency chain | 3 / 3 / 3 | 19 s (12.3 s) | 6 |
| 7 | Broken Sequence | echoes replay inputs, not results; intentional "broken" recording; divergence as a tool | 2 / 2 / 2 | 17 s (10.9 s) | 7 |
| 8 | Recursive Machine | nested loop: one recording, two bodies 5 s apart | 1 / 1 / 1 | 21 s (14.3 s) | 7.5 |
| 9 | The Paradox Chamber | mutual dependency; delete and re-record an earlier loop; inverted wire | 2 / 2 / 2 | 19 s (12.3 s) | 8.5 |
| 10 | The Core | everything: echo-only gate, socket, laser, lift, ferry, crate, twin timers | 3 / 3 / 3 | 26 s (17.7 s) | 9.5 |

L01–L03 were authored by the gameplay engineer and kept as they are. They already ramp from 1 to 3.5, and L04 starts
just above L03 by reusing its "be in the right place before the moment" timing in a new, vertical space. No retune
was needed. Round 5's playtime model (solution complexity, not playtest data) estimates about 2.5–5 min per early
chamber and 4.5–17 min per late chamber: 31–134 min for the campaign, median about 61 min. Details and assumptions
are in [`difficulty-report.md`](./difficulty-report.md).

Component introduction order: plate, door and exit (L01) → crate, timed switch (L03) → elevator (L04) → moving
platform, cooldown (L05) → laser emitter and receiver (L06) → inverted wires (L09) → energy cell, socket and temporal
gate (L10). The finale uses all 12 kinds, and a test asserts that.

---

## L04 — The Lift  *"Somebody has to stay behind."*

* **Teaching goal:** the elevator component, and vertical spatial separation. Introduces the idea that you
  must already be *aboard* when an echo triggers the moment.
* **Layout and story:** the Freight Stack. A lower hall (h0) and an upper gallery (h2) separated by a railing, with one
  freight lift (signal mode, h0 to h2) in the south-west corner. The Call Plate sits alone in the far south-east of
  the hall. The Gallery Plate at the east end of the gallery opens the sanctum door. *"Whoever presses the call will
  watch the others rise without them."*
* **Objective:** ride the lift up and walk into the sanctum.
* **Echo limit / par:** 3 / 2 echoes, 20 s.
* **Hints:** (1) the lift climbs only while the Call Plate is held; (2) the caller can never ride, so someone
  must be aboard before the call; (3) Echo 1 calls, Echo 2 rides and holds the Gallery Plate, and you ride with Echo 2.
* **Intended solution:** Echo 1 walks to the Call Plate (it arrives at about 4.8 s). Echo 2 boards the lift first, rides
  up and walks to the Gallery Plate. You board with Echo 2 (actors don't collide, so you share the deck), ride up and
  walk through the open sanctum door.
* **Why 2:** the caller can't ride, and the gallery plate needs a body of its own while you enter (tests: "caller
  lifts you but nobody holds the plate"; "an echo rides up but whoever calls is left below"; "the lift sinks when
  the call is released").

## L05 — Perfect Timing  *"Two moments, one crossing."*

* **Teaching goal:** moving platforms, plus timed windows that can't be held open. You schedule two echoes against
  a fixed ride.
* **Layout and story:** the Ferry Deck. The exit sits on an island across a 6-tile abyss. The Ferry (a moving
  platform with `requiresSignal`) moves only while the Drive Switch is lit (4 s) and freezes mid-abyss when it runs
  out. The island door opens for 2.5 s from the Gate Switch in the far south-west. Both switches use
  `retrigger:false` with a cooldown, so you can't hold them on by mashing E.
* **Objective:** cross on the ferry and pass the island door.
* **Echo limit / par:** 3 / 2 echoes, 15 s.
* **Hints:** (1) the ferry moves only while the Drive Switch is lit; (2) you can't press it and still catch the
  ferry; (3) watch when the ferry lands and record the Gate Switch press for that moment.
* **Intended solution:** Echo 1 presses the Drive Switch at about 5 s. Echo 2 presses the Gate Switch as the ferry
  lands (about 9.3 s). You board before departure, ride across, step off and walk through.
* **Alternates:** any Drive time works as long as the Gate press follows about 3.8–5 s later. Echo 2 can be recorded
  after watching Echo 1's ferry cross empty.
* **Why 2:** the Drive Switch is about 4 tiles from a ferry that leaves 0.5 s after the press, and the Gate Switch is
  on the wrong side of the abyss (tests cover both, plus a test that mashing the switch only ever lights it once per
  window).
* **Round 5, open (flagged for the product owner):** the solver found that **one echo is enough**. The echo presses the
  Drive Switch, then walks to the Gate Switch (~3.8 s) and presses it, while you ride across. The island door has no
  deadline: you can wait in front of it, so a late Gate press always works (timing sweep: any press from 3.3 s after
  the Drive press works). No minimal tweak closes this; options are in `difficulty-report.md`. Pinned by the test
  "KNOWN, flagged ... ONE echo can press the Drive Switch and then the Gate Switch".
* **New mechanic:** `TimedSwitchConfig.cooldownTicks` (documented in contracts.md).

## L06 — Chain Reaction  *"Each of you is the reason for the next."*

* **Teaching goal:** lasers and receivers, multi-hop signal chains (one tick per hop), and a three-echo dependency
  chain in which each echo only becomes possible because of the previous one.
* **Layout and story:** the Optics Laboratory. Hall Plate → Lab Door. The Relay Switch fires Laser A (north) into
  Receiver A, which powers Laser B (east) into Receiver B. Receiver B opens the Vault Door and is one input of the
  Core Door. The Vault Plate is the Core Door's other input. The relay sits in the lab's west wing, away from every
  walking line. *"Light carries the signal. Bodies stop light."*
* **Objective:** light the relay and pass the Core Door.
* **Echo limit / par:** 3 / 3 echoes, 19 s.
* **Hints:** (1) follow the light; (2) the Hall Plate holder can never follow, and the switch presser can't reach the
  Core Door in time; (3) Echo 1 holds the plate, Echo 2 presses twice, Echo 3 goes into the vault.
* **Intended solution:** Echo 1 holds the Hall Plate. Echo 2 enters the lab and presses the Relay Switch at 8 s (for
  Echo 3) and 11.5 s (for you). Echo 3 waits at the Vault Door, slips in and holds the Vault Plate. You wait at the
  Core Door and walk in on the second pulse.
* **Why 3 (body count):** the Core Door needs the Hall Plate, the Vault Plate and Receiver B at once: one body on each
  plate, and someone who pressed the switch within the last 2 s from more than 2 s away (tests: "the presser cannot
  reach the Core Door before the light dies"; "standing in Laser A breaks the chain"; "one tick per hop"; "the doorstop
  route is closed").
* **Round 5 fix:** the Core Door gained the Hall Plate as a third input. Before, the solver's doorstop route worked
  with 2 echoes: one echo stood in the Lab doorway while the Hall Plate echo walked in blind and became the Vault Plate
  holder.

## L07 — Broken Sequence  *"Record what cannot work — yet."*

* **Teaching goal:** echoes replay **inputs, not results**. You deliberately record a sequence that fails now and
  will succeed once a later loop changes the world. Divergence becomes a tool, not an error.
* **Layout and story:** the Archive. Hall Plate (far east) → West Door. Reading Plate (west room) → Archive Door. The
  Archive Switch sits behind the Archive Door and lights the Exit Door far away in the south-west. *"Change the world
  around them, and the same steps can carry them somewhere you have never been."*
* **Objective:** have an echo light the Archive Switch.
* **Echo limit / par:** 2 / 2 echoes, 17 s.
* **Hints:** (1) the switch is too far from the exit to press yourself; (2) echoes repeat inputs: an echo pushing into a
  shut door walks on once it opens; (3) the full recipe.
* **Intended solution:** Echo 1 holds the Hall Plate until 5.5 s, then walks to the shut Archive Door and pushes north,
  pressing E every second. Every press resolves to nothing. Echo 2 enters the west room while Echo 1 is still on the
  plate and holds the Reading Plate. On replay the Archive Door opens in front of Echo 1, which keeps pushing, walks
  in, and its next press lands on the switch. The timeline shows a divergence (`none → use`), and the switch stays lit
  while you walk out.
* **Alternate:** record Echo 2 "blind" first (push into the West Door, then walk to the plate) and Echo 1 live. Either
  way one recording has to be made against a closed door.
* **Why 2:** the honest route (two plate holders, then you press the switch and run) fails on distance (tested). The
  winning pass contains exactly one intended divergence (asserted).

## L08 — Recursive Machine  *"A loop inside the loop."*

* **Teaching goal:** the **nested loop** (Level 8's deliberate new mechanic). The chamber's Recursion Engine re-loops
  every recording: one echo replays it from tick 0, and its recursive copy replays the same inputs 5 s later, waiting
  on the spawn dais until then. One recording gives you two bodies, and the second walks through a world the first has
  already changed.
* **Layout and story:** the Recursion Engine. The Feed Plate (east of the hall) opens the Machine Door. The Shaft Plate
  sits at the top of the shaft behind that door, and the Threshold Plate sits directly in front of it. The Core Door
  needs both plates at once. One echo is allowed.
* **Objective:** hold the Shaft and Threshold plates at the same time.
* **Echo limit / par:** 1 / 1 echo, 21 s.
* **Hints:** (1) every echo has a copy 5 s behind; (2) stand on the Feed Plate long enough and your copy arrives
  before you leave; (3) feed for 6 s, then push north into the door and keep pushing.
* **Intended solution:** record one loop: walk to the Feed Plate, stand on it for 5.5 s, then walk to the Machine
  Door and keep pushing north (while you record, the door is shut and you go nowhere). On replay the copy arrives on
  the Feed Plate while the echo is still there, so the door never closes when the echo leaves. The echo walks up the
  shaft onto the Shaft Plate. Five seconds later the copy leaves, the door shuts in front of it, and it ends up pushing
  against the door while standing on the Threshold Plate. Both plates are held, and you walk in.
* **Why it needs the recursion:** three jobs (two plates plus you) against two bodies without it. Tested: the same
  recording without `recursion` fails, and leaving the Feed Plate before the copy arrives shuts the echo out too.
* **Engine:** `LevelDefinition.recursion = { delayTicks: 300, copies: 1 }`. See contracts.md §8b and
  `src/engine/temporal/recursion.test.ts` (actor order, idle-until-offset, exact retracing, shifted divergence,
  determinism, timeline tracks).

## L09 — The Paradox Chamber  *"Your first echo is in the way of your last."*

* **Teaching goal:** mutual dependency. When an older echo must react to a younger one, **delete the old loop and
  record it again**, and it becomes the youngest. Also introduces inverted wires.
* **Layout and story:** the Paradox Spire. The Hall Plate opens the West Door and, through an inverted wire, seals the
  Vault Door. The Vault Door needs the Reading Plate held and the Hall Plate empty. The Vault Plate, at the far end of
  the vault, opens the Spire Door to the exit.
* **Objective:** unseal the vault and hold the Vault Plate.
* **Echo limit / par:** 2 / 2 echoes, 19 s.
* **Hints:** (1) read the Vault Door's wiring; (2) the Hall Plate echo must step off after the reader is inside, but it
  was recorded first; (3) delete Echo 1 and record it again.
* **Intended solution (the paradox route, tested step by step):** Echo 1 holds the Hall Plate. Echo 2 walks through the
  West Door onto the Reading Plate. The vault stays sealed: the paradox. Delete Echo 1. Record again as the youngest
  loop: hold the Hall Plate until Echo 2 is through, step off (the vault unseals), walk into the vault and onto the
  Vault Plate. Then walk into the spire. The surviving Echo 2 replays exactly as recorded.
* **Stored solution (equivalent loop set, no deletion):** Echo 1 is recorded blind. It leaves the Hall Plate at 6 s,
  pushes north into the sealed Vault Door, then east. That only works once Echo 2 exists.
* **Why 2:** the Vault Plate must be held while you stand in the spire, the Reading Plate while the vault opens, and
  the Hall Plate while somebody enters the west room, by somebody who isn't in the west room (tests: the obvious
  attempt never opens the vault; one echo plus you fails).

## L10 — The Core  *"Everything you have been, at once."*

* **Teaching goal:** the finale. It combines blind recording (L07) through a new temporal gate, socket and cell, the
  laser relay (L06), boarding a lift before the moment (L04), a moving platform with a crate (L03/L05) and
  synchronised timers (L05). All 12 component kinds appear.
* **Layout and story:** the Core, a monumental two-storey dais beside the Great Abyss with a clockwork crown. The
  Courier carries the cell through the Reliquary Gate (`allows:'echoes'`) into the socket. The socket fires the Core
  Laser down a sealed optics gallery into the Core Receiver, which raises the Core Lift and wakes the Ferry, both for
  good. The Ferryman crosses to the Relic Island, brings the crate to the Crown Plate, then takes the West Timer. The
  Timekeeper takes the East Timer. The Crown Door needs the crate plate and both timers (2.5 s each, 16 tiles apart).
* **Objective:** wake the Core and pass the Crown Door.
* **Echo limit / par:** 3 / 3 echoes, 26 s.
* **Hints:** (1) only echoes cross the Reliquary Gate, so carry the cell in and press E; (2) the cell wakes the lift and
  the ferry together, so be aboard; (3) the Crown Door needs the crate and both timers at once; (4) the full role
  list.
* **Intended solution:** Echo 1 (Courier) takes the cell, pushes into the gate and presses E. While you record it, the
  press fails. On replay the echo crosses and the press becomes an insert at 5.2 s: the intended divergence
  `fail → insert`. Echo 2 (Ferryman) waits aboard the ferry, crosses, takes the crate, rides back, drops it on the
  Crown Plate and presses the West Timer at 17 s. Echo 3 (Timekeeper) presses the East Timer at 17 s. You stand on
  the lift before 5.2 s, rise with the Core and walk through the crown.
* **Why 3:** at the finish both timers need a hand each, the crate must already be on the plate, and the Courier is
  sealed in the Reliquary: the gate closes for good once the socket is powered (inverted wire, round 5). Tests:
  Courier plus Ferryman alone fails; pressing the East Timer yourself fails because the lift has already risen; the
  live player can't cross the gate; the Courier can no longer walk back out.
* **Round 5 fix:** before the seal, a 2-echo route worked (found with a hand-built probe guided by the solver's
  blind-walk model). The Courier's single blind recording walked back out through the open echo gate and pressed the
  East Timer itself, so the Timekeeper wasn't needed.

---

## Verification (per level, automated)

* Validates with zero errors and zero warnings, including component authoring rules.
* The known solution completes within the echo limit and earns 3 stars with its par.
* Per-tick hashes are identical across runs and in pure re-simulation, and match the golden replay file.
* The final run alone fails, and so does every single loop of the solution played solo.
* The winning pass has zero divergences, except the intended ones in L07 and L10, which are asserted exactly.
* The level-specific minimum-echo and mechanic tests listed above.
* QA fuzz (random inputs, rewinds, deletes, save/load, scrubs) holds every invariant, softlock checks pass.

## Known limits / follow-ups

* Minimum-echo claims are argued and spot-tested, and since round 5 also checked by a bounded macro-action solver
  (`npm run solve -- L07`). Its proofs are exhaustive only within documented bounds; per-level status is in
  [`difficulty-report.md`](./difficulty-report.md). L05 can be solved with one echo (flagged, see L05).
* Unknown decor types (`archway`, `machinery`, `hologram`, `banner`, `abyssLight`) are ignored by the current renderer.
  They describe intent for Graphics. Only `conduit`, `observationWindow`, `ring` and `lamp` render today, and all my
  conduits are wall-mounted.
* Nested-loop copies share their echo's tint and number. The timeline shows them as a second "Echo 1" track
  (`recursion: 1`, `startTick`). UI and Graphics should add a "↻" badge, offset the copy's bar to `startTick`, and make
  the visibility toggle also hide `echo:<id>.<k>`.
