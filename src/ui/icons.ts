import type { InteractionKind } from '../engine/contracts';
import type { TrackShape } from './palette';

/**
 * Inline SVG icon set (24×24, stroke = currentColor). Hand-drawn to match the concept sheet's thin-line
 * holographic style; no external assets.
 */
const S = (body: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

export const ICONS = {
  record: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>'),
  rewind: S('<path d="M11 7 5 12l6 5V7Z" fill="currentColor"/><path d="M19 7l-6 5 6 5V7Z" fill="currentColor"/>'),
  play: S('<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/>'),
  pause: S('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>'),
  trash: S('<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2h9.2L17.5 7"/><path d="M10.2 10.5v5.5M13.8 10.5v5.5"/>'),
  zoom: S('<rect x="2.5" y="8.5" width="5" height="7" rx="1"/><circle cx="13" cy="11" r="3.4"/><path d="m15.4 13.4 2.3 2.3"/><path d="M18.5 12h3m-1.4-1.4L21.5 12l-1.4 1.4"/>'),
  echoSelect: S('<rect x="3" y="7" width="7" height="10" rx="1.5"/><circle cx="6.5" cy="12" r="1.6" fill="currentColor"/><path d="M14 12h7m-3.5-3.5v7"/>'),
  eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: S('<path d="M2.5 12S6 5.5 12 5.5c2 0 3.7.7 5 1.6M21.5 12s-3.5 6.5-9.5 6.5c-2 0-3.7-.7-5-1.6"/><path d="M4 20 20 4"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  chevron: S('<path d="m9 5 7 7-7 7"/>'),
  back: S('<path d="m15 5-7 7 7 7"/>'),
  close: S('<path d="m6 6 12 12M18 6 6 18"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  echo: S('<circle cx="9" cy="7" r="2.6"/><path d="M5 20v-4.5a4 4 0 0 1 8 0V20"/><circle cx="16" cy="7.5" r="2.2" opacity=".55"/><path d="M14.5 13a3.5 3.5 0 0 1 5.5 2.8V20" opacity=".55"/>'),
  target: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
  hint: S('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  grid: S('<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>'),
  exit: S('<path d="M10 4H5.5v16H10"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
  star: S('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" fill="currentColor"/>'),
  restart: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/>'),
  warning: S('<path d="M12 3.5 22 20H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>'),
  next: S('<path d="M5 6l7 6-7 6V6Z" fill="currentColor"/><path d="M18.5 6v12"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'rx-ico'): string {
  return ICONS[name].replace('<svg ', `<svg class="${cls}" `);
}

/** Interaction marker glyphs (12×12 content in a 16 box) — every marker kind has a distinct shape. */
const MARKER_BODY: Record<InteractionKind, string> = {
  pickup: '<path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5"/>',
  drop: '<path d="M8 3.5V12M4.5 8.5 8 12l3.5-3.5"/>',
  insert: '<circle cx="8" cy="8" r="4.5"/><path d="M8 5.5v5M5.5 8h5"/>',
  extract: '<circle cx="8" cy="8" r="4.5"/><path d="M5.5 8h5"/>',
  use: '<path d="M8 3v5"/><path d="M4.8 5.3a4.6 4.6 0 1 0 6.4 0"/>',
  action: '<path d="M9 2.5 4.5 9h3.5l-1 4.5L11.5 7H8l1-4.5Z" fill="currentColor"/>',
  none: '<circle cx="8" cy="8" r="2"/>',
  fail: '<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>',
};

export function markerIcon(kind: InteractionKind): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARKER_BODY[kind]}</svg>`;
}

/** Divergence glyph: coral diamond with "!" (shape + colour). */
export const DIVERGENCE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 1 15 8 8 15 1 8Z" fill="currentColor"/><path d="M8 4.6v4.4" stroke="#1a0606" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.4" r="1.05" fill="#1a0606"/></svg>';

const SHAPE_PATH: Record<TrackShape, string> = {
  diamond: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>',
  circle: '<circle cx="8" cy="8" r="6.2"/>',
  triangle: '<path d="M8 1.8 14.6 13.6H1.4Z"/>',
  square: '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/>',
  hexagon: '<path d="M8 1.3 13.8 4.65v6.7L8 14.7l-5.8-3.35v-6.7Z"/>',
  star: '<path d="m8 1.2 2 4.4 4.8.5-3.6 3.2 1 4.7L8 11.6 3.8 14l1-4.7L1.2 6.1 6 5.6Z"/>',
};

/** Actor identity badge: shape outline in the track colour with the number/letter inside. */
export function shapeBadge(shape: TrackShape, badge: string, color: string, size = 22): string {
  return (
    `<span class="rx-badge" style="--c:${color};width:${size}px;height:${size}px" aria-hidden="true">` +
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="rgba(4,10,20,.65)" stroke="${color}" stroke-width="1.3" stroke-linejoin="round">${SHAPE_PATH[shape]}</svg>` +
    `<b>${badge}</b></span>`
  );
}

export function shapeGlyph(shape: TrackShape, color: string, size = 12, filled = true): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" focusable="false">${SHAPE_PATH[shape]}</svg>`;
}
