/**
 * Rendering module (Graphics team). Import from here:
 *
 *   const r = createGameRenderer(appRoot, { quality: 'high' });
 *   r.setLevel(level, game.getState());
 *   // every frame:
 *   r.render(game.getState(), game.getPreviousState(), stepper.alpha, game.drainEvents());
 *   keyboard.sampler.yawStep = r.getCameraYawStep();
 */
export { createGameRenderer } from './GameRenderer';
export type { GameRenderer, GameRendererOptions } from './GameRenderer';
export { QUALITY_PRESETS } from './quality';
export type { QualityLevel, QualitySettings } from './quality';
export type { CameraMode } from './CameraRig';
