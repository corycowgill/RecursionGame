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
import { level11TheSump, level12LateLight, level13Roundabout, level16Afterimage } from './round6-a-levels';
import { level14GoldAndCyan, level15GlassGallery, level17Upstream, level18HourOfGlass } from './round6-b-levels';
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
  level11TheSump,
  level12LateLight,
  level13Roundabout,
  level14GoldAndCyan,
  level15GlassGallery,
  level16Afterimage,
  level17Upstream,
  level18HourOfGlass,
};

/**
 * Campaign levels in play order (18 chambers since round 6). Level ids are stable save keys and never change; only
 * `order` follows the play position. Round-6 chambers L11..L18 are interleaved; The Core (L10) stays the finale.
 */
export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  level01FirstEcho, // 1
  level02TwoPlaces, // 2
  level03TheRelay, // 3
  level04TheLift, // 4
  level11TheSump, // 5  (valve)
  level05PerfectTiming, // 6
  level06ChainReaction, // 7
  level12LateLight, // 8  (relay)
  level13Roundabout, // 9  (relay + valve)
  level07BrokenSequence, // 10
  level14GoldAndCyan, // 11 (attuned keys)
  level08RecursiveMachine, // 12
  level15GlassGallery, // 13 (paradox glass)
  level09ParadoxChamber, // 14
  level16Afterimage, // 15 (relay + inverted wire + valve)
  level17Upstream, // 16 (reversible valve + lift + nested loop)
  level18HourOfGlass, // 17 (exam)
  level10TheCore, // 18 finale
];

/** The vertical-slice chamber (three cooperating loops: crate, pressure plates, timed door, exit). */
export const VERTICAL_SLICE_LEVEL: LevelDefinition = level03TheRelay;

/** Engine/QA reference levels. */
export const TEST_LEVELS: readonly LevelDefinition[] = [testChamber];
