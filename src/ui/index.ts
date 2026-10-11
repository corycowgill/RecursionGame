/**
 * UI module barrel (DOM overlay in #ui). Usage (director):
 *
 *   const ui = createUI(document.getElementById('ui')!, callbacks, { settings, keybinds, seenTutorials });
 *   ui.showMainMenu({ continueLevel, levels: buildLevelEntries(LEVELS, save.progress), totalStars, maxStars });
 *   // per frame:  ui.update({ level, state: game.getState(), timeline: game.getTimeline(), paused, prompt, objective, previewTick, dt });
 *   //             ui.onEvents(game.drainEvents());
 */
import './fonts';

export * from './createUI';
export * from './types';
export * from './palette';
export { buildLevelEntries } from './menus/LevelSelect';
export { HintScheduler } from './hud/hints';
export { OnboardingTracker, ONBOARDING } from './hud/onboarding';
export * from './timeline/model';
export { injectStyles } from './styles';
export * from './glyphs';
