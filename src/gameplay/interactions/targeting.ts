import {
  DIR4_DX,
  DIR4_DZ,
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorId,
  type EntityDefinition,
  type EntityId,
  type EntityKind,
  type LevelDefinition,
  type SimView,
} from '../../engine/contracts';
import { TILE_LEGEND } from '../../engine/contracts';

/**
 * INTERACTION TARGETING (read-only prediction for prompts / highlights).
 *
 * The authoritative rules live in the engine's central interaction system (contracts §7): the target is found
 * at the PROBE cell (actor centre + facing × PHYS.REACH) first, then the actor's own cell, considering uncarried
 * entities within one height level in id order. This helper mirrors those rules against a SimView so the UI can
 * show "E — Pick up crate" and the renderer can outline the target BEFORE the press. It never mutates anything
 * and the simulation remains the only source of truth (a prediction can be wrong only in same-tick contests).
 */

export type PromptAction = 'pickup' | 'drop' | 'insert' | 'extract' | 'use' | 'blocked' | 'none';

export interface InteractionPrompt {
  action: PromptAction;
  /** Entity the prompt refers to (target, or the carried item for drop/blocked). */
  entityId: EntityId | null;
  entityKind: EntityKind | null;
  /** Short UI label, e.g. "Pick up crate". */
  label: string;
  /** Cell being probed (where a drop would land). */
  cell: { col: number; row: number };
}

const NAMES: Record<EntityKind, string> = {
  pressurePlate: 'plate',
  door: 'door',
  timedSwitch: 'switch',
  crate: 'crate',
  energyCell: 'energy cell',
  energySocket: 'socket',
  elevator: 'lift',
  laserEmitter: 'emitter',
  laserReceiver: 'receiver',
  temporalGate: 'gate',
  movingPlatform: 'platform',
  exitPortal: 'exit',
  checkValve: 'valve',
  chronoRelay: 'relay',
};

type ViewEntity = SimView['entities'][string];

const SOLID_KINDS: ReadonlySet<EntityKind> = new Set(['timedSwitch', 'energySocket', 'laserEmitter', 'laserReceiver', 'temporalGate', 'crate', 'checkValve']);
const CARRIABLE: ReadonlySet<EntityKind> = new Set(['crate', 'energyCell']);

const defCache = new WeakMap<LevelDefinition, { ids: EntityId[]; defs: Map<EntityId, EntityDefinition> }>();
function indexLevel(level: LevelDefinition): { ids: EntityId[]; defs: Map<EntityId, EntityDefinition> } {
  let idx = defCache.get(level);
  if (!idx) {
    const defs = new Map(level.entities.map((d) => [d.id, d] as const));
    const ids = [...defs.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    idx = { ids, defs };
    defCache.set(level, idx);
  }
  return idx;
}

function entitiesIn(level: LevelDefinition, view: SimView, col: number, row: number, y: number): ViewEntity[] {
  const out: ViewEntity[] = [];
  for (const id of indexLevel(level).ids) {
    const e = view.entities[id];
    if (!e || e.carriedBy !== null) continue;
    if (fdiv(e.x, UNITS_PER_TILE) !== col || fdiv(e.z, UNITS_PER_TILE) !== row) continue;
    const d = e.y - y;
    if (d >= 1000 || d <= -1000) continue;
    out.push(e);
  }
  return out;
}

function seated(view: SimView, cellId: EntityId): boolean {
  for (const e of Object.values(view.entities)) if (e.kind === 'energySocket' && e.state.cellId === cellId) return true;
  return false;
}

/** Predicts what E would do for `actorId` right now. */
export function predictInteraction(level: LevelDefinition, view: SimView, actorId: ActorId = 'player'): InteractionPrompt {
  const actor = view.actors.find((a) => a.id === actorId);
  const none = (cell: { col: number; row: number }): InteractionPrompt => ({ action: 'none', entityId: null, entityKind: null, label: '', cell });
  if (!actor) return none({ col: 0, row: 0 });
  const probe = {
    col: fdiv(actor.x + (DIR4_DX[actor.facing] ?? 0) * PHYS.REACH, UNITS_PER_TILE),
    row: fdiv(actor.z + (DIR4_DZ[actor.facing] ?? 0) * PHYS.REACH, UNITS_PER_TILE),
  };
  const own = { col: fdiv(actor.x, UNITS_PER_TILE), row: fdiv(actor.z, UNITS_PER_TILE) };
  const candidates = entitiesIn(level, view, probe.col, probe.row, actor.y);
  if (own.col !== probe.col || own.row !== probe.row) candidates.push(...entitiesIn(level, view, own.col, own.row, actor.y));
  const { defs } = indexLevel(level);

  if (actor.carrying !== null) {
    const item = view.entities[actor.carrying];
    const itemKind = item ? item.kind : null;
    for (const e of candidates) {
      if (e.kind !== 'energySocket' || itemKind !== 'energyCell') continue;
      if (e.state.cellId !== null) return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Socket occupied', cell: probe };
      return { action: 'insert', entityId: e.id, entityKind: e.kind, label: 'Insert energy cell', cell: probe };
    }
    const name = itemKind ? NAMES[itemKind] : 'item';
    const ch = level.grid.tiles[probe.row]?.[probe.col] ?? ' ';
    const tile = TILE_LEGEND[ch];
    const hasDeck = Object.values(view.entities).some((e) => {
      if (e.kind !== 'elevator' && e.kind !== 'movingPlatform') return false;
      return fdiv(e.x, UNITS_PER_TILE) === probe.col && fdiv(e.z, UNITS_PER_TILE) === probe.row;
    });
    const occupied = entitiesIn(level, view, probe.col, probe.row, actor.y).some(
      (e) => CARRIABLE.has(e.kind) || SOLID_KINDS.has(e.kind) || (e.kind === 'door' && e.state.progress < 800),
    );
    if ((tile?.kind !== 'floor' && !hasDeck) || occupied)
      return { action: 'blocked', entityId: actor.carrying, entityKind: itemKind, label: `Can't place ${name} here`, cell: probe };
    return { action: 'drop', entityId: actor.carrying, entityKind: itemKind, label: `Place ${name}`, cell: probe };
  }

  for (const e of candidates) {
    const def = defs.get(e.id);
    switch (e.kind) {
      case 'timedSwitch': {
        const cfg = def?.kind === 'timedSwitch' ? def.config : undefined;
        // Round 6: Paradox Glass / Attuned Devices (mirrors timedSwitch.ts: broken, shatter, attuned checks first).
        if (e.state.broken === true) return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Shattered', cell: probe };
        const cls = actor.kind === 'player' ? 'player' : 'echoes';
        if (cfg?.shatterOn === cls) return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Glass - it will shatter', cell: probe };
        if (cfg?.accepts !== undefined && cfg.accepts !== 'all' && cfg.accepts !== cls)
          return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: cfg.accepts === 'echoes' ? 'Echoes only' : 'Only you, now', cell: probe };
        if (e.state.on && cfg?.retrigger === false)
          return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Switch running', cell: probe };
        if (!e.state.on && (e.state.cooldown ?? 0) > 0)
          return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Switch cooling down', cell: probe };
        return { action: 'use', entityId: e.id, entityKind: e.kind, label: e.state.on ? 'Restart timer' : 'Activate switch', cell: probe };
      }
      case 'energySocket':
        if (e.state.cellId === null) break;
        if (def?.kind === 'energySocket' && def.config.allowExtract === false)
          return { action: 'blocked', entityId: e.id, entityKind: e.kind, label: 'Cell locked', cell: probe };
        return { action: 'extract', entityId: e.id, entityKind: e.kind, label: 'Take energy cell', cell: probe };
      case 'elevator':
        if (def?.kind === 'elevator' && def.config.mode === 'cycle')
          return { action: 'use', entityId: e.id, entityKind: e.kind, label: 'Operate lift', cell: probe };
        break;
      case 'crate':
        return { action: 'pickup', entityId: e.id, entityKind: e.kind, label: 'Pick up crate', cell: probe };
      case 'energyCell':
        if (seated(view, e.id)) break;
        return { action: 'pickup', entityId: e.id, entityKind: e.kind, label: 'Pick up energy cell', cell: probe };
      default:
        break;
    }
  }
  return none(probe);
}
