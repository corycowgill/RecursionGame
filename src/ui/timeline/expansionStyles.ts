/**
 * Round-6 timeline styles (intended divergences, Paradox Glass shatter markers, chrono relay rows). Injected once by
 * TimelinePanel so the expansion stays self-contained in src/ui/timeline.
 */
export const TIMELINE_EXPANSION_CSS = `
.rx-dv.intended { color: var(--rx-violet, #a46bff); filter: drop-shadow(0 0 6px rgba(164,107,255,.85)); }
.rx-sh { position: absolute; top: 50%; width: .8em; height: .8em; transform: translate(-50%, -50%) rotate(45deg); background: transparent; border: 2px solid var(--rx-coral, #ff5a4e); box-shadow: 0 0 8px rgba(255,90,78,.8); pointer-events: auto; z-index: 3; }
.rx-sh::before, .rx-sh::after { content: ''; position: absolute; left: 50%; top: -30%; width: 1.5px; height: 160%; background: var(--rx-coral, #ff5a4e); transform: translateX(-50%) rotate(45deg); }
.rx-sh::after { transform: translateX(-50%) rotate(-45deg); }
.rx-tl-lane.relay { --c: #2fffcf; }
.rx-tl-lane.relay .in { position: absolute; top: 50%; height: 6px; transform: translateY(-100%); background: #2fffcf; box-shadow: 0 0 8px rgba(47,255,207,.6); border-radius: 1px; }
.rx-tl-lane.relay .gh { position: absolute; top: 50%; height: 6px; transform: translateY(15%); border: 1px dashed #2fffcf; background: rgba(47,255,207,.12); border-radius: 1px; }
.rx-tl-lane.relay .cn { position: absolute; top: 50%; height: 1px; background: rgba(47,255,207,.45); }
.rx-tl-lane.relay .ar { position: absolute; top: 50%; width: .55em; height: .55em; transform: translate(-50%, 35%) rotate(45deg); border: 1.5px solid #2fffcf; background: rgba(4,10,20,.85); pointer-events: auto; z-index: 2; }
.rx-tl-lane.relay .ar.rise { background: #2fffcf; }
.rx-tl-label.relay .name { color: #2fffcf; }
`;

let installed = false;

export function installTimelineExpansionStyles(): void {
  if (installed || typeof document === 'undefined' || !document.head) return;
  installed = true;
  const el = document.createElement('style');
  el.setAttribute('data-rx', 'timeline-expansion');
  el.textContent = TIMELINE_EXPANSION_CSS;
  document.head.append(el);
}
