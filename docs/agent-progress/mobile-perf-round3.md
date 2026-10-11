# Mobile performance engineer: round 3

Role: mobile performance engineer. Owns `src/engine/rendering/**`, `src/graphics/**` (performance and quality only,
no art changes) and the quality setting in `src/persistence/settings.ts`. Date: 2026-10-11.

Nothing here touches the simulation. Quality, device detection, dynamic resolution, context-loss handling and texture
budgets are all renderer-side. Golden replays are unchanged and `npm run verify` is green: typecheck clean, Vitest
36 files / 503 tests passed, build OK (last run at the end of this pass, with the other teams' edits in the tree).

## What was done

### 1. `mobile` quality preset, chosen automatically
- New `QualityLevel` `'mobile'` (`src/engine/rendering/quality.ts`). Compared with the desktop presets it uses:
  - pixel-ratio cap **1.5**;
  - **no shadow map**. Instead it draws baked **blob contact shadows** under actors and loose crates and cells
    (`src/graphics/effects/contactShadows.ts`: one instanced draw call and a 64² texture);
  - bloom at half resolution (`bloomResolutionScale` 0.5; UnrealBloom halves that again internally);
  - **FXAA**, never SMAA;
  - particles ×0.3, 2 point lights, 80 motes, no light shafts, no echo trails;
  - a **reduced backdrop** (`buildBackdrop(..., { detail: 'reduced' })`): 1 cloud layer instead of 2 (full-screen
    overdraw), 1 haze curtain instead of 3, half the towers and far spires, no bridges or flying arches, 4 of 9
    clockwork rings, a coarser sky dome;
  - **character LOD 1** (`characterGeometries(1)`): same bones and draw calls, tessellation ×0.4. This brings
    **52 290 triangles per character down to 13 440**, and the suit drops its clearcoat lobe. LOD 0 is checked
    bit-identical to the previous mesh. At gameplay camera distance the two look the same (side-by-side screenshots
    of the chamber scene);
  - **half-resolution procedural textures** (`MaterialLibrary({ textureScale: 0.5 })`). Normal strength is scaled
    so the relief matches;
  - a 128 px **PMREM environment** instead of 256 (1.5 MB instead of 6.3 MB, the largest single texture).
- Auto-selection: new installs default to `'auto'` (`src/persistence/settings.ts`; presets are now
  `auto, low, mobile, medium, high, ultra`). `'auto'` resolves through `resolveQuality()` /
  `classifyDevice()` (`src/engine/rendering/device.ts`) as follows:
  - **mobile** for iPhone, iPod and iPad UAs;
  - **mobile** for iPadOS desktop-mode Safari (Mac UA or `MacIntel` with `maxTouchPoints > 1`);
  - **mobile** for Android/Mobi UAs;
  - **mobile** for a coarse primary pointer with no fine pointer on a screen whose short edge is ≤ 1100 CSS px;
  - **high** everywhere else, which is the same as the previous default.
- **The user's preset is respected.** Any saved explicit preset (including an existing save's `'high'`) and any
  `?quality=` override are used as-is. Only `'auto'` and missing or unknown values auto-pick. `?quality=mobile` and
  `?quality=auto` are now valid URL overrides.
- Verified in Playwright as `devices['iPhone 15']` on Chromium: the app booted with no query and no save picks
  `mobile` (pixel ratio 1.5), with no page errors.

### 2. Dynamic resolution guard
- `ResolutionController` (`src/engine/rendering/resolution.ts`) is pure and unit-tested. The renderer feeds it one
  sample per rendered frame, and it steps the render scale (a fraction of the preset's pixel-ratio cap).
- Targets: **30 fps on phones and tablets, 60 on desktop** (`targetFpsFor`, overridable with the `targetFps` option).
- Rules:
  - it judges the median of each 30-frame window;
  - it steps down 0.1 when the median is over 1.2× the frame budget;
  - it steps up after 4 consecutive windows that meet the target. rAF intervals are locked to vsync, so meeting the
    target is the only headroom signal a browser gives without GPU timers, which iOS lacks;
  - if a step up fails within 3 windows, the wait before the next step up doubles, capped at 16×;
  - gaps over 1 s are ignored.
- Floor: 0.5 on mobile, 0.6 elsewhere, and the effective pixel ratio never goes below 0.5.
- Render gaps the app makes on purpose are ignored. The menu sub-screen redraws every 500 ms; it is detected because
  the app's own `dt` is much shorter than the gap.
- It is **off under `navigator.webdriver`**, so e2e screenshots and visual baselines are unaffected.
  `setDynamicResolution(bool)` switches it at runtime, and `graphics-preview.html?dynres=1` forces it on.
- Verified in a browser: the preview at about 2 fps (SwiftShader) stepped 1.0 → 0.9 and the canvas shrank from
  480 to 432 px.

### 3. WebGL context loss / restore
- `GameRenderer` listens for `webglcontextlost` (calls `preventDefault`, skips rendering while lost) and
  `webglcontextrestored`. three.js re-initialises its GL state and textures and geometry re-upload lazily. On
  restore the renderer regenerates the GPU-only **PMREM environment**, drops the shadow map, marks materials for
  recompile, resets the resolution window and resizes.
- New API: `isContextLost()`, plus `stats().contextLost`.
- Verified on the iPhone-emulated app with `WEBGL_lose_context`: `contextLost: true` while lost; after restore it
  renders again (139 draw calls), brass and env reflections are intact, and there were no page errors.

### 4. Page hidden → game loop, audio and attract replay paused
- `src/app/bootstrap.ts` has a `visibilitychange` handler. On hidden it cancels the rAF loop, which stops the sim,
  the attract replay and rendering. It also suspends audio and releases held keys. On visible it restarts the loop
  with a reset clock and stepper, so there is no catch-up burst.
- Verified: the menu attract-replay tick stayed at 15 → 15 over 4 s hidden, and was 20 after becoming visible.
- `AudioSystem.setBackgrounded(hidden)` suspends or resumes the owned AudioContext. If iOS refuses to resume
  outside a gesture, the next `unlock()` retries.

### 5. Memory
- `GameRenderer.textureMemory()` (`src/engine/rendering/memory.ts`) estimates GPU memory. It covers distinct
  material and uniform textures (with mip chains and float formats), shadow maps and the post chain
  (`PostFX.renderTargetBytes`). It also names the largest texture, which helps catch huge canvas textures.
- Level changes do not leak. Loading L01 → L10 → L05 → L01 → L10 → L05 → L01 in the app left
  `renderer.info.memory` textures flat at 43, and geometries returned to 103. `clearLevel` already disposed
  everything per level; the backdrop rebuild path added this round disposes the old backdrop too.
- The largest textures on mobile are the 384×512 PMREM atlas, then 256² material sets. The 1024×256 hologram labels
  (1 MB each) are the biggest canvas textures left.

## L10 numbers: mobile vs low

Measurement setup:
- Page: `graphics-preview.html?scene=level&id=10&t=700&settle=3`, follow camera.
- Device: Playwright `devices['iPhone 15 landscape']` (734×343 CSS px, DPR 3) on Chromium.
- Rendering: SwiftShader, so these are counts, not fps.

| | mobile | low | high (reference) |
|---|---|---|---|
| Draw calls (scene + post) | 272 | 262 | 385 |
| Triangles | 0.41 M | 0.57 M | 0.73 M |
| Drawing buffer | 1101×514 (DPR 1.5) | 734×343 (DPR 1) | 1468×686 (DPR 2) |
| Texture memory (materials, env, sprites) | **9.9 MB** | 31.9 MB | 31.9 MB |
| Render targets (post chain + shadow map) | 11.8 MB | 4.8 MB | 44.7 MB |
| Total estimated GPU texture memory | **21.7 MB** | 36.7 MB | 76.6 MB |
| Largest texture | PMREM 384×512 (1.5 MB) | PMREM 768×1024 (6.3 MB) | same as low |

How to read the table:
- Mobile renders at **2.25× low's pixel count**, yet uses fewer triangles (−28%), much less texture memory (−69%)
  and no shadow pass.
- Mobile has +10 draw calls over low. Bloom adds about 13 passes, the contact shadows add 1, and the reduced
  backdrop removes about 5. Bloom passes are cheap, low-resolution fills.
- Most of the remaining triangles are the static chamber kit (~0.2 M before culling).
- Characters are 18 draw calls each at every LOD. LOD 1 cuts each character from 52 k to 13 k triangles, which
  matters when many echoes and nested copies are on screen.

## Shared-file edits (minimal, additive)

| File | Edit |
|---|---|
| `src/app/flow.ts` (director) | `rendererQuality()` now delegates to `resolveQuality(q, deviceProfile())`. `'auto'` resolves by device; existing mappings are unchanged. |
| `src/app/bootstrap.ts` (director) | `visibilitychange` handler after the boot `requestAnimationFrame`, and its removal in `dispose()`. |
| `src/engine/audio/types.ts`, `AudioSystem.ts` (audio) | New optional `setBackgrounded?(hidden)` (suspend / resume the AudioContext). |
| `src/ui/menus/Settings.ts` (UI) | `QUALITY_LABELS` gains `auto: 'Auto'` and `mobile: 'Mobile'`. |
| `src/ui/ui.test.ts` (UI) | The default-preset expectation changes from 'High' to 'Auto'. |
| `src/persistence/settings.ts` (owned for quality) | Presets now include `auto` and `mobile`; the default is `auto`. |

New files:
- `src/engine/rendering/{device,resolution,memory}.ts` and their tests;
- `src/graphics/effects/contactShadows.ts`;
- `src/graphics/animation/characterLod.test.ts`.

## Tests added
- `device.test.ts`:
  - iPhone, legacy iPad and iPadOS desktop UA detected as mobile; Mac without touch stays desktop;
  - Android phone and tablet are mobile; touch laptops and big touch screens are desktop;
  - auto, unknown and explicit preset resolution;
  - the default save is `auto`;
  - the 30 / 60 fps targets;
  - mobile preset budgets, and desktop presets unchanged.
- `resolution.test.ts`: holding at target, stepping down to the floor, the 30 fps target, the hysteresis band,
  delayed step-up, robustness to hitches via the median, stalls, slow devices, oscillation backoff, reset and
  invalid samples.
- `memory.test.ts`: texel sizes, mips, half-float, de-duplicating shared textures, render-target totals.
- `characterLod.test.ts`: LOD 1 has the same bones with under 65% of the triangles (actual 26%); LOD 0 is cached
  and untouched.

## Not done / open
- Real iPhone hardware was not available (Chromium emulation only, no WebKit), so fps on a real device is
  unmeasured. Next step: play L10 on an iPhone with `?quality=mobile` and watch `__RECURSION__.renderStats()`
  (`renderScale`, `pixelRatio`).
- Draw calls stay around 270 on L10. The main remaining levers are merging the 18 per-bone character meshes
  (needs skinning, which is art work) and LOD for the static kit (~0.2 M triangles).
- Procedural texture resolution is fixed when the renderer is created. Switching to Mobile in Settings mid-session
  applies everything except the half-resolution textures, which need a reload.
- Settings now shows 6 quality buttons; the UI / mobile UX owner should check that the row fits at phone width.
- The gamepad press that skips the intro belongs to the input / gamepad owner (`index.html` is being edited by
  them this round); I did not touch it.
- Screenshots: `l10-*`, `chamber-*-crop`, `iphone-after-restore` are in the session scratchpad (not committed).
