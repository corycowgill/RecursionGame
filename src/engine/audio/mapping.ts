import type { ActorId, SimEvent, SimView } from '../contracts';
import { UNITS_PER_TILE, cellOf } from '../contracts';
import type { Cue, VoiceCategory } from './types';
import { RECIPES } from './sfx';

/**
 * Pure event → cue mapping. No Web Audio here, so it is fully unit-testable.
 *
 * Spatialisation: the listener is the live player (the camera tracks it). Pan follows the horizontal offset
 * (±7 tiles = full pan, scaled to ±0.85 so nothing is hard-panned) and gain falls off gently with distance.
 *
 * Sequencing: TemporalGame emits `rewind`, `echoSpawned`, `recordStart` in one batch on commit. They are
 * staggered so the player hears: record-end → rewind whoosh → echo bloom (as the echo materialises) → record chime.
 */
export const PAN_RANGE_TILES = 7;
export const PAN_MAX = 0.85;
export const ECHO_STEP_GAIN = 0.45;
export const ECHO_SFX_GAIN = 0.75;

export const SEQ = {
  rewind: 0.04,
  echoBloom: 0.85,
  recordStartAfterRewind: 1.45,
  recordStartAfterReset: 0.9,
  recordStartAfterLoad: 0.9,
} as const;

/** Default door travel time (DoorConfig.openTicks default 18 ticks). */
const DOOR_SECONDS = 18 / 60;

export interface Listener {
  x: number;
  z: number;
}

export function listenerOf(state: SimView): Listener | null {
  for (const a of state.actors) if (a.kind === 'player') return { x: a.x, z: a.z };
  return null;
}

export function spatial(x: number, z: number, listener: Listener | null): { pan: number; gain: number } {
  if (!listener) return { pan: 0, gain: 1 };
  const dx = (x - listener.x) / UNITS_PER_TILE;
  const dz = (z - listener.z) / UNITS_PER_TILE;
  const pan = Math.max(-1, Math.min(1, dx / PAN_RANGE_TILES)) * PAN_MAX;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const gain = Math.max(0.22, 1 / (1 + Math.max(0, dist - 2.5) * 0.11));
  return { pan, gain };
}

const isEcho = (id: ActorId | null | undefined): boolean => typeof id === 'string' && id.startsWith('echo:');

function cue(sound: string, opts: Partial<Omit<Cue, 'sound'>> = {}): Cue {
  const recipe = RECIPES[sound];
  const category: VoiceCategory = opts.category ?? recipe?.category ?? 'mechanical';
  return {
    sound,
    category,
    pan: opts.pan ?? 0,
    gain: opts.gain ?? 1,
    delay: opts.delay ?? 0,
    params: opts.params ?? {},
    ...(opts.key !== undefined ? { key: opts.key } : {}),
    ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
  };
}

/** Is the actor standing on a metal platform (elevator / moving platform) at this position? */
function onMetal(state: SimView, x: number, y: number, z: number): boolean {
  const c = cellOf(x, z);
  for (const id in state.entities) {
    const e = state.entities[id];
    if (!e || (e.kind !== 'elevator' && e.kind !== 'movingPlatform')) continue;
    const ec = cellOf(e.x, e.z);
    const ey = e.kind === 'elevator' ? (e.state as { y: number }).y : e.y;
    if (ec.col === c.col && ec.row === c.row && Math.abs(ey - y) < 250) return true;
  }
  return false;
}

export interface MapContext {
  /** Seconds per tick for spreading multi-tick batches (default 1/60). */
  tickSeconds?: number;
}

/**
 * Map one frame's events to cues. Simulation events within a batch are spread by their tick offset (so two
 * ticks of footsteps don't flam), capped at 100 ms.
 */
export function mapEvents(events: readonly SimEvent[], state: SimView, mc: MapContext = {}): Cue[] {
  const out: Cue[] = [];
  if (events.length === 0) return out;
  const tickSec = mc.tickSeconds ?? 1 / 60;
  const listener = listenerOf(state);
  const types = new Set(events.map((e) => e.type));
  const temporalReset = types.has('rewind') || types.has('chamberRestart') || types.has('loopDeleted');
  const committed = types.has('echoSpawned');
  const META = new Set([
    'levelLoaded',
    'recordStart',
    'rewind',
    'echoSpawned',
    'echoLimitReached',
    'loopDeleted',
    'chamberRestart',
  ]);
  let minTick = Infinity;
  for (const e of events) if (!META.has(e.type) && e.tick < minTick) minTick = e.tick;
  const spread = (tick: number): number => (Number.isFinite(minTick) ? Math.min(0.1, Math.max(0, (tick - minTick) * tickSec)) : 0);

  const entityPos = (id: string | null): { pan: number; gain: number } => {
    const e = id ? state.entities[id] : undefined;
    return e ? spatial(e.x, e.z, listener) : { pan: 0, gain: 1 };
  };
  const actorPos = (id: ActorId): { pan: number; gain: number } => {
    const a = state.actors.find((x) => x.id === id);
    return a ? spatial(a.x, a.z, listener) : { pan: 0, gain: 1 };
  };

  for (const ev of events) {
    const d = spread(ev.tick);
    switch (ev.type) {
      /* ---- actors ---- */
      case 'footstep': {
        const echo = isEcho(ev.actorId);
        const s = spatial(ev.x, ev.z, listener);
        out.push(
          cue('footstep', {
            ...s,
            gain: s.gain * (echo ? ECHO_STEP_GAIN : 1),
            delay: d,
            actor: echo ? 'echo' : 'player',
            key: `step:${ev.actorId}`,
            params: { echo: echo ? 1 : 0, foot: ev.foot, metal: onMetal(state, ev.x, ev.y, ev.z) ? 1 : 0 },
          }),
        );
        break;
      }
      case 'pickup':
      case 'drop': {
        const echo = isEcho(ev.actorId);
        const s = actorPos(ev.actorId);
        out.push(
          cue(ev.type, {
            ...s,
            gain: s.gain * (echo ? ECHO_SFX_GAIN : 1),
            delay: d,
            actor: echo ? 'echo' : 'player',
            key: `${ev.type}:${ev.entityId}`,
            params: { cell: ev.entityKind === 'energyCell' ? 1 : 0, echo: echo ? 1 : 0 },
          }),
        );
        break;
      }
      case 'interact': {
        if (ev.kind === 'use' || ev.kind === 'action') {
          const echo = isEcho(ev.actorId);
          const s = entityPos(ev.entityId);
          out.push(cue('interactUse', { ...s, gain: s.gain * (echo ? ECHO_SFX_GAIN : 1), delay: d, actor: echo ? 'echo' : 'player' }));
        }
        break;
      }
      case 'interactFailed': {
        const echo = isEcho(ev.actorId);
        const s = actorPos(ev.actorId);
        out.push(
          cue('interactFailed', {
            ...s,
            gain: s.gain * (echo ? 0.6 : 1),
            delay: d,
            actor: echo ? 'echo' : 'player',
            key: `fail:${ev.actorId}`,
            params: { echo: echo ? 1 : 0 },
          }),
        );
        break;
      }
      case 'divergence': {
        const s = actorPos(ev.actorId);
        // Divergence is critical feedback: keep it loud and only half-panned.
        out.push(cue('divergence', { pan: s.pan * 0.5, gain: 1, delay: d, key: `div:${ev.actorId}`, params: { echoIndex: ev.echoIndex } }));
        break;
      }
      case 'echoFinished': {
        const s = actorPos(ev.actorId);
        out.push(cue('echoFinished', { ...s, gain: s.gain * 0.8, delay: d, params: { echoIndex: ev.echoIndex } }));
        break;
      }

      /* ---- puzzle components ---- */
      case 'plateDown':
      case 'plateUp':
      case 'doorBlocked':
      case 'gateBlocked':
      case 'elevatorHeld':
      case 'switchOff':
      case 'cellRemoved':
      case 'elevatorStart':
      case 'elevatorArrive':
      case 'platformDepart':
      case 'platformArrive':
      case 'laserOn':
      case 'laserOff':
      case 'receiverLit':
      case 'receiverUnlit':
      case 'gateOpen':
      case 'gateClose':
      case 'cellInserted':
      case 'switchOn': {
        const s = entityPos(ev.entityId);
        const actor = 'actorId' in ev ? ev.actorId : null;
        const echo = isEcho(actor);
        out.push(
          cue(ev.type, {
            ...s,
            gain: s.gain * (echo ? ECHO_SFX_GAIN : 1),
            delay: d,
            key: `${ev.type}:${ev.entityId}`,
            ...(actor ? { actor: echo ? ('echo' as const) : ('player' as const) } : {}),
          }),
        );
        break;
      }
      case 'doorOpen':
      case 'doorClose': {
        const s = entityPos(ev.entityId);
        out.push(cue(ev.type, { ...s, delay: d, key: `door:${ev.entityId}`, params: { dur: DOOR_SECONDS } }));
        break;
      }
      case 'switchTick': {
        const s = entityPos(ev.entityId);
        out.push(cue('switchTick', { ...s, delay: d, key: `tick:${ev.entityId}`, params: { remaining: Math.round(ev.remainingTicks / 60) } }));
        break;
      }
      case 'portalActivated': {
        const s = entityPos(ev.entityId);
        out.push(cue('portalOn', { pan: s.pan * 0.6, gain: Math.max(0.6, s.gain), delay: d, key: `portal:${ev.entityId}` }));
        break;
      }
      case 'portalDeactivated': {
        const s = entityPos(ev.entityId);
        out.push(cue('portalOff', { ...s, delay: d, key: `portal:${ev.entityId}` }));
        break;
      }
      case 'entity': {
        const s = entityPos(ev.entityId);
        out.push(cue('entityGeneric', { ...s, gain: s.gain * 0.6, delay: d, key: `entity:${ev.name}:${ev.entityId}` }));
        break;
      }

      /* ---- chamber / temporal ---- */
      case 'levelLoaded':
        out.push(cue('arrival', { key: 'arrival' }));
        break;
      case 'rewind':
        if (committed) out.push(cue('recordEnd', { key: 'recordEnd' }));
        out.push(cue(committed ? 'rewind' : 'rewindShort', { delay: committed ? SEQ.rewind : 0, key: 'rewind' }));
        break;
      case 'echoSpawned':
        out.push(cue('echoBloom', { delay: types.has('rewind') ? SEQ.echoBloom : 0, key: 'bloom', params: { echoIndex: ev.echoIndex } }));
        break;
      case 'recordStart': {
        const delay = temporalReset
          ? committed || types.has('chamberRestart')
            ? SEQ.recordStartAfterRewind
            : SEQ.recordStartAfterReset
          : types.has('levelLoaded') ? SEQ.recordStartAfterLoad : 0;
        out.push(cue('recordStart', { delay, key: 'recordStart', gain: committed || types.has('levelLoaded') ? 1 : 0.7 }));
        break;
      }
      case 'echoLimitReached':
        out.push(cue('echoLimit', { key: 'echoLimit' }));
        break;
      case 'loopDeleted':
        out.push(cue('loopDeleted', { key: 'loopDeleted', params: { echoIndex: ev.echoIndex } }));
        break;
      case 'chamberRestart':
        out.push(cue('restart', { key: 'restart' }));
        break;
      case 'loopTimeUp':
        out.push(cue('timeUp', { key: 'timeUp' }));
        break;
      case 'levelComplete':
        out.push(cue('fanfare', { delay: 0.05, key: 'fanfare' }));
        break;
      default: {
        const never: never = ev;
        void never;
      }
    }
  }
  return out;
}

/** Voice priority: live player 2, chamber/temporal stingers 3, echoes 1, unattributed world sounds 1.5. */
export function priorityOf(c: Cue): number {
  if (c.category === 'temporal' || c.category === 'stinger' || c.category === 'ui') return 3;
  if (c.actor === 'player') return 2;
  if (c.actor === 'echo') return 1;
  return 1.5;
}
