import type { GameCommand, PlayerInput } from '../contracts';
import { InputSampler } from './InputSampler';

/**
 * Browser keyboard binding (DOM-only; never imported by simulation code).
 *   WASD / arrows  move          E  interact (pickup / drop / use)      Space  context action
 *   R  rewind (commit echo)       Shift+R  restart chamber              Tab  timeline
 *   Esc  pause                    Q  temporal preview (hold)            1-5  select echo
 * Movement/interaction feed an InputSampler sampled once per sim tick; meta keys become GameCommands.
 */
export class KeyboardInput {
  readonly sampler = new InputSampler();
  private readonly listeners = new Set<(cmd: GameCommand) => void>();
  private target: Window | null = null;
  /** When false, gameplay keys are ignored (e.g. menus open); commands still fire. */
  gameplayEnabled = true;

  attach(target: Window = window): void {
    if (this.target) return;
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  onCommand(fn: (cmd: GameCommand) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  sample(tick: number): PlayerInput {
    return this.sampler.sample(tick);
  }

  private emit(cmd: GameCommand): void {
    for (const fn of this.listeners) fn(cmd);
  }

  private dirFor(code: string): 'left' | 'right' | 'up' | 'down' | null {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        return 'up';
      case 'KeyS':
      case 'ArrowDown':
        return 'down';
      case 'KeyA':
      case 'ArrowLeft':
        return 'left';
      case 'KeyD':
      case 'ArrowRight':
        return 'right';
      default:
        return null;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const dir = this.dirFor(e.code);
    if (dir) {
      if (this.gameplayEnabled) this.sampler.setDirection(dir, true);
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'KeyE':
        if (this.gameplayEnabled && !e.repeat) this.sampler.setInteract(true);
        break;
      case 'Space':
        if (this.gameplayEnabled && !e.repeat) this.sampler.pressAction();
        e.preventDefault();
        break;
      case 'KeyR':
        if (!e.repeat) this.emit(e.shiftKey ? { type: 'restart' } : { type: 'rewind' });
        break;
      case 'Tab':
        e.preventDefault();
        if (!e.repeat) this.emit({ type: 'toggleTimeline' });
        break;
      case 'Escape':
        if (!e.repeat) this.emit({ type: 'pause' });
        break;
      case 'KeyQ':
        if (!e.repeat) this.emit({ type: 'temporalPreview', held: true });
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
        if (!e.repeat) this.emit({ type: 'selectEcho', index: Number(e.code.slice(5)) - 1 });
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const dir = this.dirFor(e.code);
    if (dir) {
      this.sampler.setDirection(dir, false);
      return;
    }
    if (e.code === 'KeyE') this.sampler.setInteract(false);
    if (e.code === 'KeyQ') this.emit({ type: 'temporalPreview', held: false });
  };

  private readonly onBlur = (): void => {
    this.sampler.releaseAll();
  };
}
