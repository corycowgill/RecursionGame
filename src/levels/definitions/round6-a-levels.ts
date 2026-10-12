import type { LevelDefinition } from '../../engine/contracts';
import { level11TheSump } from './L11-the-sump';
import { level12LateLight } from './L12-late-light';
import { level13Roundabout } from './L13-roundabout';
import { level16Afterimage } from './L16-afterimage';

export { level11TheSump, level12LateLight, level13Roundabout, level16Afterimage };

/**
 * Round-6 chambers by level designer A (valve and relay track). Integrated into CAMPAIGN_LEVELS by the director
 * (campaign positions L11 = 5, L12 = 8, L13 = 9, L16 = 15). Verified by src/levels/round6-a.test.ts and the campaign
 * suites; golden replays in src/testing/replays/; solver configs in src/testing/solver/levelConfigs-round6-a.ts.
 */
export const ROUND6_A_LEVELS: readonly LevelDefinition[] = [level11TheSump, level12LateLight, level13Roundabout, level16Afterimage];
