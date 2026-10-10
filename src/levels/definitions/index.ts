import type { LevelDefinition } from '../../engine/contracts';
import { level01FirstEcho } from './L01-first-echo';
import { level02TwoPlaces } from './L02-two-places';
import { level03TheRelay } from './L03-the-relay';
import { level04TheLift } from './L04-the-lift';
import { level05PerfectTiming } from './L05-perfect-timing';
import { level06ChainReaction } from './L06-chain-reaction';
import { level07BrokenSequence } from './L07-broken-sequence';
import { level08RecursiveMachine } from './L08-recursive-machine';
import { level09ParadoxChamber } from './L09-paradox-chamber';
import { level10TheCore } from './L10-the-core';
import { testChamber } from './test-chamber';

export {
  testChamber,
  level01FirstEcho,
  level02TwoPlaces,
  level03TheRelay,
  level04TheLift,
  level05PerfectTiming,
  level06ChainReaction,
  level07BrokenSequence,
  level08RecursiveMachine,
  level09ParadoxChamber,
  level10TheCore,
};

/** Campaign levels in play order (L01..L10; append new chambers here — levels tests verify each automatically). */
export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  level01FirstEcho,
  level02TwoPlaces,
  level03TheRelay,
  level04TheLift,
  level05PerfectTiming,
  level06ChainReaction,
  level07BrokenSequence,
  level08RecursiveMachine,
  level09ParadoxChamber,
  level10TheCore,
];

/** The vertical-slice chamber (three cooperating loops: crate, pressure plates, timed door, exit). */
export const VERTICAL_SLICE_LEVEL: LevelDefinition = level03TheRelay;

/** Engine/QA reference levels. */
export const TEST_LEVELS: readonly LevelDefinition[] = [testChamber];
