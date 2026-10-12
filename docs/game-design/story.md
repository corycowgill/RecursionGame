# RECURSION: Story

Owner: narrative & release engineer (round 5). The source of truth is the text itself: `story` in
`src/levels/definitions/L*.ts` (level intros) and `ENDING_LINES` in `src/app/ending.ts` (the ending).

## Premise (understated sci-fi mystery)

You wake in the **Ascendant Facility**, a monumental time-research complex with nobody left in it. The doors still
answer to weight and the machines still keep time, and a researcher's logs, signed **H.A.**, turn up in every chamber.
The logs talk about a "crew" that keeps arriving early, a list of people who always stay behind, and handwriting on
dials the writer never touched. As the campaign goes on, the logs describe the loop breaking down: the ferry docks
late, the Archive files tomorrow's logs, and the Recursion Engine "bought me more of me".

**The reveal (The Core):** the last log was recorded first. It is addressed to whoever wakes next, and gives your name:
*Ansel*. H.A. was you. There was never a crew, only you, loop after loop, with every echo you have recorded as the
"crew" the facility was built for. Waking the Core closes the loop.

**The ending:** the camera pulls back over the Core, the echoes walk into the player and are gone, three lines of text
(the last one the final log entry), then a fade to white and the credits.

Tone rules: no exposition dumps, no dialogue, no named villain. Every line is 1–2 short sentences. The mystery is
carried by small wrong details, not by explanations. Gameplay instructions stay out of the logs.

## How the story is told

Each campaign level's `story` has **three lines** (the level intro card shows 2–3):

1. **Location:** `<wing> — <room>`. The wing names match the lighting moods of `src/graphics/environment/moods.ts`
   (Dawn Atrium / Chronometry Lab / Machine Hall / Paradox Wing / The Core), and the room names match
   [`levels.md`](./levels.md). L01–L02 and L10 use "Ascendant Facility" as the wing.
2. **Narration:** one line in the level's own terms. It keeps the teaching cue the level designer wrote (L04: "Whoever
   calls it stays behind"; L06: "Bodies stop light"; L09: "rewrite the past"), so the intro still points at the
   mechanic.
3. **Environmental log:** `LOG <id> · <text> — H.A.`, a recovered log entry. The intro card styles a line of this form
   as a log (cyan id tag, italic text; `src/ui/menus/narrative.ts`). Log numbers rise through the campaign (001 →
   089) and the Core's is **000**: recorded first, found last.

No story line names a key or button. If one ever needs to mention a control it must use an action token (`{interact}`,
`{echo}`, …; see `src/ui/actionText.ts`), which `src/ui/actionText.test.ts` checks for every authored string.

### The lines

| # | Location | Narration | Log |
|---|---|---|---|
| 1 | Ascendant Facility — Calibration Wing | The far door answers only to weight on the plate. You are one person. For now. | LOG 001 · Subject is awake. Start them on one plate and one door. They will remember how. |
| 2 | Ascendant Facility — Atrium of Doubles | Two doors, two plates, one behind the other. Your past selves do not take turns. | LOG 014 · The crew keeps arriving early. Same faces. Same footsteps. |
| 3 | Chronometry Lab — The Chrono Vault | Two weights and a heartbeat from the balcony, all at once. Not three people: three moments. | LOG 027 · The vault timer was set by hand. The handwriting on the dial is mine. I never set it. |
| 4 | Chronometry Lab — The Freight Stack | The lift climbs only while the call is held. Whoever calls it stays behind. | LOG 033 · Somebody always stays behind. I keep a list of who. Every name on it is the same. |
| 5 | Machine Hall — The Ferry Deck | The ferry runs on a four-second charge. The island door opens for less. Neither switch can be held. | LOG 041 · The loop is drifting. The ferry docked a second late today. Or I did. |
| 6 | Machine Hall — Optics Laboratory | Light carries the signal. Bodies stop light. The relay was built for a crew of four. | LOG 052 · The crew is gone. The manifest still lists four, all signed in the same hand. |
| 7 | Paradox Wing — The Archive | Your echoes remember what you did, not what happened. Change the world, and the same steps go further. | LOG 060 · The Archive is filing tomorrow's logs. I read ahead. Then I stopped. |
| 8 | Paradox Wing — The Recursion Engine | The engine folds every recording back on itself: each echo gains a copy, five seconds behind. | LOG 077 · The engine was meant to buy the crew more time. It bought me more of me. |
| 9 | Paradox Wing — The Paradox Spire | Two keys, each waiting on the other. When the past blocks the future, rewrite the past. | LOG 089 · You have read this line before. The past does not mind being rewritten. I never did. |
| 10 | Ascendant Facility — The Core | Every machine you have learned answers to it. Courier, ferryman, timekeeper and you: one moment. | LOG 000 · For whoever wakes next: your name is Ansel. So was mine. Wake the Core, and let us go home. |

All logs from L01 to L09 are signed "— H.A.". The L10 log is unsigned because it names you.

**Ending** (`ENDING_LINES`): "The echoes come home." / "There was never a crew. Only you, loop after loop, until the
Core held." / "LOG 000 · Loop closed. Recording ends."

The hint texts were not changed: they belong to the level designer and the puzzle analyst and carry the teaching
ladder.

## Ending and credits flow

```
L10 levelComplete ─(first clear)─► 1.5 s (completion VFX) ─► ENDING ─► CREDITS (roll) ─► main menu
L10 levelComplete ─(repeat clear)─► results card with "Watch ending"
Level select (campaign finished) ─► "Ending" / "Credits" buttons
Main menu ─► Credits
```

* **Ending** (`src/app/ending.ts`, `src/ui/menus/Ending.ts`): about 14.6 s. Follow-camera pull-back (framing zoom 1 → 2)
  for 4.5 s, then the whole-chamber overview. The echoes walk into the player over 0.8–4.6 s. Three lines fade in from
  5 s, 2.3 s apart, then a fade to white from 12.4 s. Under reduced motion the camera cuts straight to the overview.
  The converging echoes are drawn from a **derived copy** of the frozen final state (`convergeView`), like the rewind
  playback. The simulation has already stopped and nothing is written back.
* **Skip:** any fresh input on any device: a key press (auto-repeat ignored, so a key held from the winning run does
  not skip), a click or tap anywhere, any controller button, or Esc / B. Input in the first 0.5 s is ignored. A skip
  fades to white in 0.4 s and goes straight to the credits.
* **Replay:** saved progress already records L10's completion, so no new save field was needed. Level select shows
  "Ending" and "Credits" once the last chamber is completed. Replaying the ending away from a finished Core loads L10
  and simulates its verified solution to completion (the real sim, silently), so the ending always shows a genuinely
  finished Core.
* **Credits** (`src/ui/menus/Credits.ts`): "HALLUCINATED GAMES presents" in the studio ident's style (Orbitron 700
  with the ident's white → #00ffaa → #7b61ff → #ffd700 gradient and green glow; "presents" in Rajdhani with the
  ident's green rule), then the RECURSION logotype, the team ("Built by an AI agent team directed by Cory Cowgill"),
  the additional roles, the licenses (three.js MIT; Orbitron and Rajdhani, SIL OFL 1.1) and a closing line. After the
  ending it fades in from white and rolls by itself until the first user input. Keyboard ↑/↓ steps through the sections,
  Esc leaves; on a controller the D-pad walks the sections, A activates and B leaves; on touch, drag to scroll and tap
  Back / Main menu.

## Needs a playtest

* Whether the logs read as a mystery or as noise on the intro card (they appear under the narration line). If they
  read as noise, the fallback is to show logs only on replays.
* Ending length (~14.6 s) and pacing on real hardware. It was checked only in SwiftShader screenshots at about 0.5 fps.
* Whether the reveal lands without any in-world props. Environmental holograms (`decor` hologram text) are
  graphics-owned labels and were not changed.
