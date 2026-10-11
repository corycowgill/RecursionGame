# Director verification, round 4

Date: 2026-10-11 · Scope: verify the UX/input, gameplay-feedback and load-time (release) round-4 work, fix integration
problems minimally, refresh two final screenshots, update README and release notes (v0.4). Nothing committed.

## Results

| Item | Result |
|---|---|
| `npm run verify` (start and end) | Green: typecheck clean, Vitest 44 files / 589 tests, no skipped tests, build OK |
| Golden replays | Diff limited to 9 `levelFingerprint` lines (L01, L03, L07, L10, T00 golden files and 4 lines of `fuzz-fingerprints.golden.json`). The level definitions changed only in five hint strings (key names → action tokens). All hashes, checkpoints, event counts and completion ticks unchanged. **Accepted as legitimate.** `gateBlocked` / `elevatorHeld` are not hashed (`temporalGate.serialize` is used only by `stateHash.ts`). |
| Full e2e (`CI=1 E2E_PORT=4815 npx playwright test`) | **18/18 passed**, 32.8 min, all visual baselines matched, no re-bless |
| Mobile spec after my CSS fix (`E2E_PORT=4831`, my scratch build) | 2/2 passed |
| SW under automation (prod preview) | Not registered, no caches, 0 console errors/warnings |
| SW on dev server (webdriver spoofed off) | Not registered |
| SW on prod preview (webdriver spoofed off) | Registered, active, controlling; 24 files in `recursion-1-4d2a6b33dde9`; 0 console errors |
| Main menu faster? | **No, not on this machine.** First painted menu frame is unchanged (10.3 s before vs 10.4 s after, release engineer's own tool, `?quality=low`, 3 runs). But a new ~4 s long task starts when the attract replay switches to the known solution (echo holograms appear, most likely a second shader-compile batch). The menu becomes responsive ~3.5–4 s later: 17.9 s before vs 21.7 s after, measured as "menu laid out and page answering", 6 runs, default quality. Documented in the release notes with a suggested follow-up (pre-warm echo materials, or start the solutions import at boot). Not fixed: the cause is inferred from timing, not profiled, and a fix belongs to the graphics and load owners. |

## Integration fix (minimal)

- `src/ui/touch/touchStyles.ts`: one CSS rule hides the gold verb tag above the touch Interact button during touch
  play (`.rx-root.rx-tplay .rx-tbtns .rx-tprompt { display: none; }`). With the player facing a timed switch, that tag
  covered the Timeline button and its label. This showed up in the final mobile screenshot, and the UX engineer's
  known issue already mentioned it. The HUD centre prompt already shows the same verb and blocked state. The Interact
  ready glow and blocked colour are unchanged. No unit or e2e test referenced the tag.

## Screenshots (overwritten only)

- `docs/art-direction/screenshots/final-character.png`: turntable (`graphics-preview.html?turntable=1&t=40`), player,
  front three-quarter, high quality, 900×1100, preview caption hidden. Reviewed: face, chest, armour panels and gold
  edge glow read clearly. The head tilts toward the camera, which is acceptable for review but not final art.
- `docs/art-direction/screenshots/final-mobile-hud.png`: iPhone 15 landscape (852×393, safe-area insets 59/59/0/21),
  production build, L05 walked to the Drive Switch. The Action button is visible and Interact is ready, with no
  overlapping labels after the fix and no console errors. The hint chip appears only at ≤ 360 px tall, so it is not in
  this shot. I reviewed it in the 740×340 mobile-spec screenshots (`test-results/mobile/short-hint-*.png`), where the
  chip sits under the chamber card and the expanded card stays above the joystick.

## Docs

- `README.md`: in Controls, a sentence that level hints use action tokens (device-aware). In Playing on iPhone, offline
  play after the first HTTPS launch, linking to the existing "Service worker (offline play)" section (cache bump and
  clearing were already documented by the release engineer).
- `docs/agent-progress/release-notes.md`: new v0.4 section at the top (summary, director checks, time-to-menu table,
  real-hardware checklist additions, known issues, tests). The v0.3 heading was renamed to "v0.3 (…)".

## Housekeeping

- Killed the release engineer's preview servers on 4391 (PID 5701 tree) and 4395 (PID 13289), as they asked. The PID
  in their `prev-c.pid` (15331) was stale.
- Killed my own servers (4831, 4832, 4833).
- Still running and not mine, so left alone: the vite dev server on 5391 (PID 2678, orphaned child of the
  gameplay-feedback engineer's PID 2665, which they reported killed), and previews on 4392/4393/4394 (PIDs 6413,
  11438, 12438; `dist-a/b/d` from the load-time pass, which the release engineer did not list). The director should
  kill them.
- The release engineer's unconfirmed smoke spec is now confirmed: all 3 smoke tests passed in the full run.

## Open items for the next round

1. Menu responsiveness regression under SwiftShader (above); measure on a real GPU and pre-warm echo materials.
2. Real-device checks listed in the v0.4 release notes (offline on iOS, `?nosw`, Render headers, Action button and
   chip on a real small phone, pad glyphs in hints, feedback feel, Echo 3+ colours sign-off).
