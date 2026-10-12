import type { EntityDefinition } from '../../engine/contracts';

/**
 * ROUND-6 PLAYER-FACING TEXT for the new mechanics (action tokens only, never key names; rendered by
 * src/ui/actionText.ts). Shared by the HUD toasts and hint authors so the vocabulary stays consistent:
 *   relay   "the conduit remembers the last N seconds"
 *   valve   "<name> - inward only"
 *   keys    Gold Seal / Gold Console (player only), Echo Plate / Echo Console (echoes only), Glass Plate / Glass Console
 */
export const ATTUNED_TEXT = {
  echoOnly: 'Only an echo can use this - {echo} and let your past self press it',
  playerOnly: 'Only you, now, can use this',
  shattered: 'The glass shattered - it stays broken until the next loop',
  intended: 'Your echo used the Echo Console',
} as const;

/** Hint vocabulary for a chrono relay: "the conduit remembers the last 6 seconds". */
export function relayHint(delayTicks: number): string {
  const s = Math.round((delayTicks / 60) * 10) / 10;
  return `the conduit remembers the last ${s} second${s === 1 ? '' : 's'}`;
}

const DIR_WORD = ['north', 'east', 'south', 'west'] as const;

/**
 * Default display label (HUD / objectives / timeline) for a device when the author gave none:
 * 'Echo Line - 6 s', 'Check Valve - east only', 'Gold Seal', 'Echo Console', 'Glass Plate', ...
 */
export function defaultMechanicLabel(def: EntityDefinition): string | null {
  switch (def.kind) {
    case 'chronoRelay':
      return `Echo Line - ${Math.round((def.config.delayTicks / 60) * 10) / 10} s`;
    case 'checkValve':
      return `Check Valve - ${DIR_WORD[def.facing ?? 0]} only${def.config.reverseWhenPowered ? ' (reversible)' : ''}`;
    case 'pressurePlate':
    case 'timedSwitch': {
      const plate = def.kind === 'pressurePlate';
      if (def.config.shatterOn !== undefined) return def.config.accepts === 'player' ? 'Glass Seal' : plate ? 'Glass Plate' : 'Glass Console';
      if (def.config.accepts === 'player') return plate ? 'Gold Seal' : 'Gold Console';
      if (def.config.accepts === 'echoes') return plate ? 'Echo Plate' : 'Echo Console';
      return null;
    }
    default:
      return null;
  }
}
