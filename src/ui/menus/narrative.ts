import { esc } from '../dom';

/**
 * NARRATIVE PRESENTATION (round 5, narrative & release): story-line formatting shared by the level intro card and
 * the ending, plus the styles for the ending and credits screens. Injected once per document (like padNav's styles)
 * so the shared stylesheet stays untouched.
 *
 * Story-line convention (see docs/game-design/story.md): a line of the form `LOG <id> · <text>` is an environmental
 * log entry recovered from the facility. It is drawn as a log (cyan id tag, italic body); every other line is
 * narration.
 */

const LOG_LINE = /^LOG\s+(\w+)\s+·\s+(.+)$/;

/** Splits a `LOG <id> · <text>` story line (null for narration). */
export function parseLogLine(line: string): { id: string; text: string } | null {
  const m = LOG_LINE.exec(line);
  return m ? { id: m[1] as string, text: m[2] as string } : null;
}

/** HTML for one story line. `text` renders authored text (action tokens → device glyphs); defaults to escaping. */
export function storyLineHTML(line: string, text: (t: string) => string = esc): string {
  const log = parseLogLine(line);
  if (!log) return text(line);
  return `<span class="rx-log-id">LOG ${esc(log.id)}</span><span class="rx-log-text">${text(log.text)}</span>`;
}

/** Hallucinated Games spark palette (matches public/intro/hallucinated-intro.js). */
export const STUDIO_GREEN = '#00ffaa';
export const STUDIO_PURPLE = '#7b61ff';
export const STUDIO_GOLD = '#ffd700';

const CSS = `
.rx-intro .story li.log { color: #bfe9ff; font-style: italic; }
.rx-log-id { display: inline-block; margin-right: .7em; padding: .05em .45em; font-family: var(--rx-display); font-style: normal; font-size: .62em; font-weight: 600; letter-spacing: .22em; color: var(--rx-cyan, #3fd9ff); border: 1px solid rgba(63,217,255,.35); border-radius: 2px; vertical-align: .18em; }

/* ---- ending ---- */
.rx-ending { background: linear-gradient(0deg, rgba(2,5,11,.72) 0%, rgba(2,5,11,.38) 28%, transparent 52%), radial-gradient(130% 100% at 50% 40%, transparent 50%, rgba(2,5,11,.5)); display: grid; place-items: end center; padding: 0 5vw 11vh; cursor: pointer; animation: none; }
.rx-ending .lines { max-width: min(58em, 92vw); text-align: center; display: grid; gap: .8em; }
.rx-ending .line { margin: 0; font-size: 1.45em; line-height: 1.45; font-weight: 500; letter-spacing: .04em; color: #f2f7ff; text-shadow: 0 0 18px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9); opacity: 0; transform: translateY(.4em); transition: none; }
.rx-ending .line.log { font-size: 1.15em; font-style: italic; color: #cdeeff; }
.rx-ending .white { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.rx-ending .skip { position: absolute; right: 3vw; bottom: 3vh; font-family: var(--rx-display); font-size: .58em; letter-spacing: .3em; text-transform: uppercase; color: rgba(220,235,255,.62); display: inline-flex; gap: .6em; align-items: center; }
.rx-root.rx-reduced .rx-ending .line { transform: none; }

/* ---- credits ---- */
.rx-credits { display: flex; flex-direction: column; align-items: center; padding: 0; background: radial-gradient(120% 90% at 50% 30%, rgba(8,12,24,.9), rgba(3,4,9,.97) 70%); }
.rx-credits.from-white::after { content: ''; position: absolute; inset: 0; background: #fff; pointer-events: none; animation: rx-credits-unwhite 1.6s ease-out forwards; }
@keyframes rx-credits-unwhite { from { opacity: 1; } to { opacity: 0; } }
.rx-credits .roll { flex: 1; width: 100%; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: rgba(123,97,255,.5) transparent; outline: none; }
.rx-credits .roll-inner { max-width: 40em; margin: 0 auto; padding: 14vh 6vw 30vh; text-align: center; }
.rx-credits .studio { font-family: var(--rx-display); font-weight: 700; font-size: 2.3em; line-height: 1.15; letter-spacing: .16em; margin-right: -.16em; background: linear-gradient(90deg, #ffffff 0%, ${STUDIO_GREEN} 18%, ${STUDIO_PURPLE} 62%, ${STUDIO_GOLD} 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 14px rgba(0,255,170,.35)); }
.rx-credits .studio span { display: block; letter-spacing: .62em; margin-right: -.62em; }
.rx-credits .presents { margin: 1em auto 0; font-family: var(--rx-body); font-weight: 600; font-size: 1.05em; letter-spacing: .42em; text-transform: uppercase; color: rgba(190,200,215,.92); }
.rx-credits .presents::before { content: ''; display: block; width: 12em; height: 2px; margin: 0 auto .9em; background: linear-gradient(90deg, rgba(0,255,170,0), rgba(0,255,170,.75), rgba(0,255,170,0)); }
.rx-credits .title { margin: 1.4em 0 .2em; font-family: var(--rx-display); font-weight: 500; font-size: 3em; letter-spacing: .34em; margin-right: -.34em; color: #f4f8ff; text-shadow: 0 0 26px rgba(63,217,255,.35); }
.rx-credits .title .o { color: var(--rx-gold-hi, #ffd27a); text-shadow: 0 0 22px rgba(255,181,74,.6); }
.rx-credits .sub { font-family: var(--rx-display); font-size: .7em; letter-spacing: .5em; text-transform: uppercase; color: var(--rx-cyan, #3fd9ff); }
.rx-credits section { margin: 3.4em 0 0; border-radius: 4px; padding: .4em .6em; }
.rx-credits section:focus-visible { outline: 1px solid rgba(123,97,255,.55); outline-offset: 4px; }
.rx-credits h3 { margin: 0 0 1em; font-family: var(--rx-display); font-size: .7em; font-weight: 600; letter-spacing: .4em; text-transform: uppercase; color: ${STUDIO_GREEN}; text-shadow: 0 0 10px rgba(0,255,170,.35); }
.rx-credits .lead { font-size: 1.25em; line-height: 1.5; color: #eef4ff; }
.rx-credits .lead b { color: #fff; font-weight: 700; }
.rx-credits dl { margin: 0; display: grid; gap: .85em; }
.rx-credits .roles { list-style: none; margin: 1.4em auto 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7em 2em; max-width: 30em; }
.rx-credits .roles li { font-family: var(--rx-display); font-size: .66em; font-weight: 600; letter-spacing: .26em; text-transform: uppercase; color: #cfc4ff; }
.rx-credits dt { font-family: var(--rx-display); font-size: .6em; font-weight: 600; letter-spacing: .3em; text-transform: uppercase; color: #b9a9ff; }
.rx-credits dd { margin: .25em 0 0; font-size: 1.1em; color: #e3ecf7; }
.rx-credits .note { margin-top: 1.1em; font-size: .95em; line-height: 1.5; color: var(--rx-muted, #8ea6bf); }
.rx-credits .fin { margin-top: 4em; font-family: var(--rx-display); font-size: .8em; letter-spacing: .5em; text-transform: uppercase; color: var(--rx-gold-hi, #ffd27a); }
.rx-credits .bar { width: 100%; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; gap: 1em; padding: 1.1em max(3vw, env(safe-area-inset-right)) max(1.1em, env(safe-area-inset-bottom)) max(3vw, env(safe-area-inset-left)); background: linear-gradient(0deg, rgba(3,4,9,.95), rgba(3,4,9,.6)); border-top: 1px solid rgba(123,97,255,.25); }
.rx-credits .bar .hint { font-family: var(--rx-display); font-size: .56em; letter-spacing: .28em; text-transform: uppercase; color: var(--rx-faint, #5d7390); display: inline-flex; gap: .5em; align-items: center; flex-wrap: wrap; }
.rx-credits .bar .btns { display: flex; gap: .6em; }
@media (max-height: 420px) { .rx-credits .roll-inner { padding-top: 8vh; } .rx-credits .title { font-size: 2.2em; } .rx-credits .studio { font-size: 1.7em; } }
`;

/** Injects the narrative styles (once per document). */
export function injectNarrativeStyles(doc: Document = document): void {
  if (doc.getElementById('rx-narrative-styles')) return;
  const style = doc.createElement('style');
  style.id = 'rx-narrative-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
