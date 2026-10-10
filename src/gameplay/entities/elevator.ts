import { idiv, type PuzzleEntityBehaviour } from '../../engine/contracts';
import { clampStep, entityCell } from './common';

/**
 * Elevator — a one-cell platform that provides a walk surface at state.y and travels between height levels
 * (config.levels, ascending). Author it on a void shaft cell ('_'); the surface override makes the cell walkable
 * only at the platform's current height, so actors step on/off only when it is level with a floor.
 *
 * Modes (config.mode, default 'signal'):
 *  - 'signal': goes to the top level while its combined input is powered, to levels[0] otherwise. Unwired: stays.
 *  - 'cycle' : E on the platform (own cell) or while facing it advances to the next level (wrapping). 'fail'/'busy'
 *              while travelling.
 *  - 'ride'  : an occupant (actor, or a plate-weighted item) resting on the platform for rideDelayTicks (30) sends
 *              it to the next level; it re-arms only after being vacated.
 *  In 'cycle'/'ride' a wired input is a call button (each rising edge advances). config.returnDelayTicks sends an
 *  empty platform home to startIndex.
 *
 * Deterministic blocking: a departure is HELD (state.held) while any actor straddles the shaft edge (footprint
 * overlaps the cell but is not standing on the platform), so nobody is ever clipped by a moving platform.
 * Speed: ceil(1000 / ticksPerLevel) units per tick (default 60 ticks per level). Riders are carried through the
 * surface override (and state.dy via carrierDelta). Output: at rest on the top level.
 * Events: elevatorStart / elevatorArrive.
 */
export const elevatorBehaviour: PuzzleEntityBehaviour<'elevator'> = {
  kind: 'elevator',
  reset(def) {
    const levels = def.config.levels.length > 0 ? def.config.levels : [0];
    const idx = Math.min(Math.max(def.config.startIndex ?? 0, 0), levels.length - 1);
    return {
      y: (levels[idx] ?? 0) * 1000,
      targetIndex: idx,
      moving: false,
      dy: 0,
      dwellTicks: 0,
      armed: true,
      lastInput: false,
      held: false,
    };
  },
  initialOutput: (def, s) => {
    const levels = def.config.levels;
    return levels.length > 1 && s.targetIndex === levels.length - 1;
  },
  surfaceCells: (e) => {
    const c = entityCell(e);
    return [{ col: c.col, row: c.row, y: e.state.y }];
  },
  carrierDelta: (e) => (e.state.dy !== 0 ? { dx: 0, dy: e.state.dy, dz: 0 } : null),
  interact(ctx) {
    if ((ctx.config.mode ?? 'signal') !== 'cycle') return null;
    const s = ctx.entity.state;
    if (s.moving) return { kind: 'fail', entityId: ctx.entity.id, reason: 'busy' };
    const n = Math.max(1, ctx.config.levels.length);
    s.targetIndex = (s.targetIndex + 1) % n;
    s.dwellTicks = 0;
    return { kind: 'use', entityId: ctx.entity.id };
  },
  update(ctx) {
    const e = ctx.entity;
    const s = e.state;
    const cfg = ctx.config;
    const levels = cfg.levels.length > 0 ? cfg.levels : [0];
    const n = levels.length;
    const mode = cfg.mode ?? 'signal';
    const { col, row } = entityCell(e);
    const atRest = !s.moving && s.y === (levels[s.targetIndex] ?? 0) * 1000;
    const powered = ctx.inputsPowered(e.id);
    const home = Math.min(Math.max(cfg.startIndex ?? 0, 0), n - 1);

    if (mode === 'signal') {
      if (powered !== null) s.targetIndex = powered ? n - 1 : 0;
    } else {
      const rising = powered === true && s.lastInput !== true;
      s.lastInput = powered === true;
      if (rising && atRest) {
        s.targetIndex = (s.targetIndex + 1) % n;
        s.dwellTicks = 0;
      } else if (atRest) {
        let occupied = ctx.actorsOnCell(col, row, s.y).length > 0;
        if (!occupied) {
          for (const o of ctx.entitiesInCell(col, row)) {
            if (o.id !== e.id && (ctx.runtime.behaviourFor(o.kind).plateWeight ?? 0) > 0) occupied = true;
          }
        }
        if (mode === 'ride' && occupied) {
          if (s.armed !== false) {
            s.dwellTicks = (s.dwellTicks ?? 0) + 1;
            if (s.dwellTicks >= Math.max(1, cfg.rideDelayTicks ?? 30)) {
              s.targetIndex = (s.targetIndex + 1) % n;
              s.armed = false;
              s.dwellTicks = 0;
            }
          }
        } else if (!occupied) {
          s.armed = true;
          if (cfg.returnDelayTicks !== undefined && s.targetIndex !== home) {
            s.dwellTicks = (s.dwellTicks ?? 0) + 1;
            if (s.dwellTicks >= Math.max(1, cfg.returnDelayTicks)) {
              s.targetIndex = home;
              s.dwellTicks = 0;
            }
          } else {
            s.dwellTicks = 0;
          }
        }
      }
    }

    const targetY = (levels[s.targetIndex] ?? 0) * 1000;
    s.dy = 0;
    if (s.y !== targetY) {
      if (!s.moving) {
        // Departure safety: hold while someone straddles the shaft edge.
        const riders = ctx.actorsOnCell(col, row, s.y);
        const straddlers = ctx.actorsOverlappingCell(col, row, s.y).filter((a) => !riders.includes(a));
        s.held = straddlers.length > 0;
        if (!s.held) {
          s.moving = true;
          ctx.emit({ type: 'elevatorStart', tick: ctx.tick, entityId: e.id, fromY: s.y, toY: targetY });
        }
      }
      if (s.moving) {
        const tpl = Math.max(1, cfg.ticksPerLevel ?? 60);
        const speed = idiv(1000 + tpl - 1, tpl);
        s.dy = clampStep(targetY - s.y, speed);
        s.y += s.dy;
        if (s.y === targetY) {
          s.moving = false;
          ctx.emit({ type: 'elevatorArrive', tick: ctx.tick, entityId: e.id, y: s.y });
        }
      }
    } else {
      s.moving = false;
      s.held = false;
    }
    e.y = s.y;
    ctx.setOutput(!s.moving && n > 1 && s.targetIndex === n - 1 && s.y === targetY);
  },
};
