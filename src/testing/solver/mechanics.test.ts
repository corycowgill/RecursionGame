import { describe, expect, it } from 'vitest';
import { SANDBOX_LEVELS, sandboxAttuned, sandboxRelay, sandboxValve } from '../../levels/definitions/sandbox-levels';
import { analysisFor } from './levelConfigs';
import { buildVocabulary, relayWaitTicks } from './macros';
import { NavGraph } from './navigation';
import { search } from './search';
import { attunedDivergences, noShatter, relayBypassed, relayUsed } from './teaching';
import { verifySolution } from './verify';

/**
 * Round-6 solver support: directed navigation through check valves, glass-avoiding routes, relay waits, attuned
 * vocabulary pruning and the teaching checks, exercised on the mechanic sandboxes.
 */
describe('solver round 6: navigation', () => {
  it('check valves make the graph directed (enter upstream, leave downstream only)', () => {
    const g = new NavGraph(sandboxValve);
    expect(g.path({ col: 1, row: 2 }, { col: 9, row: 2 })).not.toBeNull();
    expect(g.path({ col: 9, row: 2 }, { col: 1, row: 2 })).toBeNull();
    expect(g.ticksBetween({ col: 9, row: 2 }, { col: 3, row: 5 })).toBe(Infinity);
    expect(Number.isFinite(g.ticksBetween({ col: 1, row: 2 }, { col: 9, row: 2 }))).toBe(true);
    // the valve cell is a connector: kept as a waypoint, never cut diagonally
    const wps = g.waypoints(g.path({ col: 1, row: 1 }, { col: 10, row: 3 })!);
    expect(wps.some((c) => c.col === 6 && c.row === 2)).toBe(true);
  });

  it('a reversible valve is optimistic both ways', () => {
    const lvl = structuredClone(sandboxValve);
    const v = lvl.entities.find((e) => e.id === 'valve')!;
    if (v.kind === 'checkValve') v.config.reverseWhenPowered = true;
    const g = new NavGraph(lvl);
    expect(g.path({ col: 9, row: 2 }, { col: 1, row: 2 })).not.toBeNull();
  });

  it('avoid sets reroute around Paradox Glass (and the glass cell itself stays a legal target)', () => {
    const g = new NavGraph(sandboxAttuned);
    const avoid = new Set([g.cellIndex(5, 2)]);
    const direct = g.path({ col: 1, row: 2 }, { col: 8, row: 2 })!;
    const around = g.path({ col: 1, row: 2 }, { col: 8, row: 2 }, avoid)!;
    expect(direct.some((c) => c.col === 5 && c.row === 2)).toBe(true);
    expect(around.some((c) => c.col === 5 && c.row === 2)).toBe(false);
    expect(g.waypoints(around, avoid).some((c) => c.row === 2 && c.col > 1 && c.col < 8)).toBe(false);
    expect(g.path({ col: 1, row: 2 }, { col: 5, row: 2 }, avoid)).not.toBeNull();
  });
});

describe('solver round 6: vocabulary', () => {
  it('derives relay waits (delay, delay - 60) and waits on relay signal edges', () => {
    expect(relayWaitTicks(sandboxRelay)).toEqual([360, 300]);
    const v = buildVocabulary(sandboxRelay);
    expect(v.waits.filter((w) => w.kind === 'ticks').map((w) => (w.kind === 'ticks' ? w.n : 0))).toEqual([60, 180, 360, 300]);
    expect(v.waits.some((w) => w.kind === 'signal' && w.id === 'relay')).toBe(true);
    expect(buildVocabulary(sandboxRelay, { relayWaits: false }).waits.filter((w) => w.kind === 'ticks').length).toBe(2);
  });

  it('prunes attuned plates by loop type and offers glass-avoiding variants', () => {
    const v = buildVocabulary(sandboxAttuned);
    const seal = v.tasks.find((t) => t.tag === 'stand seal')!;
    expect(seal.only).toBe('final');
    expect(v.blindTasks.some((t) => t.tag.includes('stand seal'))).toBe(false);
    expect(v.tasks.some((t) => t.tag === 'press console ~glass' && t.avoid?.size === 1)).toBe(true);
    expect(v.tasks.some((t) => t.tag === 'press console')).toBe(true);
  });
});

describe('solver round 6: sandboxes', () => {
  for (const level of SANDBOX_LEVELS) {
    const cfg = analysisFor(level);
    it(`${level.id}: rediscovers a verified solution with ${cfg.intended} echo(es) that passes the teaching check`, { timeout: 120_000 }, () => {
      const r = search(level, { echoes: cfg.intended, ...cfg.find }, { maxSolutions: 1, budgetMs: 100_000, accept: (s) => cfg.teaching?.(verifySolution(level, s), level) === null });
      expect(r.solutions.length).toBe(1);
      const v = verifySolution(level, r.solutions[0]!);
      expect(v.ok).toBe(true);
      expect(cfg.teaching?.(v, level) ?? null).toBeNull();
    });
    for (const proof of cfg.proof)
      for (let k = 0; k < cfg.intended; k++)
        it(`${level.id}: no solution with ${k} echo(es) within its proof bounds (exhaustive)`, { timeout: 120_000 }, () => {
          const r = search(level, { ...proof, echoes: k }, { maxSolutions: 1, budgetMs: 100_000 });
          expect(r.solutions.map((s) => s.final.steps.join(' > '))).toEqual([]);
          expect(r.exhaustive).toBe(true);
        });
  }

  it('teaching helpers: attuned divergences, glass, relay use and bypass', () => {
    // Attuned Keys: the shortest-route echo shatters the seal (and the final run cannot win), the glass route is clean
    const att = analysisFor(sandboxAttuned);
    const r = search(sandboxAttuned, { echoes: 1, ...att.find }, { maxSolutions: 1, budgetMs: 100_000 });
    const v = verifySolution(sandboxAttuned, r.solutions[0]!);
    expect(attunedDivergences(v)).toBe(1);
    expect(noShatter(v)).toBe(true);
    // Echo Line: the authored-style plan (stand 3 s, wait at the door) uses the relay and does not bypass it
    const rel = search(sandboxRelay, { echoes: 0, ...analysisFor(sandboxRelay).find }, { maxSolutions: 5, budgetMs: 100_000 });
    expect(rel.solutions.length).toBeGreaterThan(0);
    for (const s of rel.solutions) {
      const vr = verifySolution(sandboxRelay, s);
      expect(relayUsed(sandboxRelay, vr, 'relay')).toBe(true);
      expect(relayBypassed(sandboxRelay, vr, 'relay')).toBeNull();
    }
  });
});
