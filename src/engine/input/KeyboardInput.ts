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
  /**
   * Optional key remapper (additive, director integration): maps a key event to a bindable action name
   * ('moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'interact' | 'action' | 'rewind' | 'restart' | 'timeline' |
   * 'pause' | 'preview' | 'echo1'..'echo5'). Null = the built-in default layout below.
   */
  resolver: ((code: string, shiftKey: boolean) => string | null) | null = null;
  /** Codes currently held for movement/interact/preview, so key-up releases what key-down pressed. */
  private readonly held = new Map<string, string>();

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

  /** Resolves a key to an action through `resolver`, falling back to the default layout. */
  private actionFor(code: string, shiftKey: boolean): string | null {
    if (this.resolver) return this.resolver(code, shiftKey);
    const dir = this.dirFor(code);
    if (dir) return { up: 'moveUp', down: 'moveDown', left: 'moveLeft', right: 'moveRight' }[dir];
    switch (code) {
      case 'KeyE':
        return 'interact';
      case 'Space':
        return 'action';
      case 'KeyR':
        return shiftKey ? 'restart' : 'rewind';
      case 'Tab':
        return 'timeline';
      case 'Escape':
        return 'pause';
      case 'KeyQ':
        return 'preview';
      default:
        return /^Digit[1-5]$/.test(code) ? `echo${code.slice(5)}` : null;
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = this.actionFor(e.code, e.shiftKey);
    if (!action) return;
    const dir = ({ moveUp: 'up', moveDown: 'down', moveLeft: 'left', moveRight: 'right' } as const)[action as 'moveUp'];
    if (dir) {
      // Held directions are always tracked (a key held through a menu/intro resumes on return); only the default
      // browser action is left alone while menus are open, so arrows still navigate them.
      this.sampler.setDirection(dir, true);
      this.held.set(e.code, action);
      if (this.gameplayEnabled) e.preventDefault();
      return;
    }
    switch (action) {
      case 'interact':
        if (this.gameplayEnabled && !e.repeat) {
          this.sampler.setInteract(true);
          this.held.set(e.code, action);
        }
        break;
      case 'action':
        if (this.gameplayEnabled) {
          if (!e.repeat) this.sampler.pressAction();
          e.preventDefault();
        }
        break;
      case 'rewind':
        if (!e.repeat) this.emit({ type: 'rewind' });
        break;
      case 'restart':
        if (!e.repeat) this.emit({ type: 'restart' });
        break;
      case 'timeline':
        // Only swallow Tab during gameplay: menus need it for focus traversal.
        if (this.gameplayEnabled) e.preventDefault();
        if (!e.repeat) this.emit({ type: 'toggleTimeline' });
        break;
      case 'pause':
        if (!e.repeat) this.emit({ type: 'pause' });
        break;
      case 'preview':
        if (!e.repeat) {
          this.held.set(e.code, action);
          this.emit({ type: 'temporalPreview', held: true });
        }
        break;
      default:
        if (/^echo[1-5]$/.test(action) && !e.repeat) this.emit({ type: 'selectEcho', index: Number(action.slice(4)) - 1 });
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = this.held.get(e.code);
    if (!action) return;
    this.held.delete(e.code);
    const dir = ({ moveUp: 'up', moveDown: 'down', moveLeft: 'left', moveRight: 'right' } as const)[action as 'moveUp'];
    if (dir) {
      // Another held key may still map to the same direction (e.g. W and ArrowUp).
      if (![...this.held.values()].includes(action)) this.sampler.setDirection(dir, false);
      return;
    }
    if (action === 'interact' && ![...this.held.values()].includes('interact')) this.sampler.setInteract(false);
    if (action === 'preview') this.emit({ type: 'temporalPreview', held: false });
  };

  private readonly onBlur = (): void => {
    this.releaseAll();
  };

  /** Releases every held key (blur, menus opening, level transitions) so nothing sticks. */
  releaseAll(): void {
    const previewHeld = [...this.held.values()].includes('preview');
    this.held.clear();
    this.sampler.releaseAll();
    if (previewHeld) this.emit({ type: 'temporalPreview', held: false });
  }
}
