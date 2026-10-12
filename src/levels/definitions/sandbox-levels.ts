import type { LevelDefinition } from '../../engine/contracts';
import { sandboxAttuned } from './sandbox-attuned';
import { sandboxRelay } from './sandbox-relay';
import { sandboxValve } from './sandbox-valve';

export { sandboxAttuned, sandboxRelay, sandboxValve };

/**
 * Round-6 mechanic sandboxes (NOT campaign content): one small chamber per new mechanic, used by the mechanic tests,
 * the solver (`npm run solve -- S01`) and for visual checks. Validated and solution-verified by
 * src/levels/sandbox.test.ts.
 */
export const SANDBOX_LEVELS: readonly LevelDefinition[] = [sandboxRelay, sandboxValve, sandboxAttuned];
