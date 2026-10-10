/**
 * RECURSION UI stylesheet (injected once). Visual language from the concept sheet: deep-navy glass panels,
 * hairline cyan rules, gold accents and corner brackets, wide-tracked uppercase Orbitron headings with Rajdhani
 * body text, restrained animated glows. All colours are CSS variables so the high-contrast mode and UI scale can
 * retheme everything.
 */
export const UI_CSS = /* css */ `
.rx-root {
  --rx-gold: #ffb54a; --rx-gold-hi: #ffd894; --rx-gold-dim: rgba(255,181,74,.42);
  --rx-cyan: #3fd9ff; --rx-cyan-hi: #b5f3ff; --rx-cyan-dim: rgba(63,217,255,.35);
  --rx-coral: #ff6b5e; --rx-violet: #a77bff; --rx-teal: #2ee6c5;
  --rx-text: #dce9f6; --rx-dim: #8ea6bf; --rx-faint: #5b7189;
  --rx-panel-a: rgba(12, 24, 44, .80); --rx-panel-b: rgba(5, 11, 22, .86);
  --rx-line: rgba(118, 196, 255, .20); --rx-line-strong: rgba(118, 196, 255, .38);
  --rx-display: 'Orbitron', 'Eurostile', 'Bank Gothic', 'Segoe UI', system-ui, sans-serif;
  --rx-body: 'Rajdhani', 'Barlow Semi Condensed', 'Arial Narrow', 'Segoe UI', system-ui, sans-serif;
  --rx-scale: 1;
  position: absolute; inset: 0; overflow: hidden;
  font-family: var(--rx-body); font-size: calc(15px * var(--rx-scale)); font-weight: 500;
  color: var(--rx-text); line-height: 1.35; letter-spacing: .02em;
  -webkit-font-smoothing: antialiased; user-select: none;
}
.rx-root.rx-hc { --rx-line: rgba(170, 220, 255, .42); --rx-line-strong: rgba(200, 235, 255, .7); --rx-dim: #c3d4e6; --rx-faint: #93a8bf; --rx-panel-a: rgba(4,10,20,.94); --rx-panel-b: rgba(2,6,12,.96); }
.rx-root *, .rx-root *::before, .rx-root *::after { box-sizing: border-box; }
.rx-root [hidden] { display: none !important; }
.rx-root button { font: inherit; color: inherit; }
.rx-interactive, .rx-root button, .rx-root input, .rx-root [role="slider"], .rx-root [role="tab"] { pointer-events: auto; }
.rx-root svg.rx-ico { width: 1.25em; height: 1.25em; flex: none; }
.rx-sr { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- typography ---------- */
.rx-display { font-family: var(--rx-display); text-transform: uppercase; letter-spacing: .24em; font-weight: 500; }
.rx-eyebrow { font-family: var(--rx-display); font-size: .66em; font-weight: 600; letter-spacing: .34em; text-transform: uppercase; color: var(--rx-gold); }
.rx-eyebrow.cyan { color: var(--rx-cyan); }
.rx-muted { color: var(--rx-dim); }
.rx-num { font-family: var(--rx-display); font-variant-numeric: tabular-nums; letter-spacing: .06em; }

/* ---------- glass panel with gold corner brackets ---------- */
.rx-panel {
  position: relative; pointer-events: auto;
  background: linear-gradient(180deg, var(--rx-panel-a), var(--rx-panel-b));
  border: 1px solid var(--rx-line);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 0 1px rgba(0,0,0,.25), 0 18px 50px rgba(0,0,0,.45);
  -webkit-backdrop-filter: blur(12px) saturate(135%); backdrop-filter: blur(12px) saturate(135%);
  border-radius: 3px;
}
.rx-panel::before, .rx-panel::after { content: ''; position: absolute; width: 14px; height: 14px; pointer-events: none; }
.rx-panel::before { left: -1px; top: -1px; border-left: 1px solid var(--rx-gold); border-top: 1px solid var(--rx-gold); }
.rx-panel::after { right: -1px; bottom: -1px; border-right: 1px solid var(--rx-gold); border-bottom: 1px solid var(--rx-gold); }
.rx-panel.cyan::before, .rx-panel.cyan::after { border-color: var(--rx-cyan); }
.rx-rule { height: 1px; background: linear-gradient(90deg, var(--rx-gold-dim), var(--rx-line) 30%, transparent); border: 0; margin: .8em 0; }
.rx-hair { position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(63,217,255,.55), transparent); pointer-events: none; }

/* ---------- buttons ---------- */
.rx-btn {
  position: relative; display: inline-flex; align-items: center; gap: .8em; cursor: pointer;
  padding: .82em 1.3em; min-height: 2.9em;
  font-family: var(--rx-display); font-size: .78em; font-weight: 600; letter-spacing: .24em; text-transform: uppercase;
  color: var(--rx-text); background: linear-gradient(90deg, rgba(14,30,54,.72), rgba(8,16,30,.55));
  border: 1px solid var(--rx-line); border-radius: 2px;
  transition: border-color .18s, color .18s, background .25s, box-shadow .25s, transform .18s;
}
.rx-btn::before { content: ''; position: absolute; left: -1px; top: 18%; bottom: 18%; width: 2px; background: var(--rx-gold); box-shadow: 0 0 10px var(--rx-gold); transform: scaleY(0); transition: transform .2s; }
.rx-btn:hover, .rx-btn:focus-visible { color: #fff; border-color: var(--rx-gold-dim); background: linear-gradient(90deg, rgba(255,181,74,.16), rgba(14,30,54,.55) 55%); box-shadow: 0 0 26px rgba(255,181,74,.12); }
.rx-btn:hover::before, .rx-btn:focus-visible::before { transform: scaleY(1); }
.rx-root :focus-visible { outline: 1px solid var(--rx-cyan); outline-offset: 3px; }
.rx-btn:active { transform: translateY(1px); }
.rx-btn[disabled], .rx-btn[aria-disabled="true"] { opacity: .38; cursor: not-allowed; }
.rx-btn[disabled]::before { display: none; }
.rx-btn.primary { color: var(--rx-gold-hi); border-color: var(--rx-gold-dim); background: linear-gradient(90deg, rgba(255,181,74,.18), rgba(14,30,54,.6) 70%); }
.rx-btn.ghost { background: transparent; border-color: transparent; }
.rx-btn.ghost:hover, .rx-btn.ghost:focus-visible { border-color: var(--rx-line); }
.rx-btn.small { font-size: .66em; padding: .6em .9em; min-height: 2.4em; }
.rx-btn .rx-btn-idx { color: var(--rx-gold); opacity: .7; font-size: .85em; letter-spacing: .1em; min-width: 1.8em; }
.rx-btn .rx-btn-sub { display: block; font-family: var(--rx-body); font-size: 1.05em; font-weight: 600; letter-spacing: .14em; color: var(--rx-cyan); opacity: .85; margin-top: .25em; }
.rx-btn .rx-chev { margin-left: auto; opacity: .45; transition: opacity .2s, transform .2s; }
.rx-btn:hover .rx-chev, .rx-btn:focus-visible .rx-chev { opacity: 1; transform: translateX(3px); color: var(--rx-gold); }
.rx-iconbtn { display: inline-grid; place-items: center; width: 1.9em; height: 1.9em; padding: 0; cursor: pointer; border-radius: 2px; border: 1px solid transparent; background: transparent; color: var(--rx-dim); transition: color .15s, border-color .15s, background .15s; }
.rx-iconbtn:hover, .rx-iconbtn:focus-visible { color: #fff; border-color: var(--rx-line); background: rgba(63,217,255,.08); }
.rx-iconbtn.danger:hover, .rx-iconbtn.danger:focus-visible { color: var(--rx-coral); border-color: rgba(255,107,94,.45); background: rgba(255,107,94,.08); }
.rx-iconbtn svg { width: 1.05em; height: 1.05em; }

/* ---------- key caps ---------- */
.rx-key { display: inline-flex; align-items: center; justify-content: center; min-width: 1.85em; height: 1.85em; padding: 0 .5em; font-family: var(--rx-display); font-size: .7em; font-weight: 700; letter-spacing: .08em; color: var(--rx-gold-hi); border: 1px solid var(--rx-gold-dim); border-bottom-width: 2px; border-radius: 3px; background: linear-gradient(180deg, rgba(255,181,74,.12), rgba(0,0,0,.25)); white-space: nowrap; }
.rx-key.cyan { color: var(--rx-cyan-hi); border-color: var(--rx-cyan-dim); background: linear-gradient(180deg, rgba(63,217,255,.10), rgba(0,0,0,.25)); }

/* ---------- full-screen layers ---------- */
.rx-screen { position: absolute; inset: 0; pointer-events: auto; animation: rx-in .45s cubic-bezier(.2,.7,.2,1) both; }
.rx-backdrop { background: radial-gradient(120% 90% at 30% 45%, rgba(6,14,28,.62), rgba(2,5,11,.94) 70%); }
.rx-menu.rx-backdrop { background: linear-gradient(90deg, rgba(2,6,13,.92) 0%, rgba(3,8,16,.80) 38%, rgba(3,8,16,.35) 70%, rgba(2,5,11,.55) 100%), radial-gradient(90% 80% at 75% 40%, transparent, rgba(2,5,11,.6)); }
.rx-backdrop::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35;
  background-image: linear-gradient(rgba(118,196,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(118,196,255,.07) 1px, transparent 1px);
  background-size: 64px 64px; -webkit-mask-image: radial-gradient(70% 70% at 35% 50%, #000, transparent); mask-image: radial-gradient(70% 70% at 35% 50%, #000, transparent); }
.rx-dim { background: rgba(2, 5, 11, .62); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
@keyframes rx-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes rx-in-cx { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes rx-in-cy { from { opacity: 0; transform: translate(-8px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }
@keyframes rx-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rx-spin { to { transform: rotate(360deg); } }
@keyframes rx-spin-rev { to { transform: rotate(-360deg); } }
@keyframes rx-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.82); } }
@keyframes rx-breathe { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes rx-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes rx-flash { 0% { box-shadow: 0 0 0 0 rgba(63,217,255,.0); } 20% { box-shadow: 0 0 0 1px rgba(63,217,255,.8), 0 0 40px rgba(63,217,255,.35); } 100% { box-shadow: 0 0 0 0 rgba(63,217,255,0); } }
@keyframes rx-rise { from { opacity: 0; transform: translateY(14px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }

/* ---------- ring motif ---------- */
.rx-rings { position: absolute; pointer-events: none; }
.rx-rings svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rx-rings g { transform-origin: 250px 250px; }
.rx-rings .r1 { animation: rx-spin 140s linear infinite; }
.rx-rings .r2 { animation: rx-spin-rev 90s linear infinite; }
.rx-rings .r3 { animation: rx-spin 50s linear infinite; }
.rx-rings .r4 { animation: rx-spin-rev 26s linear infinite; }
.rx-rings .core { animation: rx-breathe 4.5s ease-in-out infinite; }

/* ---------- main menu ---------- */
.rx-menu { display: grid; grid-template-columns: minmax(380px, 46%) 1fr; align-items: center; padding: 0 6vw; }
.rx-menu .rx-rings { width: min(76vh, 640px); aspect-ratio: 1; left: calc(6vw + 210px); top: 50%; transform: translate(-50%, -58%); opacity: .9; }
.rx-logo-block { position: relative; z-index: 1; }
.rx-logo { margin: 0; font-family: var(--rx-display); font-weight: 500; font-size: 3.9em; letter-spacing: .34em; margin-right: -.34em; color: #f4f8ff;
  text-shadow: 0 0 22px rgba(120, 200, 255, .35), 0 0 2px rgba(255,255,255,.6); line-height: 1; white-space: nowrap; }
.rx-logo .o { color: var(--rx-gold-hi); text-shadow: 0 0 22px rgba(255,181,74,.6); }
.rx-tagline { margin-top: 1.05em; font-family: var(--rx-display); text-transform: uppercase; font-size: .82em; letter-spacing: .52em; color: var(--rx-cyan); text-shadow: 0 0 14px rgba(63,217,255,.45); }
.rx-tags { margin-top: .9em; display: flex; gap: 1.1em; text-transform: uppercase; font-family: var(--rx-display); font-size: .6em; letter-spacing: .3em; color: var(--rx-dim); }
.rx-tags i { color: var(--rx-gold); font-style: normal; }
.rx-menu-list { position: relative; z-index: 1; margin-top: 2.6em; display: flex; flex-direction: column; gap: .55em; width: min(370px, 100%); }
.rx-menu-list .rx-btn { width: 100%; text-align: left; padding: 1em 1.2em; }
.rx-menu-foot { position: absolute; left: 6vw; right: 6vw; bottom: 3.2vh; display: flex; justify-content: space-between; align-items: center; font-family: var(--rx-display); font-size: .6em; letter-spacing: .3em; color: var(--rx-faint); text-transform: uppercase; }
.rx-menu-foot .rx-key { font-size: 1em; }
.rx-menu-aside { justify-self: end; align-self: end; margin-bottom: 12vh; width: min(320px, 100%); padding: 1.1em 1.3em; }
.rx-stat-row { display: flex; justify-content: space-between; align-items: baseline; padding: .42em 0; border-bottom: 1px solid rgba(118,196,255,.08); }
.rx-stat-row:last-child { border-bottom: 0; }
.rx-stat-row .rx-num { color: #fff; }

/* ---------- generic dialog / sub-screens ---------- */
.rx-center { display: grid; place-items: center; padding: 4vh 4vw; }
.rx-dialog { width: min(820px, 100%); max-height: 92vh; overflow: auto; padding: 1.6em 1.9em 1.5em; scrollbar-width: thin; scrollbar-color: var(--rx-line) transparent; }
.rx-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 1em; margin-bottom: 1.1em; }
.rx-dialog-head h2 { margin: .25em 0 0; font-family: var(--rx-display); font-weight: 500; font-size: 1.55em; letter-spacing: .26em; text-transform: uppercase; color: #fff; }
.rx-dialog-foot { display: flex; justify-content: flex-end; gap: .7em; margin-top: 1.3em; }

/* ---------- level select ---------- */
.rx-levels { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .8em; }
.rx-level { position: relative; display: flex; flex-direction: column; align-items: stretch; text-align: left; gap: .3em; min-height: 11.2em; padding: .9em .95em .8em; cursor: pointer;
  background: linear-gradient(180deg, rgba(14,28,50,.78), rgba(6,12,24,.86)); border: 1px solid var(--rx-line); border-radius: 2px; transition: border-color .2s, transform .2s, box-shadow .2s; overflow: hidden; }
.rx-level:hover, .rx-level:focus-visible { border-color: var(--rx-cyan-dim); transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,.4), 0 0 24px rgba(63,217,255,.12); }
.rx-level .no { font-family: var(--rx-display); font-size: 1.9em; font-weight: 500; letter-spacing: .08em; color: rgba(220,233,246,.92); line-height: 1; }
.rx-level .nm { font-family: var(--rx-display); font-size: .66em; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #fff; margin-top: .55em; min-height: 2.6em; }
.rx-level .st { position: absolute; right: .7em; top: .75em; display: inline-flex; align-items: center; gap: .3em; font-family: var(--rx-display); font-size: .52em; letter-spacing: .22em; text-transform: uppercase; }
.rx-level .st svg { width: 1.6em; height: 1.6em; }
.rx-level .best { margin-top: auto; display: grid; grid-template-columns: 1fr auto; gap: .15em .5em; font-size: .82em; color: var(--rx-dim); }
.rx-level .best b { color: #fff; font-family: var(--rx-display); font-weight: 500; font-size: .86em; letter-spacing: .06em; }
.rx-level .stars { display: flex; gap: .25em; margin-top: .45em; }
.rx-level .stars svg { width: .95em; height: .95em; color: rgba(142,166,191,.35); }
.rx-level .stars svg.on { color: var(--rx-gold); filter: drop-shadow(0 0 4px rgba(255,181,74,.6)); }
.rx-level.completed { border-color: rgba(255,181,74,.32); }
.rx-level.completed .st { color: var(--rx-gold); }
.rx-level.completed::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: linear-gradient(var(--rx-gold), transparent); }
.rx-level.next { border-color: rgba(63,217,255,.45); box-shadow: inset 0 0 30px rgba(63,217,255,.08); }
.rx-level.next .st { color: var(--rx-cyan); animation: rx-breathe 2.4s ease-in-out infinite; }
.rx-level.locked { cursor: not-allowed; background: repeating-linear-gradient(135deg, rgba(10,18,32,.85) 0 8px, rgba(8,14,26,.85) 8px 16px); }
.rx-level.locked .no, .rx-level.locked .nm { color: var(--rx-faint); }
.rx-level.locked .st { color: var(--rx-faint); }
.rx-level.locked:hover { transform: none; box-shadow: none; border-color: var(--rx-line); }

/* ---------- settings ---------- */
.rx-tabs { display: flex; gap: .3em; border-bottom: 1px solid var(--rx-line); margin-bottom: 1.1em; }
.rx-tab { cursor: pointer; padding: .8em 1.1em; background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; font-family: var(--rx-display) !important; font-size: .68em !important; font-weight: 600; letter-spacing: .26em; text-transform: uppercase; color: var(--rx-dim) !important; }
.rx-tab[aria-selected="true"] { color: var(--rx-gold-hi) !important; border-bottom-color: var(--rx-gold); }
.rx-tab:hover { color: #fff !important; }
.rx-field { display: grid; grid-template-columns: 1fr minmax(240px, 44%); align-items: center; gap: 1em; padding: .62em 0; border-bottom: 1px solid rgba(118,196,255,.08); }
.rx-field-label { font-size: 1.02em; font-weight: 600; letter-spacing: .05em; color: #eaf3fc; }
.rx-field-label small { display: block; font-weight: 500; font-size: .86em; color: var(--rx-dim); letter-spacing: .02em; margin-top: .1em; }
.rx-seg { display: flex; border: 1px solid var(--rx-line); border-radius: 2px; overflow: hidden; }
.rx-seg button { flex: 1; cursor: pointer; padding: .62em .4em; background: transparent; border: 0; border-right: 1px solid var(--rx-line); font-family: var(--rx-display) !important; font-size: .6em !important; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--rx-dim) !important; transition: background .15s, color .15s; }
.rx-seg button:last-child { border-right: 0; }
.rx-seg button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(255,181,74,.22), rgba(255,181,74,.08)); color: var(--rx-gold-hi) !important; box-shadow: inset 0 -2px 0 var(--rx-gold); }
.rx-seg button:hover { color: #fff !important; }
.rx-seg.locked button { cursor: not-allowed; }
.rx-seg.locked button:hover { color: var(--rx-dim) !important; }
.rx-seg.locked button[aria-pressed="true"], .rx-seg.locked button[aria-pressed="true"]:hover { color: var(--rx-gold-hi) !important; }
.rx-range { display: flex; align-items: center; gap: .8em; }
.rx-range output { min-width: 3.4em; text-align: right; font-family: var(--rx-display); font-size: .74em; letter-spacing: .06em; color: var(--rx-gold-hi); }
.rx-range input { -webkit-appearance: none; appearance: none; flex: 1; height: 1.6em; background: transparent; cursor: pointer; margin: 0; }
.rx-range input::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(90deg, var(--rx-cyan) 0 var(--p, 50%), rgba(118,196,255,.18) var(--p, 50%) 100%); box-shadow: 0 0 8px rgba(63,217,255,.25); }
.rx-range input::-moz-range-track { height: 3px; border-radius: 2px; background: rgba(118,196,255,.18); }
.rx-range input::-moz-range-progress { height: 3px; background: var(--rx-cyan); }
.rx-range input::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; margin-top: -5px; transform: rotate(45deg); background: var(--rx-gold); border: 1px solid #fff3d6; box-shadow: 0 0 10px rgba(255,181,74,.7); }
.rx-range input::-moz-range-thumb { width: 11px; height: 11px; transform: rotate(45deg); background: var(--rx-gold); border: 1px solid #fff3d6; border-radius: 0; }
.rx-switch { position: relative; justify-self: start; cursor: pointer; width: 3.4em; height: 1.7em; border-radius: 1em; border: 1px solid var(--rx-line-strong); background: rgba(4,10,20,.6); transition: background .2s, border-color .2s; }
.rx-switch::after { content: ''; position: absolute; top: 50%; left: .25em; width: 1.05em; height: 1.05em; border-radius: 50%; background: var(--rx-dim); transform: translateY(-50%); transition: left .2s, background .2s, box-shadow .2s; }
.rx-switch[aria-checked="true"] { background: rgba(255,181,74,.22); border-color: var(--rx-gold-dim); }
.rx-switch[aria-checked="true"]::after { left: 2.0em; background: var(--rx-gold); box-shadow: 0 0 10px var(--rx-gold); }
.rx-switch-wrap { display: flex; align-items: center; gap: .8em; font-family: var(--rx-display); font-size: .62em; letter-spacing: .24em; color: var(--rx-dim); text-transform: uppercase; }
.rx-binds { display: grid; grid-template-columns: 1fr 9em 9em; gap: .3em .6em; align-items: center; }
.rx-binds h4 { grid-column: 1 / -1; margin: 1em 0 .2em; font-family: var(--rx-display); font-weight: 600; font-size: .6em; letter-spacing: .32em; text-transform: uppercase; color: var(--rx-cyan); }
.rx-binds h4:first-child { margin-top: 0; }
.rx-bind { cursor: pointer; height: 2.3em; border: 1px solid var(--rx-line); background: rgba(4,10,20,.55); border-radius: 2px; font-family: var(--rx-display) !important; font-size: .66em !important; font-weight: 700; letter-spacing: .1em; color: var(--rx-gold-hi) !important; transition: border-color .15s, background .15s; }
.rx-bind:hover, .rx-bind:focus-visible { border-color: var(--rx-gold-dim); background: rgba(255,181,74,.08); }
.rx-bind.empty { color: var(--rx-faint) !important; }
.rx-bind.capturing { border-color: var(--rx-cyan); color: var(--rx-cyan-hi) !important; animation: rx-breathe 1s ease-in-out infinite; }
.rx-palette-preview { display: flex; gap: .45em; margin-top: .45em; }

/* ---------- HUD ---------- */
.rx-hud { position: absolute; inset: 0; pointer-events: none; }
.rx-hud > * { pointer-events: none; }
.rx-hud .rx-panel { pointer-events: none; }
.rx-hud-level { position: absolute; left: 1.6em; top: 1.4em; min-width: 18em; max-width: 26em; padding: .95em 1.2em 1em; }
.rx-hud-level h1 { margin: .35em 0 .1em; font-family: var(--rx-display); font-weight: 500; font-size: 1.3em; letter-spacing: .24em; text-transform: uppercase; color: #fff; text-shadow: 0 0 18px rgba(120,200,255,.25); }
.rx-hud-level .sub { color: var(--rx-dim); font-size: .95em; letter-spacing: .06em; }
.rx-objective { display: flex; align-items: flex-start; gap: .6em; margin-top: .8em; padding-top: .75em; border-top: 1px solid var(--rx-line); }
.rx-objective svg { color: var(--rx-gold); width: 1.15em; height: 1.15em; margin-top: .1em; }
.rx-objective .txt { font-weight: 600; letter-spacing: .04em; }
.rx-objective .conds { display: flex; align-items: center; gap: .35em; margin-top: .35em; font-family: var(--rx-display); font-size: .62em; letter-spacing: .2em; color: var(--rx-dim); }
.rx-cond { width: .85em; height: .85em; transform: rotate(45deg); border: 1px solid var(--rx-teal); }
.rx-cond.on { background: var(--rx-teal); box-shadow: 0 0 8px var(--rx-teal); }
.rx-objective.ready svg { color: var(--rx-teal); }
.rx-hud-time { position: absolute; right: 1.6em; top: 1.4em; width: 19.5em; padding: .95em 1.15em 1em; }
.rx-rec { display: flex; align-items: center; gap: .55em; }
.rx-rec .dot { width: .7em; height: .7em; border-radius: 50%; background: var(--rx-coral); box-shadow: 0 0 10px var(--rx-coral), 0 0 2px #fff inset; animation: rx-pulse 1.1s ease-in-out infinite; }
.rx-rec .lbl { font-family: var(--rx-display); font-weight: 700; font-size: .74em; letter-spacing: .3em; color: var(--rx-coral); }
.rx-rec .loop { margin-left: auto; font-family: var(--rx-display); font-size: .62em; letter-spacing: .26em; color: var(--rx-dim); }
.rx-rec.paused .dot { animation: none; background: transparent; box-shadow: none; border: 2px solid var(--rx-dim); border-radius: 1px; width: .62em; height: .62em; }
.rx-rec.paused .lbl { color: var(--rx-dim); }
.rx-rec.done .dot { animation: none; background: var(--rx-teal); box-shadow: 0 0 10px var(--rx-teal); transform: rotate(45deg); border-radius: 1px; }
.rx-rec.done .lbl { color: var(--rx-teal); }
.rx-rec.timeup .dot { animation: none; background: var(--rx-gold); box-shadow: 0 0 10px var(--rx-gold); }
.rx-rec.timeup .lbl { color: var(--rx-gold); }
.rx-clock { display: flex; align-items: baseline; gap: .45em; margin: .5em 0 .55em; }
.rx-clock .now { font-family: var(--rx-display); font-size: 1.85em; font-weight: 500; letter-spacing: .05em; color: #fff; font-variant-numeric: tabular-nums; }
.rx-clock .max { font-family: var(--rx-display); font-size: .78em; letter-spacing: .08em; color: var(--rx-dim); }
.rx-bar { position: relative; height: 3px; background: rgba(118,196,255,.14); border-radius: 2px; overflow: hidden; }
.rx-bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, var(--rx-gold), var(--rx-gold-hi)); box-shadow: 0 0 8px var(--rx-gold); }
.rx-bar.warn > i { background: linear-gradient(90deg, var(--rx-coral), #ffb0a8); box-shadow: 0 0 8px var(--rx-coral); }
.rx-echoes { display: flex; align-items: center; gap: .55em; margin-top: .85em; padding-top: .75em; border-top: 1px solid var(--rx-line); }
.rx-echoes .lbl { font-family: var(--rx-display); font-size: .6em; letter-spacing: .3em; color: var(--rx-dim); }
.rx-echoes .chips { display: flex; gap: .3em; }
.rx-echoes .count { margin-left: auto; font-family: var(--rx-display); font-size: .8em; letter-spacing: .1em; color: #fff; }
.rx-echoes .count span { color: var(--rx-dim); }
.rx-chip-empty { width: 22px; height: 22px; display: inline-grid; place-items: center; }
.rx-chip-empty svg { opacity: .5; }
.rx-badge { position: relative; display: inline-grid; place-items: center; flex: none; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 60%, transparent)); }
.rx-badge svg { position: absolute; inset: 0; }
.rx-badge b { position: relative; font-family: var(--rx-display); font-size: 9px; font-weight: 700; color: var(--c); letter-spacing: 0; margin-top: 1px; }
.rx-prompt { position: absolute; left: 50%; bottom: calc(var(--rx-tl-h, 120px) + 1.8em); transform: translateX(-50%); display: flex; align-items: center; gap: .75em; padding: .6em 1.1em .6em .7em; transition: opacity .2s, transform .2s; }
.rx-prompt .rx-key { font-size: .85em; }
.rx-prompt .lbl { font-family: var(--rx-display); font-size: .74em; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #fff; }
.rx-prompt.blocked .rx-key { color: var(--rx-coral); border-color: rgba(255,107,94,.55); background: rgba(255,107,94,.1); }
.rx-prompt.blocked .lbl { color: #ffc2bc; }
.rx-prompt.off { opacity: 0; transform: translate(-50%, 6px); }
.rx-controls { position: absolute; right: 1.6em; bottom: calc(var(--rx-tl-h, 120px) + 1.5em); display: flex; gap: 1.05em; align-items: center; padding: .55em 1em; border: 1px solid rgba(118,196,255,.12); border-radius: 2px; background: linear-gradient(90deg, rgba(4,9,18,.35), rgba(4,9,18,.78)); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-family: var(--rx-display); font-size: .56em; letter-spacing: .24em; text-transform: uppercase; color: var(--rx-dim); text-shadow: 0 1px 4px #000; }
.rx-controls span { display: inline-flex; align-items: center; gap: .55em; }
.rx-controls .rx-key { font-size: 1.05em; }
.rx-banner { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); text-align: center; pointer-events: none; }
.rx-banner .big { font-family: var(--rx-display); font-size: 2.1em; letter-spacing: .4em; margin-right: -.4em; color: #fff; text-shadow: 0 0 24px rgba(63,217,255,.6); }
.rx-banner .small { margin-top: .5em; font-family: var(--rx-display); font-size: .7em; letter-spacing: .34em; color: var(--rx-cyan); }

/* ---------- toasts / hint / onboarding ---------- */
.rx-toasts { position: absolute; left: 50%; top: 1.5em; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: .45em; pointer-events: none; z-index: 30; }
.rx-toast { display: flex; align-items: center; gap: .65em; padding: .6em 1.1em; font-family: var(--rx-display); font-size: .7em; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #fff; animation: rx-in .3s both; transition: opacity .4s, transform .4s; }
.rx-toast svg { width: 1.3em; height: 1.3em; }
.rx-toast.info svg { color: var(--rx-cyan); }
.rx-toast.success svg { color: var(--rx-teal); }
.rx-toast.warn { border-color: rgba(255,107,94,.5); }
.rx-toast.warn svg { color: var(--rx-coral); }
.rx-toast.warn::before, .rx-toast.warn::after { border-color: var(--rx-coral); }
.rx-toast.gold svg { color: var(--rx-gold); }
.rx-toast.out { opacity: 0; transform: translateY(-6px); }
.rx-hint { position: absolute; left: 1.6em; top: 50%; transform: translateY(-50%); width: 19em; padding: .95em 1.1em 1em; pointer-events: auto !important; animation: rx-in-cy .35s both; }
.rx-hint .hd { display: flex; align-items: center; gap: .5em; }
.rx-hint .hd svg { color: var(--rx-gold); }
.rx-hint .hd .rx-iconbtn { margin-left: auto; }
.rx-hint p { margin: .55em 0 0; font-size: 1.02em; font-weight: 500; line-height: 1.4; color: #eef6ff; }
.rx-hint.collapsed { width: auto; padding: .55em .8em; cursor: pointer; }
.rx-hint.collapsed p, .rx-hint.collapsed .rx-iconbtn { display: none; }
.rx-onboard { position: absolute; left: 50%; top: 5.4em; transform: translateX(-50%); width: min(29em, calc(100vw - 50em));  min-width: 22em; padding: 1em 1.3em 1.05em; text-align: center; animation: rx-in-cx .4s both; }
.rx-onboard .title { font-family: var(--rx-display); font-size: .92em; font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: #fff; margin: .35em 0 .45em; }
.rx-onboard p { margin: 0; font-size: 1.05em; line-height: 1.45; color: #e3eefa; }
.rx-onboard .keys { display: flex; justify-content: center; gap: .35em; margin-top: .7em; }
.rx-onboard .keys .rx-key { font-size: .9em; min-width: 2.2em; height: 2.2em; }
.rx-onboard .dots { display: flex; justify-content: center; gap: .4em; margin-top: .8em; }
.rx-onboard .dots i { width: .45em; height: .45em; transform: rotate(45deg); border: 1px solid var(--rx-gold-dim); }
.rx-onboard .dots i.on { background: var(--rx-gold); border-color: var(--rx-gold); }
.rx-inspecting .rx-onboard, .rx-inspecting .rx-hint { opacity: 0; visibility: hidden; transition: opacity .18s, visibility 0s .18s; }
.rx-onboard .skip { position: absolute; right: .4em; top: .4em; }

/* ---------- temporal timeline ---------- */
.rx-tl { position: absolute; left: 1.6em; right: 1.6em; bottom: 1.2em; padding: .55em .9em .6em; pointer-events: auto; transition: padding .25s; }
.rx-tl-head { display: flex; align-items: center; gap: 1em; height: 1.6em; }
.rx-tl-head .rx-eyebrow { color: var(--rx-cyan); }
.rx-tl-head .time { font-family: var(--rx-display); font-size: .7em; letter-spacing: .08em; color: #fff; font-variant-numeric: tabular-nums; }
.rx-tl-head .time span { color: var(--rx-dim); }
.rx-tl-head .preview { font-family: var(--rx-display); font-size: .6em; letter-spacing: .26em; color: var(--rx-cyan-hi); padding: .2em .6em; border: 1px solid var(--rx-cyan-dim); border-radius: 2px; background: rgba(63,217,255,.1); }
.rx-tl-head .spacer { flex: 1; }
.rx-tl-head .meta { display: flex; align-items: center; gap: .6em; font-family: var(--rx-display); font-size: .56em; letter-spacing: .26em; color: var(--rx-dim); text-transform: uppercase; }
.rx-tl-head .meta .rx-key { font-size: 1em; }
.rx-tl-body { display: grid; grid-template-columns: var(--rx-tl-label, 13.5em) 1fr; column-gap: .9em; margin-top: .25em; }
.rx-tl-labels { display: flex; flex-direction: column; }
.rx-tl-labels .ruler-spacer { height: 1.35em; }
.rx-tl-label { display: flex; align-items: center; gap: .45em; height: var(--rx-lane-h, 1.75em); }
.rx-tl-label .name { font-family: var(--rx-display); font-size: .6em; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rx-tl-label .name small { color: var(--rx-dim); font-weight: 500; letter-spacing: .14em; margin-left: .4em; }
.rx-tl-label .acts { margin-left: auto; display: flex; gap: .1em; }
.rx-tl-label.hidden-track { opacity: .45; }
.rx-tl-label.selected .name { text-decoration: underline; text-underline-offset: .35em; text-decoration-thickness: 1px; }
.rx-tl-stage { position: relative; overflow: hidden; cursor: ew-resize; touch-action: none; border-radius: 2px; }
.rx-tl-stage:focus-visible { outline-offset: 1px; }
.rx-tl-content { position: relative; will-change: transform; }
.rx-tl-ruler { position: relative; height: 1.35em; border-bottom: 1px solid var(--rx-line); }
.rx-tl-ruler .t { position: absolute; bottom: 0; width: 1px; height: .3em; background: rgba(118,196,255,.35); }
.rx-tl-ruler .t.major { height: .6em; background: rgba(160,215,255,.65); }
.rx-tl-ruler .t span { position: absolute; bottom: .6em; left: 3px; font-family: var(--rx-display); font-size: .52em; letter-spacing: .08em; color: var(--rx-dim); white-space: nowrap; transform: translateY(-1px); }
.rx-tl-ruler .t:first-child span { left: 3px; }
.rx-tl-lane { position: relative; height: var(--rx-lane-h, 1.75em); border-bottom: 1px solid rgba(118,196,255,.07); }
.rx-tl-lane::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(118,196,255,.12); }
.rx-tl-lane.selected { background: linear-gradient(90deg, rgba(63,217,255,.08), transparent 80%); }
.rx-tl-lane.hidden-track { opacity: .32; }
.rx-tl-span { position: absolute; top: 50%; height: 6px; transform: translateY(-50%); border-radius: 1px; background: var(--soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
.rx-tl-span .played { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, transparent), var(--c)); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 70%, transparent); border-radius: 1px; }
.rx-tl-span.copy { background: repeating-linear-gradient(90deg, var(--soft) 0 6px, transparent 6px 9px); }
.rx-tl-span .end { position: absolute; right: -1px; top: -4px; bottom: -4px; width: 2px; background: var(--c); }
.rx-tl-div-zone { position: absolute; top: 50%; height: 12px; transform: translateY(-50%); background: repeating-linear-gradient(135deg, rgba(255,107,94,.42) 0 3px, transparent 3px 7px); border-top: 1px solid rgba(255,107,94,.5); border-bottom: 1px solid rgba(255,107,94,.5); pointer-events: none; }
.rx-mk { position: absolute; top: 50%; width: 1.15em; height: 1.15em; transform: translate(-50%, -50%) rotate(45deg); display: grid; place-items: center; border-radius: 2px; background: var(--c); color: #04101c; box-shadow: 0 0 8px color-mix(in srgb, var(--c) 70%, transparent); pointer-events: auto; }
.rx-mk svg { width: .82em; height: .82em; transform: rotate(-45deg); }
.rx-mk.pending { background: rgba(4,10,20,.85); color: var(--c); box-shadow: inset 0 0 0 1.3px var(--c); }
.rx-mk.failed { background: rgba(30,6,6,.9); color: var(--rx-coral); box-shadow: inset 0 0 0 1.3px var(--rx-coral); }
.rx-mk.diverged { background: var(--rx-coral); color: #1a0606; box-shadow: 0 0 10px var(--rx-coral); }
.rx-dv { position: absolute; top: 50%; width: 1.25em; height: 1.25em; transform: translate(-50%, -50%); color: var(--rx-coral); filter: drop-shadow(0 0 6px rgba(255,107,94,.8)); pointer-events: auto; z-index: 2; }
.rx-dv svg { width: 100%; height: 100%; }
.rx-playhead { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; z-index: 5; }
.rx-playhead::before { content: ''; position: absolute; top: 1.1em; bottom: 0; left: -1px; width: 2px; background: var(--rx-gold); box-shadow: 0 0 10px var(--rx-gold), 0 0 22px rgba(255,181,74,.45); }
.rx-playhead::after { content: ''; position: absolute; top: .35em; left: -.45em; width: .9em; height: .9em; background: var(--rx-gold); clip-path: polygon(0 0, 100% 0, 100% 45%, 50% 100%, 0 45%); box-shadow: 0 0 10px var(--rx-gold); }
.rx-scrubhead { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; z-index: 6; }
.rx-scrubhead::before { content: ''; position: absolute; top: 1.1em; bottom: 0; left: -1px; width: 0; border-left: 2px dashed var(--rx-cyan-hi); filter: drop-shadow(0 0 6px var(--rx-cyan)); }
.rx-scrubhead::after { content: ''; position: absolute; top: .35em; left: -.42em; width: .84em; height: .84em; border: 2px solid var(--rx-cyan-hi); transform: rotate(45deg); background: rgba(4,10,20,.8); }
.rx-tl-hover { position: absolute; top: 1.35em; bottom: 0; width: 1px; background: rgba(255,255,255,.25); pointer-events: none; z-index: 4; }
.rx-tl-controls { display: flex; align-items: flex-end; justify-content: center; gap: .3em; margin-top: .65em; padding-top: .6em; border-top: 1px solid var(--rx-line); }
.rx-tl-controls .sep { width: 1px; align-self: stretch; margin: .2em 1em; background: var(--rx-line); }
.rx-tcb { display: flex; flex-direction: column; align-items: center; gap: .45em; min-width: 6.4em; padding: .45em .6em .4em; cursor: pointer; background: transparent; border: 1px solid transparent; border-radius: 2px; color: var(--rx-text); transition: background .15s, border-color .15s, color .15s; }
.rx-tcb .ic { display: grid; place-items: center; width: 2.35em; height: 2.35em; border-radius: 50%; border: 1px solid var(--rx-line-strong); background: radial-gradient(circle at 50% 35%, rgba(63,217,255,.14), rgba(4,10,20,.6)); }
.rx-tcb .ic svg { width: 1.2em; height: 1.2em; }
.rx-tcb .tx { font-family: var(--rx-display); font-size: .52em; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--rx-dim); white-space: nowrap; }
.rx-tcb:hover, .rx-tcb:focus-visible { background: rgba(63,217,255,.07); border-color: var(--rx-line); }
.rx-tcb:hover .tx, .rx-tcb:focus-visible .tx { color: #fff; }
.rx-tcb.rec .ic { color: var(--rx-coral); border-color: rgba(255,107,94,.55); box-shadow: 0 0 14px rgba(255,107,94,.25); }
.rx-tcb.rwd .ic, .rx-tcb.ply .ic { color: var(--rx-cyan-hi); }
.rx-tcb.del .ic { color: #ff8e7a; }
.rx-tcb.zm .ic, .rx-tcb.sel .ic { color: var(--rx-gold-hi); border-radius: 3px; }
.rx-tcb[disabled] { opacity: .35; cursor: not-allowed; }
.rx-tl.expanded .rx-tl-body { --rx-tl-label: 16.5em; }
.rx-tl.compact { padding: .45em .8em .5em; }
.rx-tl.compact .rx-tl-body { --rx-tl-label: 7.2em; --rx-lane-h: .95em; }
.rx-tl.compact .rx-tl-label .name small, .rx-tl.compact .rx-tl-label .acts { display: none; }
.rx-tl.compact .rx-tl-label .name { font-size: .5em; }
.rx-tl.compact .rx-tl-label .rx-badge { transform: scale(.68); margin: -4px; }
.rx-tl.compact .rx-mk { width: .78em; height: .78em; }
.rx-tl.compact .rx-mk svg { display: none; }
.rx-tl.compact .rx-dv { width: .95em; height: .95em; }
.rx-tl.compact .rx-tl-span { height: 4px; }
.rx-tl.compact .rx-tl-controls { display: none; }
.rx-tl.flash { animation: rx-flash 1s ease-out; }

/* ---------- pause / intro / complete ---------- */
.rx-pause { display: grid; grid-template-columns: minmax(320px, 400px) minmax(280px, 360px); gap: 1.2em; justify-content: center; align-content: center; padding: 4vh 4vw; }
.rx-pause .rx-panel { padding: 1.5em 1.6em; }
.rx-pause h2 { text-transform: uppercase; margin: .3em 0 .1em; font-family: var(--rx-display); font-weight: 500; font-size: 2em; letter-spacing: .38em; color: #fff; }
.rx-pause .list { display: flex; flex-direction: column; gap: .45em; margin-top: 1.2em; }
.rx-pause .list .rx-btn { width: 100%; }
.rx-hintlist { margin: .6em 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .55em; }
.rx-hintlist li { display: grid; grid-template-columns: 1.6em 1fr; gap: .5em; font-size: .98em; color: #e6f0fb; }
.rx-hintlist li b { font-family: var(--rx-display); font-size: .7em; color: var(--rx-gold); padding-top: .25em; }
.rx-hintlist li.locked { color: var(--rx-faint); font-style: normal; }
.rx-intro { display: flex; align-items: center; padding: 0 8vw; background: linear-gradient(90deg, rgba(2,6,13,.94) 0%, rgba(2,6,13,.75) 42%, rgba(2,6,13,.1) 78%); }
.rx-intro .card { position: relative; max-width: 38em; }
.rx-intro .chamber { display: flex; align-items: center; gap: .9em; }
.rx-intro .chamber::after { content: ''; width: 9em; height: 1px; background: linear-gradient(90deg, var(--rx-gold), transparent); }
.rx-intro h1 { margin: .35em 0 .15em; font-family: var(--rx-display); font-weight: 500; font-size: 3.1em; letter-spacing: .2em; line-height: 1.08; text-transform: uppercase; color: #fff; text-shadow: 0 0 30px rgba(120,200,255,.3); animation: rx-rise .7s .1s both; }
.rx-intro .subtitle { font-family: var(--rx-display); font-size: .82em; letter-spacing: .36em; text-transform: uppercase; color: var(--rx-cyan); animation: rx-rise .7s .25s both; }
.rx-intro .story { margin: 1.6em 0 0; padding: 0 0 0 1em; border-left: 1px solid var(--rx-gold-dim); list-style: none; }
.rx-intro .story li { font-size: 1.18em; line-height: 1.6; color: #d3e2f2; animation: rx-rise .8s both; }
.rx-intro .facts { display: flex; flex-wrap: wrap; gap: .5em; margin-top: 1.6em; animation: rx-rise .7s 1.2s both; }
.rx-fact { display: inline-flex; align-items: center; gap: .55em; padding: .5em .8em; border: 1px solid var(--rx-line); background: rgba(6,12,24,.6); font-family: var(--rx-display); font-size: .6em; letter-spacing: .24em; text-transform: uppercase; color: var(--rx-dim); }
.rx-fact b { color: #fff; font-weight: 600; }
.rx-fact svg { width: 1.4em; height: 1.4em; color: var(--rx-gold); }
.rx-intro .go { display: flex; align-items: center; gap: 1em; margin-top: 2em; animation: rx-rise .7s 1.4s both; }
.rx-complete { display: grid; place-items: center; }
.rx-complete .rx-panel { width: min(560px, 92vw); padding: 2em 2.2em 1.7em; text-align: center; overflow: hidden; }
.rx-complete .rx-rings { width: 380px; height: 380px; left: 50%; top: -150px; transform: translateX(-50%); opacity: .32; }
.rx-complete h2 { text-transform: uppercase; position: relative; margin: .5em 0 0; font-family: var(--rx-display); font-weight: 500; font-size: 1.85em; letter-spacing: .34em; margin-right: -.34em; color: var(--rx-gold-hi); text-shadow: 0 0 26px rgba(255,181,74,.55); }
.rx-complete .lvl { position: relative; margin-top: .4em; font-family: var(--rx-display); font-size: .7em; letter-spacing: .3em; color: var(--rx-cyan); text-transform: uppercase; }
.rx-stars { position: relative; display: flex; justify-content: center; gap: 1.4em; margin: 1.5em 0 1.2em; }
.rx-star { display: flex; flex-direction: column; align-items: center; gap: .45em; }
.rx-star svg, .rx-star svg.rx-ico { width: 2.6em; height: 2.6em; color: rgba(142,166,191,.25); transition: color .3s; }
.rx-star.on svg { color: var(--rx-gold); filter: drop-shadow(0 0 10px rgba(255,181,74,.7)); animation: rx-rise .5s both; }
.rx-star .l { font-family: var(--rx-display); font-size: .52em; letter-spacing: .22em; color: var(--rx-dim); text-transform: uppercase; }
.rx-results { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6em; text-align: left; }
.rx-result { padding: .75em .85em; border: 1px solid var(--rx-line); background: rgba(4,10,20,.45); }
.rx-result .k { font-family: var(--rx-display); font-size: .56em; letter-spacing: .26em; color: var(--rx-dim); text-transform: uppercase; }
.rx-result .v { margin-top: .35em; font-family: var(--rx-display); font-size: 1.35em; color: #fff; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.rx-result .p { margin-top: .2em; font-size: .9em; color: var(--rx-dim); display: flex; align-items: center; gap: .35em; }
.rx-result .p svg { width: 1em; height: 1em; }
.rx-result .p.ok { color: var(--rx-teal); }
.rx-result .p.miss { color: #f3a49b; }
.rx-newbest { display: inline-flex; align-items: center; gap: .5em; margin-top: 1em; padding: .4em .9em; font-family: var(--rx-display); font-size: .62em; font-weight: 700; letter-spacing: .3em; color: #1b1203; background: linear-gradient(90deg, var(--rx-gold), var(--rx-gold-hi)); box-shadow: 0 0 22px rgba(255,181,74,.5); }
.rx-complete .actions { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: .6em; margin-top: 1.5em; }
.rx-complete .actions .rx-btn { padding: .8em 1em; font-size: .7em; letter-spacing: .18em; }

/* HUD fades out under the level intro card */
.rx-hud-layer { transition: opacity .5s; }
.rx-hud-layer.rx-under-intro { opacity: 0; }

/* ---------- fade ---------- */
.rx-fade { position: absolute; inset: 0; background: #02050b; opacity: 0; pointer-events: none; transition: opacity .42s ease; z-index: 100; }
.rx-fade.on { opacity: 1; pointer-events: auto; }

/* ---------- motion preferences ---------- */
.rx-root.rx-reduced *, .rx-root.rx-reduced *::before, .rx-root.rx-reduced *::after { animation: none !important; transition-duration: 0s !important; }
@media (prefers-reduced-motion: reduce) {
  .rx-root *, .rx-root *::before, .rx-root *::after { animation-duration: .001s !important; animation-iteration-count: 1 !important; transition-duration: .001s !important; }
}
@media (max-width: 1100px) { .rx-levels { grid-template-columns: repeat(3, minmax(0, 1fr)); } .rx-menu { grid-template-columns: 1fr; } .rx-menu-aside { display: none; } }
`;

let injected = false;

/** Injects the stylesheet once per document. */
export function injectStyles(doc: Document = document): void {
  if (injected && doc.getElementById('rx-ui-styles')) return;
  if (doc.getElementById('rx-ui-styles')) {
    injected = true;
    return;
  }
  const style = doc.createElement('style');
  style.id = 'rx-ui-styles';
  style.textContent = UI_CSS;
  doc.head.appendChild(style);
  injected = true;
}
