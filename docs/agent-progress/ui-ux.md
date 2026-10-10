# Progress: UI / UX Designer and Engineer (Agent 5)

Owned directories: `src/ui/**`, `src/persistence/**`. I also added `ui-preview.html` at the repo root, as the brief asked.
The overlay uses plain DOM and CSS (no framework). It reads only data passed into `update()` and `onEvents()`, and it sends player intents out through callbacks. It never imports the engine's mutable API or writes simulation state.

## Completed

### Persistence (`src/persistence/`)
- **`save.ts`**: `SaveStore` holds a versioned save (`recursion.save`, v1) with `progress` (the levels' `CampaignProgress`), best results, `settings`, `keybinds`, `seenTutorials`, per-level saved echoes (`loops`, written with the engine's `encodeLoop`/`decodeLoop`) and `lastLevelId`.
  - Every storage access is wrapped in try/catch. If storage fails, the store falls back to `MemoryStorage` and sets `persistent = false`; `lastError` is set for storage failures and corrupt saves.
  - `migrateSave()` sanitizes each section separately, so one corrupt field never wipes progress. It also handles a versionless prototype save.
  - Helpers: `recordResult()` returns `firstClear`, `isNewBestTime` and `isNewBestEchoes`, and clears the level's saved loops. Also `updateSettings`, `setKeybinds`, `setLevelLoops`/`getLevelLoops`, `markTutorialSeen`, `reset()`, `subscribe()`.
- **`settings.ts`**: `Settings` covers quality preset, master/music/sfx volume, camera sensitivity, reduced motion, echo palette (`default` / `highContrast`), UI scale, tutorials and hints. `sanitizeSettings` clamps every value; `effectiveVolume(settings, 'music'|'sfx')` is for audio.
- **`keybinds.ts`**: all 16 actions can be remapped (movement, interact, action, rewind, restart = `Shift+KeyR`, timeline, pause, preview, echo 1–5).
  - Each action gets a primary and an alternate key. Assigning a key moves it away from its previous owner and reports which action lost it.
  - `resolveKeyAction(binds, code, shift)`: a Shift binding wins over the plain one; Escape always pauses, so players cannot lock themselves out.
  - Label helpers: `codeLabel`, `bindingLabel`, `movementLabel` ("WASD").

### UI (`src/ui/`)
- **`createUI(root, callbacks, {settings, keybinds, seenTutorials})`** returns a `UIHandle` with:
  - Screens: `showMainMenu`, `showLevelSelect`, `showSettings`, `showCredits`, `showPause`/`hidePause`, `showLevelIntro`/`hideLevelIntro`, `showLevelComplete`, `hideScreens`.
  - HUD: `showHUD(level)`, `hideHUD`, `update(frame)`, `onEvents(events)`.
  - Feedback: `showHint`, `toast`.
  - Timeline: `toggleTimeline`, `setTimelineExpanded`, `selectEcho(i)`.
  - Settings: `setSettings`, `setKeybinds`.
  - Flow: `transition(fn)` (fade), `back()` (Esc: closes the sub-screen or resumes from pause; returns false if not consumed), `isBlocking()`, `screen`, `dispose()`.
  - Callbacks are listed in `src/ui/types.ts` (`UICallbacks`): onContinue, onStartLevel, onResume, onRestart, onResetLoop, onCommitEcho, onTogglePause, onDeleteLoop(i), onScrub(tick), onScrubEnd, onToggleEchoVisibility(i, visible, loopId), onSelectEcho, onTimelineToggle, onSettingsChange, onKeybindsChange, onIntroDone, onNextLevel, onReplayLevel, onQuitToMenu, onResetProgress, onTutorialComplete, onUISound(cue).
- **Visual language** (`styles.ts`): navy glass panels with gold corner brackets, hairline cyan rules, wide-tracked uppercase Orbitron with Rajdhani body text, and subtle animated glows.
  - Fonts are **self-hosted via @fontsource** (the same Google Fonts families, but they work offline with no third-party request), with system font fallbacks.
  - The rotating clockwork ring motif is in `rings.ts`; icons are hand-drawn inline SVG in `icons.ts`.
- **Main menu**: RECURSION logotype over counter-rotating rings, Continue/Begin (shows the target chamber), Level Select, Settings, Credits, a "Temporal record" progress panel, and a notice when saving is unavailable.
- **Level select**: 5×2 cards showing locked / open / next / restored state, best time, echoes used out of the limit, and stars. `buildLevelEntries(levels, progress)` mirrors `Campaign.isUnlocked`.
- **HUD**:
  - Top-left: chamber number, name, subtitle, and the objective with a diamond per exit condition (n / m active).
  - Top-right: pulsing REC, or PAUSED / PREVIEW / COMPLETE / TIME UP, each with a different glyph; the loop number; the loop clock against the maximum, with a progress bar that turns coral above 85%; and echo budget chips, each with shape and number.
  - Context prompt with a key cap; coral when the action is blocked.
  - Control hints that follow the current key bindings.
- **Temporal timeline** (`timeline/`):
  - The compact strip is always visible; Tab expands it.
  - Ruler with adaptive steps, gold playhead, and a dashed cyan scrub head showing a "Preview m:ss.s" readout.
  - One lane per loop: PLAYER (gold diamond) first, then ECHO 1..n in cyan → azure → violet → teal → lilac, each with its own shape and number.
  - Planned interaction markers have an icon per interaction kind. They are filled once the action has happened in this pass, hollow while pending, coral X when failed, and coral when diverged.
  - Divergences get a coral "!" diamond and a hatched zone. Lanes show a played-progress bar and an end cap.
  - Per-track controls: select, visibility (eye) and delete.
  - Transport bar: RECORD, REWIND, PLAY/PAUSE, DELETE LOOP (selected echo or the last one), TIMELINE ZOOM (×1/2/4/8; the view follows the playhead), ECHO SELECT. RECORD is disabled at the echo limit.
  - Scrubbing works by pointer drag (the preview lasts while held) or by keyboard on the `role="slider"` stage: ←/→ for 1 s, Shift for 0.1 s, PgUp/PgDn, Home/End, Enter/Esc to return to live.
  - Lanes are rebuilt only when their structure changes (`tracksSignature`). Each frame only touches the playhead, played widths and the zoom transform.
- **Pause**: Resume, Restart chamber, Settings, Level select, Main menu, chamber status, and a hint list with "Reveal next hint".
- **Settings** has four tabs:
  - Display: quality, UI scale.
  - Audio: master, music, effects.
  - Accessibility: reduced motion, standard / high-contrast echo palette with a live preview, tutorials, hints.
  - Controls: camera sensitivity, full key remapping. Capture runs on window in the capture phase, so gameplay never sees the key. Esc cancels; Delete clears a binding; a notice reports which action lost a moved key; there is a "Restore default keys" button.
  - Also: a two-step confirmed "Reset progress".
- **Level intro**: chamber number, name, subtitle, story lines revealed one by one, chips for echo limit / loop length / par, and a Begin button (Enter). The HUD fades out underneath.
- **Level complete**: three stars (Restored / Echo par / Time par), Time / Echoes / Best cards with par ticks, a NEW BEST or CHAMBER RESTORED badge, and Next / Replay / Chambers buttons.
- **Hints** (`hud/hints.ts`): `HintScheduler` unlocks hints in order once `afterSeconds` has passed (default (i+1)×45 s) **or** after (i+1)×3 attempts (rewinds, restarts, deleted loops). The timer runs only while the player is actually playing; large dt values are clamped. Hints show as a collapsible card.
- **Onboarding** (`hud/onboarding.ts`): data-driven prompts for L01 (move → plate → R creates an echo → cooperate) and L02 (Tab timeline → scrub → edit / delete loops). Each step advances on a real signal (events, movement, timeline opened, scrubbed), some with timeouts. Key labels follow the remapped bindings. Prompts can be skipped and report `onTutorialComplete`.
- **Toasts** for echo recorded, take discarded, echo limit reached, paradox/divergence, loop time up, chamber restarted, echo deleted, and exit portal online. A screen-reader live region announces the important ones.
- **Accessibility**:
  - Every menu works by keyboard (arrow-key focus navigation; a 5-column grid in level select; arrow-key tabs) and has visible `:focus-visible` rings and aria labels and roles (dialog, tablist, switch, slider, progressbar, toolbar, status).
  - Colour is never the only cue: shapes, numbers, glyphs and patterns carry the meaning too.
  - High-contrast mode applies the Okabe–Ito palette with stronger lines.
  - Reduced motion follows both the OS setting and the in-game toggle. UI scale is applied through a CSS variable.
- **Preview** (`ui-preview.html` + `src/ui/preview/preview.ts`):
  - Every screen is rendered from **real engine data**: the real `TemporalGame` replays L03's verified solution, and prompts and objectives come from the gameplay helpers. Level select pads with locked future chambers named from the brief.
  - The real 3D renderer is drawn behind the UI. The timeline scene injects one divergence record so the paradox styling can be reviewed; that is preview-only data.
  - `src/ui/preview/capture.mjs` captures the screenshots.

### Screenshots (reviewed and iterated)
`docs/art-direction/screenshots/ui-{menu,levels,settings,controls,hud,timeline,timeline-hc,pause,intro,complete,onboarding,credits}.png`

## Files changed
- New: `src/persistence/{keybinds,settings,storage,save,index}.ts`, `src/persistence/persistence.test.ts`
- New: `src/ui/{index,createUI,types,styles,fonts,dom,icons,palette,rings}.ts`
- New: `src/ui/timeline/{model,TimelinePanel}.ts`, `src/ui/timeline/timeline.test.ts`
- New: `src/ui/hud/{Hud,Toasts,hints,onboarding}.ts`, `src/ui/hud/hud.test.ts`
- New: `src/ui/menus/{MainMenu,LevelSelect,Settings,Overlays}.ts`
- New: `src/ui/ui.test.ts`
- New: `src/ui/preview/{preview.ts,capture.mjs}`, `ui-preview.html`
- New: `docs/art-direction/screenshots/ui-*.png`
- `package.json` / `package-lock.json`: added **devDependency `happy-dom`** (DOM tests) and **dependencies `@fontsource/orbitron`, `@fontsource/rajdhani`** (self-hosted fonts), all via `npm install`.
- Removed the `.gitkeep` files in `src/ui/{hud,menus,timeline}` and `src/persistence`.
- No contract or shared files were edited.

## Tests run (actual results)
- `npx tsc --noEmit`: clean (exit 0).
- `npx vitest run`: **15 files, 154/154 passed**, including 39 of mine:
  - persistence: 15
  - timeline model: 9 (one uses a real L03 engine timeline)
  - hints/onboarding: 5
  - happy-dom `createUI`: 10 (menus, level-select locking, HUD/timeline with real engine data, delete / visibility / select / transport / keyboard scrubbing, toasts, onboarding, pause + `back()`, settings changes and key remapping with displacement, intro/complete, fade transition)
- Preview build and screenshots: `vite build` with a scratch config (input `ui-preview.html`), `vite preview` on :5192, then `node src/ui/preview/capture.mjs http://localhost:5192`. All 12 screenshots were captured with no page errors, and the server was killed afterwards.
- I did not run `npm run build` or Playwright e2e. The app entry does not import the UI yet, and I avoided overwriting the shared `dist/`.

## Integration guide (director)
```ts
const save = new SaveStore();
const ui = createUI(document.getElementById('ui')!, callbacks, { settings: save.data.settings, keybinds: save.data.keybinds, seenTutorials: save.data.seenTutorials });
ui.showMainMenu({ continueLevel: CAMPAIGN.continueLevel(save.data.progress), levels: buildLevelEntries(LEVELS, save.data.progress),
                  totalStars: CAMPAIGN.totalStars(save.data.progress), maxStars: LEVELS.length * 3, persistent: save.persistent });
// start level: ui.transition(() => { loadLevel(l); ui.showHUD(l); ui.showLevelIntro(l); })  -> onIntroDone: ui.hideLevelIntro(), unpause
// each frame:
const events = game.drainEvents();
ui.onEvents(events);                      // also fan out to audio / VFX
ui.update({ level, state: game.getState(), timeline: game.getTimeline(), paused, previewTick,
            prompt: predictInteraction(level, state), objective: getObjectiveStatus(level, state), dt });
// commands: toggleTimeline -> ui.toggleTimeline(); selectEcho(i) -> ui.selectEcho(i);
//           pause -> if (!ui.back()) { pause; ui.showPause({...}) }
// onScrub(t) -> previewTick = t; render game.getSnapshotAt(t)     onScrubEnd -> previewTick = null
// levelComplete -> const r = completionFromEvents(level, events); const rec = save.recordResult(r); ui.showLevelComplete({ result: r, ...rec, best: {...} })
// gameplay input enabled only while !ui.isBlocking() (keyboard.gameplayEnabled)
// onSettingsChange -> save.updateSettings(s) + renderer quality / audio volumes;  onKeybindsChange -> save.setKeybinds(b)
// onTutorialComplete(id) -> save.markTutorialSeen(id);  on commit/delete -> save.setLevelLoops(level.id, game.getLoops())
```

## Outstanding issues / dependencies
- **Key remapping needs one small hookup in `KeyboardInput`** (owned by the temporal engineer). Right now it hard-codes `e.code`. Suggested additive change: `keyboard.setResolver((code, shift) => resolveKeyAction(binds, code, shift))`, then switch on the returned `BindableAction` instead of `e.code`. The settings UI, persistence and the resolver are done and tested.
- The director still needs to wire `createUI` into `bootstrap.ts`, replacing the placeholder HUD, and hold `previewTick` for scrubbing. Showing `getSnapshotAt(previewTick)` is up to the renderer and director.
- **Temporal preview (Q):** the UI shows PREVIEW and the scrub head whenever `frame.previewTick` is set. The app decides which tick Q previews.
- **Audio:** `onUISound(cue)` is emitted for hover, confirm, back, toggle and error. Audio should map these cues to sounds.
- **Graphics:** apply `settings.quality`, `reducedMotion` (camera shake) and `cameraSensitivity`. Echo visibility toggles report `(echoIndex, visible, loopId)` so the renderer can hide or ghost an echo.
- The timeline shows the planned interactions from `TimelineTrack.planned`. If the engine later adds per-marker positions, in-world "which echo activates what" indicators could reuse `MarkerModel`.
- The main bundle will grow by roughly 60 kB of font files once the UI is imported. They are woff2 files loaded with `font-display: swap`.

## Next tasks
- Pair with the director on the `bootstrap.ts` wiring and add a Playwright e2e covering menu → intro → HUD → Tab timeline → pause → complete (in `tests/e2e`, with QA).
- In-world echo labels and markers (DOM, projected from screen coordinates the renderer provides) that tie timeline markers to objects.
- Gamepad navigation for menus, and a hint-request key.
- Localisation table for UI strings.
