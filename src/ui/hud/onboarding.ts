import type { SimEvent } from '../../engine/contracts';
import type { BindableAction } from '../../persistence/keybinds';

/**
 * ONBOARDING — contextual tutorial prompts for the first two chambers. Each step shows a short instruction with
 * the (remappable) key caps it needs and completes on a concrete signal from the game (an event, the player
 * moving, the timeline opening…), with a timeout fallback so a prompt never lingers forever.
 */

export type OnboardingSignal =
  | { type: 'moved' }
  | { type: 'timelineExpanded' }
  | { type: 'scrubbed' }
  | { type: 'event'; event: SimEvent };

export interface OnboardingStep {
  id: string;
  title: string;
  /** Body text; `{key:action}` is replaced with the bound key label. */
  text: string;
  keys: BindableAction[] | 'move';
  /** Completes when this returns true for a signal. */
  done: (s: OnboardingSignal) => boolean;
  /** Auto-advance after this many seconds visible (optional). */
  timeoutSec?: number;
}

const ev =
  (...types: SimEvent['type'][]) =>
  (s: OnboardingSignal): boolean =>
    s.type === 'event' && types.includes(s.event.type);

export const ONBOARDING: Record<number, { id: string; steps: OnboardingStep[] }> = {
  1: {
    id: 'L01',
    steps: [
      { id: 'move', title: 'Move', text: 'Walk through the hall.', keys: 'move', done: (s) => s.type === 'moved', timeoutSec: 20 },
      {
        id: 'plate',
        title: 'Pressure plate',
        text: 'Stand on the plate on the east balcony. The door stays open only while the plate is held.',
        keys: [],
        done: ev('plateDown'),
        timeoutSec: 45,
      },
      {
        id: 'rewind',
        title: 'Create an echo',
        text: 'Stay on the plate and press {key:rewind}. Time rewinds, and your recording becomes an Echo.',
        keys: ['rewind'],
        done: ev('echoSpawned'),
      },
      {
        id: 'cooperate',
        title: 'Cooperate with yourself',
        text: 'Your Echo replays your exact inputs. Let it hold the plate while you walk through the door.',
        keys: [],
        done: ev('levelComplete'),
        timeoutSec: 30,
      },
    ],
  },
  2: {
    id: 'L02',
    steps: [
      {
        id: 'timeline',
        title: 'Temporal timeline',
        text: 'Press {key:timeline} to expand the timeline. Every loop has its own track.',
        keys: ['timeline'],
        done: (s) => s.type === 'timelineExpanded',
        timeoutSec: 25,
      },
      {
        id: 'scrub',
        title: 'Inspect time',
        text: 'Gold is you, cyan are your Echoes. Drag along the tracks to preview any moment.',
        keys: [],
        done: (s) => s.type === 'scrubbed',
        timeoutSec: 14,
      },
      {
        id: 'edit',
        title: 'Edit the past',
        text: 'Use the trash icon on a track to delete one loop, or press {key:restart} to start the chamber over.',
        keys: ['restart'],
        done: ev('loopDeleted', 'chamberRestart', 'echoSpawned'),
        timeoutSec: 12,
      },
    ],
  },
};

export class OnboardingTracker {
  private index = 0;
  private visibleFor = 0;
  readonly steps: readonly OnboardingStep[];

  constructor(levelOrder: number, enabled = true) {
    this.steps = enabled ? (ONBOARDING[levelOrder]?.steps ?? []) : [];
  }

  get current(): OnboardingStep | null {
    return this.steps[this.index] ?? null;
  }
  get stepIndex(): number {
    return this.index;
  }
  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** Returns true if the step advanced. */
  signal(s: OnboardingSignal): boolean {
    const step = this.current;
    if (step && step.done(s)) {
      this.next();
      return true;
    }
    return false;
  }

  advance(dtSeconds: number): boolean {
    const step = this.current;
    if (!step) return false;
    this.visibleFor += Math.max(0, Math.min(dtSeconds, 1));
    if (step.timeoutSec !== undefined && this.visibleFor >= step.timeoutSec) {
      this.next();
      return true;
    }
    return false;
  }

  skip(): void {
    this.index = this.steps.length;
  }

  private next(): void {
    this.index++;
    this.visibleFor = 0;
  }
}
