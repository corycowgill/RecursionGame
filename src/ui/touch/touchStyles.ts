import { JOYSTICK_RADIUS } from './joystick';

/**
 * MOBILE / TOUCH STYLESHEET (round 3) — injected once beside the main UI stylesheet, so `styles.ts` stays the
 * desktop source of truth. Three layers:
 *   1. page-level iOS hygiene: no double-tap / pinch page zoom, no rubber-band scroll, no text selection, no
 *      long-press callout or tap highlight; menus that overflow scroll inside themselves;
 *   2. the on-screen controls, the rotate overlay and the Add to Home Screen hint;
 *   3. a compact layout for short (phone landscape, ~852×393) or narrow viewports, with safe-area padding around
 *      the notch / Dynamic Island and the home indicator (`env(safe-area-inset-*)`, needs viewport-fit=cover).
 * Root classes set by createUI: `rx-touchdev` (touch-capable), `rx-touch-on` (touch is the last-used device),
 * `rx-tplay` (on-screen controls showing).
 */
const R = JOYSTICK_RADIUS;

export const TOUCH_CSS = /* css */ `
html, body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
#app, #app canvas { touch-action: none; }
.rx-root { -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  --sa-t: env(safe-area-inset-top, 0px); --sa-r: env(safe-area-inset-right, 0px); --sa-b: env(safe-area-inset-bottom, 0px); --sa-l: env(safe-area-inset-left, 0px);
  --gx-l: max(1.6em, calc(var(--sa-l) + .4em)); --gx-r: max(1.6em, calc(var(--sa-r) + .4em)); --gy-t: max(1.4em, calc(var(--sa-t) + .4em)); --gy-b: max(1.2em, calc(var(--sa-b) + .3em)); }
.rx-root button, .rx-root [role="slider"], .rx-root input { touch-action: manipulation; }
/* Screens that can overflow scroll inside themselves (the page never scrolls). */
.rx-dialog, .rx-screen.rx-pause, .rx-screen.rx-intro, .rx-screen.rx-menu, .rx-screen.rx-complete, .rx-tabs, .rx-tl.expanded { touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.rx-tabs { touch-action: pan-x; }
.rx-root .rx-touch-only { display: none !important; }
.rx-root.rx-touch-on .rx-touch-only { display: inline-flex !important; }
.rx-root.rx-touch-on .rx-kb-only { display: none !important; }

/* ---------- touch glyphs (tutorial cards, prompts) ---------- */
.rx-key.rx-touchkey { gap: .4em; height: 2.1em; padding: 0 .75em 0 .45em; border-radius: 1.05em; border-width: 1px; color: var(--rx-cyan-hi); border-color: var(--rx-cyan-dim); background: radial-gradient(circle at 30% 40%, rgba(63,217,255,.18), rgba(0,0,0,.3)); letter-spacing: .14em; text-transform: uppercase; font-size: .62em; }
.rx-key.rx-touchkey svg { width: 1.4em; height: 1.4em; }
.rx-key.rx-touchkey.t-interact { color: var(--rx-gold-hi); border-color: var(--rx-gold-dim); background: radial-gradient(circle at 30% 40%, rgba(255,181,74,.2), rgba(0,0,0,.3)); }
.rx-key.rx-touchkey.t-rewind { color: #ffb3aa; border-color: rgba(255,107,94,.5); }
.rx-key.rx-touchkey .stick { width: 1.15em; height: 1.15em; border-radius: 50%; border: 1px solid currentColor; box-shadow: inset 0 0 0 .22em rgba(4,10,20,.7), inset 0 0 0 1em rgba(255,216,148,.45); }
.rx-onboard .keys .rx-key.rx-touchkey { min-width: 0; height: 2.4em; font-size: .7em; }

/* ---------- on-screen controls ---------- */
.rx-touch { position: absolute; inset: 0; pointer-events: none; }
.rx-tzone { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
.rx-joy { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; will-change: transform; }
.rx-joy .base { position: absolute; left: 0; top: 0; width: ${R * 2}px; height: ${R * 2}px; transform: translate(-50%, -50%); border-radius: 50%;
  border: 1.5px solid rgba(63,217,255,.42); background: radial-gradient(circle, rgba(63,217,255,.08) 0, rgba(4,10,20,.42) 72%);
  box-shadow: 0 0 26px rgba(63,217,255,.16), inset 0 0 20px rgba(63,217,255,.12); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.rx-joy .base .ring { position: absolute; inset: 22%; border-radius: 50%; border: 1px dashed rgba(118,196,255,.28); }
.rx-joy .base i { position: absolute; left: 50%; top: 50%; width: 2px; height: 7px; margin: -3.5px 0 0 -1px; background: rgba(255,181,74,.55); border-radius: 1px; }
.rx-joy .knob { position: absolute; left: 0; top: 0; width: 56px; height: 56px; transform: translate(-50%, -50%); border-radius: 50%;
  border: 1.5px solid rgba(255,216,148,.85); background: radial-gradient(circle at 50% 36%, rgba(255,216,148,.55), rgba(255,181,74,.2) 58%, rgba(4,10,20,.55));
  box-shadow: 0 0 18px rgba(255,181,74,.42), inset 0 1px 0 rgba(255,255,255,.25); }
.rx-joy.on .base { border-color: rgba(63,217,255,.7); box-shadow: 0 0 30px rgba(63,217,255,.28), inset 0 0 22px rgba(63,217,255,.18); }
.rx-joy.ghost { left: calc(max(18px, var(--sa-l)) + ${R + 22}px); top: auto; bottom: calc(max(14px, var(--sa-b)) + ${R + 26}px); opacity: .34; transition: opacity .3s; }
.rx-joy.ghost .tip { position: absolute; left: 0; top: ${R + 12}px; transform: translateX(-50%); font-family: var(--rx-display); font-size: 9px; letter-spacing: .3em; text-transform: uppercase; color: var(--rx-cyan-hi); white-space: nowrap; }
.rx-touch:not(.play) .rx-joy, .rx-touch:not(.play) .rx-tbtns { display: none; }

.rx-tbtns { position: absolute; right: max(14px, calc(var(--sa-r) + 4px)); bottom: max(12px, calc(var(--sa-b) + 2px)); width: 226px; height: 196px; pointer-events: none; }
.rx-tbtn { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0; border-radius: 50%; cursor: pointer; pointer-events: auto; touch-action: none;
  color: var(--rx-cyan-hi); border: 1.5px solid rgba(118,196,255,.5); background: radial-gradient(circle at 50% 32%, rgba(63,217,255,.2), rgba(6,14,28,.62) 68%);
  box-shadow: 0 6px 18px rgba(0,0,0,.35), 0 0 16px rgba(63,217,255,.14), inset 0 1px 0 rgba(255,255,255,.12);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); opacity: .9; transition: transform .08s, background .12s, box-shadow .12s, opacity .2s; }
.rx-tbtn .ic { display: grid; place-items: center; }
.rx-tbtn .ic svg { width: 22px; height: 22px; }
.rx-tbtn .tx { font-family: var(--rx-display); font-size: 7px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; opacity: .92; }
.rx-tbtn.down { transform: scale(.9); opacity: 1; background: radial-gradient(circle at 50% 32%, rgba(63,217,255,.42), rgba(6,14,28,.7) 70%); box-shadow: 0 0 26px rgba(63,217,255,.45), inset 0 0 16px rgba(63,217,255,.3); }
.rx-tbtn.b-interact { right: 4px; bottom: 6px; width: 86px; height: 86px; color: var(--rx-gold-hi); border-color: rgba(255,216,148,.75);
  background: radial-gradient(circle at 50% 32%, rgba(255,181,74,.3), rgba(20,14,6,.6) 68%); box-shadow: 0 6px 20px rgba(0,0,0,.4), 0 0 20px rgba(255,181,74,.22), inset 0 1px 0 rgba(255,255,255,.18); }
.rx-tbtn.b-interact .ic svg { width: 30px; height: 30px; }
.rx-tbtn.b-interact .tx { font-size: 8.5px; }
.rx-tbtn.b-interact.down { background: radial-gradient(circle at 50% 32%, rgba(255,181,74,.6), rgba(30,18,4,.7) 70%); box-shadow: 0 0 30px rgba(255,181,74,.6); }
.rx-tbtn.b-interact.ready { animation: rx-tready 1.3s ease-in-out infinite; }
.rx-tbtn.b-interact.blocked { color: #ffc2bc; border-color: rgba(255,107,94,.7); }
@keyframes rx-tready { 0%,100% { box-shadow: 0 6px 20px rgba(0,0,0,.4), 0 0 18px rgba(255,181,74,.3), 0 0 0 0 rgba(255,181,74,.0); } 50% { box-shadow: 0 6px 20px rgba(0,0,0,.4), 0 0 30px rgba(255,181,74,.6), 0 0 0 7px rgba(255,181,74,.14); } }
.rx-tprompt { position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%); padding: .3em .7em; border-radius: 1em; white-space: nowrap; pointer-events: none;
  font-family: var(--rx-display); font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #1b1203; background: linear-gradient(90deg, var(--rx-gold), var(--rx-gold-hi)); box-shadow: 0 0 14px rgba(255,181,74,.55); }
/* Right-anchored so long labels ("Activate switch") never run off the right edge of the screen. */
.rx-tbtns .rx-tprompt { left: auto; right: 0; transform: none; }
/* Director round 4: during touch play the HUD's centre prompt already names the verb (and the blocked state), and the
   tag above Interact covered the Timeline button and its label. Keep the Interact glow / blocked colour, drop the tag. */
.rx-root.rx-tplay .rx-tbtns .rx-tprompt { display: none; }
.rx-tbtn.b-interact.blocked .rx-tprompt { color: #fff; background: rgba(255,107,94,.85); box-shadow: 0 0 14px rgba(255,107,94,.5); }
.rx-tbtn.b-echo { right: 104px; bottom: 0; width: 64px; height: 64px; color: #ffc3bb; border-color: rgba(255,107,94,.6); background: radial-gradient(circle at 50% 32%, rgba(255,107,94,.24), rgba(24,8,8,.6) 68%); }
.rx-tbtn.b-echo.down { background: radial-gradient(circle at 50% 32%, rgba(255,107,94,.5), rgba(24,8,8,.7) 70%); box-shadow: 0 0 26px rgba(255,107,94,.5); }
.rx-tbtn.b-timeline { right: 96px; bottom: 86px; width: 56px; height: 56px; }
.rx-tbtn.b-preview { right: 18px; bottom: 112px; width: 58px; height: 58px; color: #d9c8ff; border-color: rgba(167,123,255,.6); background: radial-gradient(circle at 50% 32%, rgba(167,123,255,.24), rgba(12,8,26,.6) 68%); }
.rx-tbtn.b-action { right: 168px; bottom: 70px; width: 52px; height: 52px; color: #b6f5d8; border-color: rgba(92,226,170,.6); background: radial-gradient(circle at 50% 32%, rgba(92,226,170,.24), rgba(6,22,16,.6) 68%); }
.rx-tbtn.b-action:not(.avail) { display: none; }
.rx-tbtn.b-action.down { background: radial-gradient(circle at 50% 32%, rgba(92,226,170,.5), rgba(6,22,16,.7) 70%); box-shadow: 0 0 26px rgba(92,226,170,.5); }
.rx-key.rx-touchkey.t-action { color: #b6f5d8; border-color: rgba(92,226,170,.5); background: radial-gradient(circle at 30% 40%, rgba(92,226,170,.18), rgba(0,0,0,.3)); }
.rx-tbtn.b-preview.down { background: radial-gradient(circle at 50% 32%, rgba(167,123,255,.5), rgba(12,8,26,.7) 70%); box-shadow: 0 0 26px rgba(167,123,255,.55); }
.rx-tpause { position: absolute; top: max(10px, calc(var(--sa-t) + 4px)); right: max(12px, calc(var(--sa-r) + 4px)); width: 48px; height: 48px; display: grid; place-items: center; padding: 0; cursor: pointer; pointer-events: auto; touch-action: manipulation;
  color: var(--rx-text); border: 1px solid var(--rx-line-strong); border-radius: 3px; background: linear-gradient(180deg, var(--rx-panel-a), var(--rx-panel-b)); box-shadow: 0 8px 20px rgba(0,0,0,.35); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.rx-tpause::before, .rx-tpause::after { content: ''; position: absolute; width: 9px; height: 9px; pointer-events: none; }
.rx-tpause::before { left: -1px; top: -1px; border-left: 1px solid var(--rx-gold); border-top: 1px solid var(--rx-gold); }
.rx-tpause::after { right: -1px; bottom: -1px; border-right: 1px solid var(--rx-gold); border-bottom: 1px solid var(--rx-gold); }
.rx-tpause svg { width: 20px; height: 20px; }
.rx-tpause:active { transform: scale(.94); }
.rx-tchip { position: absolute; left: 50%; top: calc(var(--gy-t) + 4.2em); transform: translateX(-50%); display: flex; align-items: center; gap: .5em; padding: .45em .9em; border-radius: 1.2em; pointer-events: none;
  font-family: var(--rx-display); font-size: .58em; letter-spacing: .22em; text-transform: uppercase; color: var(--rx-cyan-hi); background: rgba(4,10,20,.72); border: 1px solid var(--rx-cyan-dim); }
.rx-tchip svg { width: 1.4em; height: 1.4em; }

/* touch play: the HUD makes room for the controls */
.rx-root.rx-touch-on .rx-controls { display: none; }
.rx-root.rx-touch-on .rx-tl-head .rx-btn .rx-key { display: none; }
.rx-root.rx-touch-on .rx-tl.compact .rx-tl-head .rx-btn { display: none; }
.rx-rec .loop { white-space: nowrap; }
.rx-root.rx-tplay .rx-prompt .rx-key { display: none; }
.rx-root.rx-tplay .rx-prompt { padding-left: 1.1em; }
.rx-root.rx-thaspause .rx-hud-time { right: calc(max(12px, calc(var(--sa-r) + 4px)) + 58px); }
.rx-root.rx-tplay .rx-tl.compact { left: calc(max(18px, var(--sa-l)) + ${R * 2 + 70}px); right: calc(max(14px, var(--sa-r)) + 240px); }
.rx-root.rx-tplay .rx-hold { display: none; }

/* timeline: tap-to-expand strip and a bottom sheet with big drag targets (touch) */
.rx-root.rx-touch-on .rx-tl.compact { cursor: pointer; }
.rx-root.rx-touch-on .rx-tl.compact .rx-tl-stage { pointer-events: none; }
.rx-tl-touchhint { align-items: center; gap: .45em; font-family: var(--rx-display); font-size: .54em; letter-spacing: .24em; text-transform: uppercase; color: var(--rx-cyan-hi); opacity: .85; }
.rx-tl.compact .rx-tl-touchhint .drag { display: none; }
.rx-tl.expanded .rx-tl-touchhint .tap { display: none; }
.rx-root.rx-touch-on .rx-tl.expanded { --rx-lane-h: 2.5em; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-body { --rx-tl-label: 15.5em; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-label .name small { display: none; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-label .acts { gap: 0; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-label .acts .rx-iconbtn { width: 38px; height: 38px; min-width: 38px; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-mk { width: 1.35em; height: 1.35em; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-span { height: 9px; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(63,217,255,.12); }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-head .rx-btn { min-height: 40px; padding: .5em .9em; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tcb { min-height: 48px; }
.rx-tl-grab { display: none; }
.rx-root.rx-touch-on .rx-tl.expanded .rx-tl-grab { display: block; position: absolute; left: 50%; top: 5px; width: 44px; height: 4px; margin-left: -22px; border-radius: 2px; background: rgba(118,196,255,.4); }

/* hold-to-confirm fill (pause → Restart chamber on touch) */
.rx-btn.rx-holding { border-color: rgba(255,107,94,.6); }
.rx-btn.rx-holding::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(255,107,94,.38) 0 var(--hold, 0%), transparent var(--hold, 0%)); }
.rx-btn .rx-holdtag { margin-left: .6em; font-size: .78em; letter-spacing: .2em; color: var(--rx-coral); opacity: .85; }

/* ---------- rotate overlay ---------- */
.rx-rotate { position: absolute; inset: 0; z-index: 200; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3em; padding: max(24px, var(--sa-t)) 28px max(24px, var(--sa-b)); text-align: center; pointer-events: auto; touch-action: none;
  background: radial-gradient(120% 80% at 50% 40%, rgba(8,18,36,.94), rgba(2,5,11,.985) 70%); overflow: hidden; animation: rx-fade .3s both; }
.rx-rotate .rx-rings { width: min(118vw, 560px); aspect-ratio: 1; left: 50%; top: 46%; transform: translate(-50%, -50%); opacity: .55; }
.rx-rotate .phone { position: relative; width: 58px; height: 100px; margin-bottom: 2.2em; border: 2px solid var(--rx-cyan-hi); border-radius: 12px; box-shadow: 0 0 24px rgba(63,217,255,.45), inset 0 0 18px rgba(63,217,255,.18); animation: rx-rot 2.6s cubic-bezier(.6,0,.3,1) infinite; }
.rx-rotate .phone .notch { position: absolute; left: 50%; top: 6px; width: 18px; height: 5px; margin-left: -9px; border-radius: 3px; background: var(--rx-cyan-hi); opacity: .8; }
.rx-rotate .phone .arrow { position: absolute; right: -30px; top: -22px; width: 30px; height: 30px; border: 2px solid var(--rx-gold); border-color: var(--rx-gold) var(--rx-gold) transparent transparent; border-radius: 50%; transform: rotate(10deg); }
.rx-rotate .phone .arrow::after { content: ''; position: absolute; right: -6px; bottom: 2px; border: 5px solid transparent; border-top-color: var(--rx-gold); transform: rotate(10deg); }
@keyframes rx-rot { 0%, 18% { transform: rotate(0); } 50%, 72% { transform: rotate(-90deg); } 100% { transform: rotate(0); } }
.rx-rotate h2 { position: relative; margin: .4em 0 .2em; font-family: var(--rx-display); font-weight: 500; font-size: 1.35em; letter-spacing: .3em; margin-right: -.3em; text-transform: uppercase; color: #fff; text-shadow: 0 0 22px rgba(120,200,255,.4); }
.rx-rotate p { position: relative; max-width: 22em; margin: .3em 0 0; color: var(--rx-dim); font-size: 1em; line-height: 1.5; }
.rx-rotate .rx-eyebrow { position: relative; }

/* ---------- Add to Home Screen hint (iOS Safari) ---------- */
.rx-a2hs { position: absolute; left: var(--gx-l); bottom: calc(var(--gy-b) + 2.4em); z-index: 2; display: flex; align-items: center; gap: .6em; max-width: 21em; padding: .65em .5em .65em 1em; animation: rx-in .5s .6s both; }
.rx-a2hs .txt { display: flex; flex-direction: column; gap: .15em; font-size: .92em; line-height: 1.35; }
.rx-a2hs b { font-family: var(--rx-display); font-size: .7em; font-weight: 600; letter-spacing: .26em; text-transform: uppercase; color: var(--rx-cyan-hi); }
.rx-a2hs span { color: var(--rx-text); }
.rx-a2hs svg { vertical-align: -3px; color: var(--rx-cyan-hi); }
.rx-a2hs em { font-style: normal; color: var(--rx-gold-hi); }
.rx-a2hs .rx-iconbtn { width: 44px; height: 44px; flex: none; }

/* bigger hit targets anywhere a finger is the device */
.rx-root.rx-touch-on .rx-btn { min-height: 44px; }
.rx-root.rx-touch-on .rx-iconbtn { min-width: 40px; min-height: 40px; }
.rx-root.rx-touch-on .rx-bind, .rx-root.rx-touch-on .rx-seg button { min-height: 40px; }
.rx-root.rx-touch-on .rx-switch { width: 3.8em; height: 2em; }
.rx-root.rx-touch-on .rx-range input { height: 36px; }
.rx-root.rx-touch-on .rx-range input::-webkit-slider-thumb { width: 20px; height: 20px; margin-top: -9px; }

/* ================================================================ compact layout: phone landscape / small screens */
@media (max-height: 520px), (max-width: 760px) {
  .rx-root { font-size: calc(12.5px * var(--rx-scale)); --gx-l: max(.9em, calc(var(--sa-l) + .3em)); --gx-r: max(.9em, calc(var(--sa-r) + .3em)); --gy-t: max(.7em, calc(var(--sa-t) + .3em)); --gy-b: max(.6em, calc(var(--sa-b) + .2em)); }

  /* HUD */
  .rx-hud-level { left: var(--gx-l); top: var(--gy-t); min-width: 0; width: 16em; max-width: 16em; padding: .55em .8em .6em; }
  .rx-hud-level h1 { font-size: .98em; margin: .25em 0 0; letter-spacing: .2em; }
  .rx-hud-level .sub { display: none; }
  .rx-objective { margin-top: .45em; padding-top: .45em; font-size: .9em; gap: .45em; }
  .rx-hud-time { right: var(--gx-r); top: var(--gy-t); width: 12.4em; padding: .5em .75em .55em; }
  .rx-clock { margin: .2em 0 .3em; }
  .rx-clock .now { font-size: 1.3em; }
  .rx-echoes { margin-top: .45em; padding-top: .4em; }
  .rx-echoes .lbl { display: none; }
  .rx-echoes .chips { gap: .15em; }
  .rx-echoes .chips .rx-badge, .rx-echoes .chips .rx-chip-empty { transform: scale(.8); margin: -2px; }
  .rx-prompt { bottom: calc(var(--rx-tl-h, 80px) + var(--gy-b) + .6em); padding: .45em .9em .45em .55em; }
  .rx-controls { right: var(--gx-r); bottom: calc(var(--rx-tl-h, 80px) + var(--gy-b) + .5em); gap: .8em; padding: .4em .7em; font-size: .5em; }
  .rx-hint { left: var(--gx-l); top: calc(var(--gy-t) + 10.2em); transform: none; width: 16em; padding: .6em .8em .7em; font-size: .9em; animation: rx-in .35s both; }
  .rx-onboard { top: var(--gy-t); width: min(26em, calc(100vw - 2 * 18.6em)); min-width: 0; padding: .6em .9em .7em; font-size: .9em; }
  .rx-onboard .title { margin: .2em 0 .25em; }
  .rx-onboard .keys { margin-top: .45em; }
  .rx-onboard .dots { margin-top: .45em; }
  .rx-toasts { top: 30%; }
  .rx-banner { top: 16%; }

  /* timeline: thin strip, sheet when expanded */
  .rx-tl { left: var(--gx-l); right: var(--gx-r); bottom: var(--gy-b); }
  .rx-tl.compact { padding: .35em .7em .45em; }
  .rx-tl.compact .rx-tl-head { height: 1.35em; gap: .6em; }
  .rx-tl.compact .rx-tl-head .rx-eyebrow { font-size: .56em; letter-spacing: .26em; }
  .rx-tl.compact .rx-tl-head .meta { display: none; }
  .rx-tl.compact .rx-tl-head .rx-btn.small { min-height: 0; padding: .2em .5em; }
  .rx-tl.compact .rx-tl-body { --rx-tl-label: 0px; --rx-lane-h: .62em; column-gap: 0; margin-top: .15em; }
  .rx-tl.compact .rx-tl-labels { display: none; }
  .rx-tl.compact .rx-tl-body { grid-template-columns: minmax(0, 1fr); }
  .rx-tl.compact .rx-tl-ruler { height: .5em; }
  .rx-tl.compact .rx-tl-ruler .t span { display: none; }
  .rx-tl.compact .rx-tl-span { height: 3px; }
  .rx-tl.compact .rx-mk { width: .6em; height: .6em; }
  .rx-tl.compact .rx-dv { width: .8em; height: .8em; }
  .rx-tl.expanded { left: var(--gx-l); right: var(--gx-r); bottom: 0; max-height: calc(100% - var(--gy-t) - .4em); overflow-y: auto; padding: .9em max(.9em, var(--sa-r)) calc(var(--sa-b) + .5em) max(.9em, var(--sa-l)); border-bottom: 0; border-radius: 10px 10px 0 0; scrollbar-width: none; }
  .rx-tl.expanded .rx-tl-body { --rx-tl-label: 12.5em; }
  .rx-tl.expanded .rx-tl-controls { margin-top: .4em; padding-top: .4em; gap: .1em; flex-wrap: nowrap; }
  .rx-tl.expanded .rx-tl-controls .sep { margin: .2em .4em; }
  .rx-tcb { min-width: 5.2em; padding: .35em .3em .3em; gap: .3em; }
  .rx-tcb .ic { width: 2.2em; height: 2.2em; }

  /* menus */
  .rx-screen.rx-menu { display: flex; align-items: center; padding: var(--gy-t) var(--gx-r) calc(var(--gy-b) + 1.6em) var(--gx-l); overflow-y: auto; }
  .rx-menu .rx-rings { width: min(118vh, 520px); left: calc(var(--gx-l) + 9em); top: 50%; }
  .rx-logo-block { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15em, 21em); grid-template-rows: 1fr auto 1fr; column-gap: 2.6em; align-items: center; width: 100%; max-width: 62em; margin: 0 auto; }
  .rx-logo-block > :not(.rx-menu-list) { grid-column: 1; }
  .rx-logo { font-size: 2.35em; align-self: end; }
  .rx-tagline { margin-top: .8em; font-size: .7em; letter-spacing: .42em; }
  .rx-tags { margin-top: .7em; font-size: .56em; align-self: start; }
  .rx-menu-list { grid-column: 2; grid-row: 1 / span 3; margin-top: 0; width: 100%; gap: .4em; }
  .rx-menu-list .rx-btn { padding: .72em 1em; min-height: 46px; }
  .rx-menu-foot { left: var(--gx-l); right: var(--gx-r); bottom: var(--gy-b); font-size: .52em; }
  .rx-center { padding: var(--gy-t) var(--gx-r) var(--gy-b) var(--gx-l); }
  .rx-dialog { max-height: 100%; padding: .9em 1.1em 1em; }
  .rx-dialog-head { margin-bottom: .6em; }
  .rx-dialog-head h2 { font-size: 1.2em; }
  .rx-dialog-foot { margin-top: .8em; }
  .rx-levels { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .5em; }
  .rx-level { min-height: 7.4em; padding: .55em .6em .5em; }
  .rx-level .no { font-size: 1.4em; }
  .rx-level .nm { margin-top: .35em; min-height: 2.5em; font-size: .6em; letter-spacing: .14em; }
  .rx-level .st { right: .5em; top: .55em; }
  .rx-level .best { display: none; }
  .rx-level .stars { margin-top: auto; }
  .rx-tabs { overflow-x: auto; scrollbar-width: none; margin-bottom: .6em; }
  .rx-tab { padding: .7em .9em; white-space: nowrap; }
  .rx-field { grid-template-columns: minmax(0, 1fr) minmax(190px, 48%); padding: .45em 0; gap: .7em; }
  .rx-binds { grid-template-columns: minmax(0, 1fr) 8em 8em; }
  .rx-screen.rx-pause { grid-template-columns: minmax(0, 330px) minmax(0, 300px); align-content: start; align-items: start; gap: .8em; padding: var(--gy-t) var(--gx-r) var(--gy-b) var(--gx-l); overflow-y: auto; }
  .rx-pause .rx-panel { padding: .9em 1.1em 1em; }
  .rx-pause h2 { font-size: 1.45em; margin: .2em 0 0; }
  .rx-pause .list { margin-top: .7em; gap: .35em; }
  .rx-pause .list .rx-btn { min-height: 42px; padding: .55em 1em; }
  .rx-screen.rx-intro { padding: var(--gy-t) var(--gx-r) var(--gy-b) max(2em, calc(var(--sa-l) + 1em)); overflow-y: auto; align-items: center; }
  .rx-intro h1 { font-size: 1.95em; }
  .rx-intro .subtitle { font-size: .72em; }
  .rx-intro .story { margin-top: .8em; }
  .rx-intro .story li { font-size: 1em; line-height: 1.45; }
  .rx-intro .facts { margin-top: .8em; }
  .rx-intro .go { margin-top: 1em; }
  .rx-screen.rx-complete { overflow-y: auto; padding: var(--gy-t) var(--gx-r) var(--gy-b) var(--gx-l); }
  .rx-complete .rx-panel { width: min(520px, 100%); padding: 1em 1.4em 1em; }
  .rx-complete h2 { font-size: 1.4em; margin-top: .2em; }
  .rx-stars { margin: .7em 0 .6em; }
  .rx-star svg, .rx-star svg.rx-ico { width: 2em; height: 2em; }
  .rx-result { padding: .5em .65em; }
  .rx-result .v { font-size: 1.1em; }
  .rx-newbest { margin-top: .6em; }
  .rx-complete .actions { margin-top: .8em; }
}
.rx-tl.compact .rx-tl-head > * { white-space: nowrap; }
@media (max-width: 800px) { .rx-root.rx-touch-on .rx-tl.compact .rx-tl-head .rx-eyebrow { display: none; } }
@media (max-height: 400px) { .rx-root.rx-tplay .rx-hint { width: 14em; font-size: .82em; } }
/* Very short screens (small phones in landscape): the level card keeps only the name. */
@media (max-height: 400px) {
  .rx-objective .conds { display: none; }
  .rx-hint { top: calc(var(--gy-t) + 8.6em); }
}
/*
 * Short phone screens (<= 360 CSS px tall, e.g. small phones in landscape with browser bars) while the touch controls
 * are up: the hint never sits in the joystick zone. It arrives as a small chip right under the level card (its bottom
 * edge is measured by the HUD) and expands on tap OVER the level card, i.e. still in the top band, never lower than
 * the joystick's rest position; a finger on the joystick folds it back (createUI).
 */
@media (max-height: 360px) {
  .rx-root.rx-tplay .rx-hint { left: var(--gx-l); top: var(--gy-t); z-index: 3; width: calc(16em / .82); box-sizing: border-box; max-height: calc(100% - var(--gy-t) - ${R * 2 + 64}px); overflow-y: auto; font-size: .82em; scrollbar-width: none; }
  .rx-root.rx-tplay .rx-hint.collapsed { top: calc(var(--rx-lvl-b, 9em) + 6px); width: auto; max-height: none; overflow: visible; padding: .45em .8em; border-radius: 1.4em; font-size: .78em; }
  .rx-root.rx-tplay .rx-hint.collapsed .hd .rx-eyebrow { white-space: nowrap; }
  .rx-root.rx-tplay .rx-hint.collapsed .hd::after { content: 'Tap'; margin-left: .2em; font-family: var(--rx-display); font-size: .62em; letter-spacing: .22em; text-transform: uppercase; color: var(--rx-cyan-hi); opacity: .8; }
  .rx-root.rx-tplay .rx-hint.fresh { animation: rx-hintpulse 1.2s ease-in-out 3; }
}
@keyframes rx-hintpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,181,74,0); } 50% { box-shadow: 0 0 18px rgba(255,181,74,.55), 0 0 0 4px rgba(255,181,74,.18); } }
@media (max-width: 760px) and (orientation: portrait) {
  .rx-logo-block { grid-template-columns: 1fr; }
  .rx-menu-list { grid-column: 1; grid-row: auto; margin-top: 1.4em; }
}
`;

/** Injects the touch / mobile stylesheet once per document. */
export function injectTouchStyles(doc: Document = document): void {
  if (doc.getElementById('rx-touch-styles')) return;
  const style = doc.createElement('style');
  style.id = 'rx-touch-styles';
  style.textContent = TOUCH_CSS;
  doc.head.appendChild(style);
}
