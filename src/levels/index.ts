/**
 * Levels module: ordered campaign, vertical slice, test chambers, progression and validation.
 *   import { LEVELS, CAMPAIGN, VERTICAL_SLICE_LEVEL } from 'src/levels';
 */
import { CAMPAIGN_LEVELS } from './definitions';
import { Campaign } from './progression';

export { CAMPAIGN_LEVELS, TEST_LEVELS, VERTICAL_SLICE_LEVEL } from './definitions';
export * from './definitions';
export * from './progression';
export { validateLevel, type LevelIssue } from './validators/validateLevel';

/** Ordered campaign levels (alias of CAMPAIGN_LEVELS). */
export const LEVELS = CAMPAIGN_LEVELS;

/** Campaign navigator over LEVELS (next level, unlocks, continue). */
export const CAMPAIGN = new Campaign(CAMPAIGN_LEVELS);
