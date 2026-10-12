import type { LevelDefinition } from '../../engine/contracts';
import { level14GoldAndCyan } from './L14-gold-and-cyan';
import { level15GlassGallery } from './L15-glass-gallery';
import { level17Upstream } from './L17-upstream';
import { level18HourOfGlass } from './L18-hour-of-glass';

export { level14GoldAndCyan, level15GlassGallery, level17Upstream, level18HourOfGlass };

/**
 * Round-6 chambers by level designer B (keys and combination track). Integrated into CAMPAIGN_LEVELS by the director
 * (campaign positions L14 = 11, L15 = 13, L17 = 16, L18 = 17). Verified by src/levels/round6-b.test.ts and the campaign
 * suites; golden replays in src/testing/replays/; solver configs in src/testing/solver/levelConfigs-round6-b.ts.
 */
export const ROUND6_B_LEVELS: readonly LevelDefinition[] = [level14GoldAndCyan, level15GlassGallery, level17Upstream, level18HourOfGlass];
