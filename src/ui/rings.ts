/**
 * The RECURSION ring motif: concentric clockwork rings (cyan graduations, gold arc segments, a glowing core) that
 * counter-rotate slowly. Pure SVG markup; animation in CSS (.rx-rings .r1..r4), disabled by reduced motion.
 */
export function ringsSVG(idSuffix = 'm'): string {
  const C = 250;
  const nodes = [0, 120, 240]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(C + Math.cos(r) * 198).toFixed(1)}" cy="${(C + Math.sin(r) * 198).toFixed(1)}" r="4" fill="#ffd894" stroke="#ffb54a" stroke-width="1"/>`;
    })
    .join('');
  const majors = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const x1 = C + Math.cos(a) * 222;
    const y1 = C + Math.sin(a) * 222;
    const x2 = C + Math.cos(a) * 236;
    const y2 = C + Math.sin(a) * 236;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
  return `
<svg viewBox="0 0 500 500" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="rx-core-${idSuffix}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#9fe9ff" stop-opacity=".30"/>
      <stop offset=".35" stop-color="#3fd9ff" stop-opacity=".10"/>
      <stop offset="1" stop-color="#3fd9ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rx-gold-${idSuffix}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd894"/><stop offset="1" stop-color="#c9822a"/>
    </linearGradient>
  </defs>
  <circle class="core" cx="${C}" cy="${C}" r="150" fill="url(#rx-core-${idSuffix})"/>
  <g class="r1" fill="none">
    <circle cx="${C}" cy="${C}" r="242" stroke="#76c4ff" stroke-opacity=".16" stroke-width="1"/>
    <circle cx="${C}" cy="${C}" r="232" stroke="#76c4ff" stroke-opacity=".35" stroke-width="5" stroke-dasharray="1 11.14"/>
    <g stroke="#a8e6ff" stroke-opacity=".55" stroke-width="1.4">${majors}</g>
  </g>
  <g class="r2" fill="none">
    <circle cx="${C}" cy="${C}" r="198" stroke="url(#rx-gold-${idSuffix})" stroke-width="1.6" stroke-dasharray="210 26 70 26 300 40 120 26 90 36 60 40" stroke-opacity=".9"/>
    <circle cx="${C}" cy="${C}" r="206" stroke="#ffb54a" stroke-opacity=".25" stroke-width=".8"/>
    ${nodes}
  </g>
  <g class="r3" fill="none">
    <circle cx="${C}" cy="${C}" r="168" stroke="#3fd9ff" stroke-opacity=".55" stroke-width="3" stroke-dasharray="3 7"/>
    <circle cx="${C}" cy="${C}" r="158" stroke="#3fd9ff" stroke-opacity=".18" stroke-width="1"/>
  </g>
  <g class="r4" fill="none">
    <circle cx="${C}" cy="${C}" r="128" stroke="#e8f6ff" stroke-opacity=".18" stroke-width="1"/>
    <circle cx="${C}" cy="${C}" r="128" stroke="#ffd894" stroke-width="2.2" stroke-dasharray="110 694" stroke-linecap="round"/>
    <circle cx="${C}" cy="${C}" r="128" stroke="#3fd9ff" stroke-width="2.2" stroke-dasharray="60 744" stroke-dashoffset="-400" stroke-linecap="round"/>
  </g>
  <g stroke="#76c4ff" stroke-opacity=".12" stroke-width="1">
    <line x1="${C}" y1="0" x2="${C}" y2="500"/><line x1="0" y1="${C}" x2="500" y2="${C}"/>
  </g>
</svg>`;
}
