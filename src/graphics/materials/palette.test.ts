import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { unitsToWorld, type SimView, type Timeline } from '../../engine/contracts';
import { echoStyle, playerStyle } from '../../ui/palette';
import { EchoIntentLayer } from '../effects/echoIntents';
import type { GhostPath } from '../effects/forecast';
import { GhostPathLayer } from '../effects/ghostPaths';
import { ECHO_PALETTES, PALETTE, echoPaletteOf, echoTint, playerTint, type EchoPaletteName } from './palette';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const NAMES: EchoPaletteName[] = ['default', 'highContrast'];

describe('echo palettes (3D) match the UI timeline palettes', () => {
  it('every echo index has the same colour in the 3D view and on its timeline track, in both palettes', () => {
    for (const name of NAMES) {
      for (let i = 0; i < 12; i++) expect(hex(echoTint(i, name)), `${name} echo ${i}`).toBe(echoStyle(i, name).color);
    }
  });

  it('high contrast uses the Okabe–Ito set and a distinct player yellow', () => {
    expect(ECHO_PALETTES.highContrast.echoes.map(hex)).toEqual(['#56b4e9', '#009e73', '#cc79a7', '#e69f00', '#f0f0f0']);
    expect(hex(playerTint('highContrast'))).toBe(playerStyle('highContrast').color);
    // default player keeps the art-direction gold (within a hair of the UI's #ffb54a)
    expect(playerTint('default')).toBe(PALETTE.gold);
    const ui = new THREE.Color(playerStyle('default').color);
    const gl = new THREE.Color(PALETTE.gold);
    expect(Math.abs(ui.r - gl.r) + Math.abs(ui.g - gl.g) + Math.abs(ui.b - gl.b)).toBeLessThan(0.03);
  });

  it('wraps indices (also negative) and falls back to default for unknown names', () => {
    const n = ECHO_PALETTES.default.echoes.length;
    expect(echoTint(n)).toBe(echoTint(0));
    expect(echoTint(-1)).toBe(echoTint(n - 1));
    expect(echoPaletteOf('nonsense')).toBe(ECHO_PALETTES.default);
    expect(echoPaletteOf(undefined)).toBe(ECHO_PALETTES.default);
    expect(echoTint(2, 'highContrast')).not.toBe(echoTint(2, 'default'));
  });
});

describe('palette switching in the 3D layers', () => {
  const linear = (n: number) => new THREE.Color(n).getHex(); // round-trip through three's colour management

  it('intent badges re-tint to the selected palette', () => {
    const layer = new EchoIntentLayer(() => new THREE.Texture());
    const tl: Timeline = {
      levelId: 'L',
      currentTick: 0,
      maxTicks: 600,
      maxEchoes: 3,
      status: 'playing',
      tracks: [0, 1].map((i) => ({
        actorId: `echo:${i + 1}` as const,
        kind: 'echo' as const,
        echoIndex: i,
        loopId: i + 1,
        durationTicks: 600,
        planned: [{ tick: 200, kind: 'use' as const, verb: 'interact' as const, entityId: 'sw1', entityKind: 'timedSwitch' as const, success: true }],
        actual: [],
        divergences: [],
        finishedAtTick: null,
      })),
    };
    const view = {
      tick: 150,
      status: 'playing',
      completedAtTick: null,
      rng: 1,
      actors: [{ id: 'echo:1' }, { id: 'echo:2' }],
      entities: { sw1: { id: 'sw1', kind: 'timedSwitch', x: 6 / unitsToWorld(1), y: 0, z: 0 } },
      signals: {},
    } as unknown as SimView;
    const cam = new THREE.PerspectiveCamera();
    layer.setTimeline(tl);
    layer.update(view, 'L', cam, 0);
    expect(layer.badgeColor(1)).toBe(linear(echoTint(1, 'default')));
    layer.setPalette('highContrast');
    layer.update(view, 'L', cam, 0);
    expect(layer.badgeColor(0)).toBe(linear(echoTint(0, 'highContrast')));
    expect(layer.badgeColor(1)).toBe(linear(echoTint(1, 'highContrast')));
    layer.setPalette('default');
    layer.update(view, 'L', cam, 0);
    expect(layer.badgeColor(1)).toBe(linear(echoTint(1, 'default')));
    layer.dispose();
  });

  it('ghost paths rebuild in the selected palette (and label textures use the same colour)', () => {
    const colours: string[] = [];
    const layer = new GhostPathLayer(
      (_t, c) => (colours.push(c), new THREE.Texture()),
      () => new THREE.Texture(),
    );
    const path = (echoIndex: number): GhostPath => ({
      actorId: `echo:${echoIndex + 1}`,
      echoIndex,
      points: Array.from({ length: 5 }, (_, i) => ({ tick: 100 + i * 6, x: 500 + i * 240, y: 0, z: 1500 })),
      markers: [],
    });
    layer.setPaths([path(0), path(2)]);
    expect(layer.pathColors()).toEqual([linear(echoTint(0)), linear(echoTint(2))]);
    layer.setPalette('highContrast');
    expect(layer.pathCount).toBe(2);
    expect(layer.pathColors()).toEqual([linear(echoTint(0, 'highContrast')), linear(echoTint(2, 'highContrast'))]);
    expect(colours.at(-1)).toBe(`#${new THREE.Color(echoTint(2, 'highContrast')).getHexString()}`);
    layer.dispose();
  });
});
