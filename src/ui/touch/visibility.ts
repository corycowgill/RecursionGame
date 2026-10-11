/**
 * TOUCH-CONTROL VISIBILITY — pure rules (unit-tested).
 *
 * On-screen controls exist only on touch devices, and only while touch is the last-used device: any keyboard key
 * or controller button hides them (the prompts switch to key caps / pad glyphs), and the next touch brings them
 * back. Within that, what shows depends on the game: the joystick and action buttons only while a chamber is being
 * played with no menu on top, the pause button also while the timeline sheet is open, nothing in portrait (the rotate
 * overlay covers the game).
 */
export interface TouchVisibilityInput {
  touchCapable: boolean;
  /** Last-used input device kind. */
  device: 'keyboard' | 'gamepad' | 'touch';
  /** The HUD is up (a chamber is loaded and being played or introduced). */
  hud: boolean;
  /** Top-most screen (menu, pause, intro, …) or null while only the HUD shows. */
  screen: string | null;
  timelineExpanded: boolean;
  portrait: boolean;
}

export interface TouchVisibility {
  /** Root flag: touch mode styling (larger hit targets, key caps hidden). */
  touchMode: boolean;
  /** Joystick zone + action buttons. */
  controls: boolean;
  /** Pause button (top corner). */
  pause: boolean;
  /** Rotate-your-device overlay. */
  rotate: boolean;
}

export function touchVisibility(i: TouchVisibilityInput): TouchVisibility {
  const touchMode = i.touchCapable && i.device === 'touch';
  const rotate = i.touchCapable && i.portrait;
  const playing = i.hud && i.screen === null && !rotate;
  return {
    touchMode,
    controls: touchMode && playing && !i.timelineExpanded,
    pause: touchMode && playing,
    rotate,
  };
}

/** The game should be paused because of the device orientation (a chamber is being played in portrait). */
export function shouldPauseForOrientation(touchCapable: boolean, portrait: boolean, playing: boolean): boolean {
  return touchCapable && portrait && playing;
}
