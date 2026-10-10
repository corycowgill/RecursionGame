import type { EchoPaletteId } from '../persistence/settings';

/**
 * Track / actor identity styles. Colour is NEVER the only cue: every actor also has a shape glyph and a number
 * (player = gold diamond, echoes = numbered circle / triangle / square / hexagon / star).
 *
 *  default       — art direction: player gold; echoes cyan → azure → violet ("advanced temporal") → teal → lilac
 *  highContrast  — Okabe–Ito colour-blind-safe set, brighter outlines
 */

export type TrackShape = 'diamond' | 'circle' | 'triangle' | 'square' | 'hexagon' | 'star';

export interface TrackStyle {
  color: string;
  /** Translucent version for spans / glows. */
  soft: string;
  shape: TrackShape;
  /** Short badge text ("P", "1", "2"...). */
  badge: string;
  label: string;
}

const PALETTES: Record<EchoPaletteId, { player: string; echoes: string[] }> = {
  default: { player: '#ffb54a', echoes: ['#3fd9ff', '#4f8dff', '#a77bff', '#37f0c8', '#d08cff'] },
  highContrast: { player: '#ffd400', echoes: ['#56b4e9', '#009e73', '#cc79a7', '#e69f00', '#f0f0f0'] },
};

const ECHO_SHAPES: TrackShape[] = ['circle', 'triangle', 'square', 'hexagon', 'star'];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function playerStyle(palette: EchoPaletteId = 'default'): TrackStyle {
  const color = PALETTES[palette].player;
  return { color, soft: withAlpha(color, 0.28), shape: 'diamond', badge: 'P', label: 'Player (current)' };
}

export function echoStyle(index: number, palette: EchoPaletteId = 'default'): TrackStyle {
  const list = PALETTES[palette].echoes;
  const i = ((index % list.length) + list.length) % list.length;
  const color = list[i] as string;
  return {
    color,
    soft: withAlpha(color, 0.26),
    shape: ECHO_SHAPES[i % ECHO_SHAPES.length] as TrackShape,
    badge: String(index + 1),
    label: `Echo ${index + 1}`,
  };
}

/** Hazard / divergence colour (coral) — paired with a "!" diamond glyph. */
export const CORAL = '#ff6b5e';
export const GOLD = '#ffb54a';
export const CYAN = '#3fd9ff';
export const VIOLET = '#a77bff';
