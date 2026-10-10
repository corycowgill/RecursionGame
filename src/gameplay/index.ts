/**
 * Gameplay module barrel: entity behaviours (all 12 kinds), interaction targeting, actor animation state and
 * puzzle objectives/completion. Gameplay code never imports Three.js and never writes simulation state outside
 * entity behaviours.
 */
export * from './entities';
export * from './interactions/targeting';
export * from './player/animation';
export * from './puzzles/objectives';
export * from './puzzles/completion';
