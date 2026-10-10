import type { EntityKind } from '../../engine/contracts';
import { EnergyCellVisual, EnergySocketVisual, CrateVisual } from './items';
import { ExitPortalVisual, LaserEmitterVisual, LaserReceiverVisual, TemporalGateVisual } from './energy';
import { DoorVisual, ElevatorVisual, MovingPlatformVisual, PressurePlateVisual, TimedSwitchVisual } from './mechanisms';
import { Parts, type EntityVisual, type EntityVisualContext } from './types';

export type { EntityVisual, EntityVisualContext, EntityFrame, VfxSink } from './types';
export { MovingPlatformVisual } from './mechanisms';

/** Visual factory for all 12 puzzle kinds. Unknown future kinds return null (renderer skips them). */
const FACTORIES: Record<EntityKind, (ctx: EntityVisualContext) => EntityVisual> = {
  pressurePlate: (c) => new PressurePlateVisual(c),
  door: (c) => new DoorVisual(c),
  timedSwitch: (c) => new TimedSwitchVisual(c),
  crate: (c) => new CrateVisual(c),
  energyCell: (c) => new EnergyCellVisual(c),
  energySocket: (c) => new EnergySocketVisual(c),
  elevator: (c) => new ElevatorVisual(c),
  laserEmitter: (c) => new LaserEmitterVisual(c),
  laserReceiver: (c) => new LaserReceiverVisual(c),
  temporalGate: (c) => new TemporalGateVisual(c),
  movingPlatform: (c) => new MovingPlatformVisual(c),
  exitPortal: (c) => new ExitPortalVisual(c),
};

export function createEntityVisual(ctx: EntityVisualContext): EntityVisual | null {
  const f = (FACTORIES as Partial<Record<string, (ctx: EntityVisualContext) => EntityVisual>>)[ctx.def.kind];
  if (!f) return null;
  const v = f(ctx);
  // every visual builds through a Parts helper named `p`; bake its static meshes
  (v as unknown as { p?: Parts }).p?.mergeStatic(v.root);
  return v;
}

/** Kinds whose visuals should follow the carrier when carried. */
export const CARRIABLE_VISUAL_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['crate', 'energyCell']);
