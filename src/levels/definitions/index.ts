import type { LevelDefinition } from '../../engine/contracts';
import { testChamber } from './test-chamber';

export { testChamber };

/** Campaign levels in order (Level designer appends L01..L10 here). */
export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [];

/** Engine/QA reference levels. */
export const TEST_LEVELS: readonly LevelDefinition[] = [testChamber];
