import {
  IDLE_INPUT,
  type ActorState,
  type AnySimEntity,
  type InputScript,
  type LevelDefinition,
  type SimEvent,
  type SimState,
  type SimView,
  type TemporalLoop,
} from '../engine/contracts';
import { createGameRenderer, type CameraMode, type QualityLevel } from '../engine/rendering';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import { testChamber } from '../levels/definitions/test-chamber';
import { compileSolution } from '../testing/harness/harness';
import { ScriptRunner } from '../testing/harness/script';

/**
 * GRAPHICS PREVIEW PAGE (graphics-preview.html) — standalone visual test bed for the renderer.
 *
 *  ?scene=chamber   (default) the real Test Chamber driven by the real TemporalGame: Echo 1 holds the plate,
 *                   Echo 2 replays the exit run, the live player follows a scripted path.
 *  ?scene=level&id=<levelId|order>  any campaign level replaying its verified solution (echoes + final run).
 *  ?scene=showcase  render-only fixture of all 12 entity kinds + characters (fake SimView, never a game).
 *  ?t=<tick>        deterministic screenshot mode: fast-forward to <tick>, render settle frames at a fixed
 *                   1/60 s step, then set window.__PREVIEW__.ready = true (Playwright waits on it).
 *  ?quality=low|mobile|medium|high   ?dynres=0|1   ?camera=follow|overview   ?intro=1 (play fly-in in live mode)
 *  ?palette=highContrast  colour-blind-safe echo palette in 3D (round 4, same as Settings → Echo colours)
 *  ?held=1          showcase only: the lift is held (pulsing coral edge, stalled machinery) and the temporal gate is
 *                   held open by an occupant (pulsing gold lamp) — the round-4 blocking feedback
 *  ?turntable=1     character turntable instead of a scene (front three-quarter studio view, see turntable.ts)
 */

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'chamber';
const quality = (params.get('quality') as QualityLevel | null) ?? 'high';
const cameraMode = (params.get('camera') as CameraMode | null) ?? 'follow';
const targetTick = params.has('t') ? Number(params.get('t')) : null;
const settleFrames = Number(params.get('settle') ?? 45);

const root = document.getElementById('app')!;
const renderer = createGameRenderer(root, {
  quality,
  introOnLevelLoad: targetTick === null ? params.get('intro') !== '0' : params.get('intro') === '1',
  preserveDrawingBuffer: true,
  // ?dynres=1 forces the dynamic-resolution guard on (it is off under automation by default), ?dynres=0 off
  ...(params.has('dynres') ? { dynamicResolution: params.get('dynres') !== '0' } : {}),
});
if (params.get('palette') === 'highContrast') renderer.setEchoPalette('highContrast');
const forceHeld = params.get('held') === '1';
const preview = { ready: false, stats: () => renderer.stats(), renderer };
(window as unknown as { __PREVIEW__: typeof preview }).__PREVIEW__ = preview;

interface Driver {
  level: LevelDefinition;
  /** Advance one tick; returns this tick's events. */
  step(): SimEvent[];
  state(): SimView;
  prev(): SimView;
}

// ---------------------------------------------------------------- chamber (real engine)

function chamberDriver(): Driver {
  const level = testChamber;
  const game = new TemporalGame(createDefaultRegistry());
  game.loadLevel(level);
  const solved = compileSolution(level);
  const echoes: TemporalLoop[] = [
    { ...solved[0]!, id: 1 },
    { ...solved[1]!, id: 2, outcomes: [] },
  ];
  const playerScript: InputScript = [
    { op: 'wait', ticks: 20 },
    { op: 'moveTo', col: 4, row: 2 },
    { op: 'moveTo', col: 6, row: 3 },
    { op: 'wait', ticks: 30 },
    { op: 'moveTo', col: 5, row: 3 },
    { op: 'moveTo', col: 5, row: 5 },
    { op: 'moveTo', col: 7, row: 5 },
    { op: 'wait', ticks: 600 },
  ];
  let runner = new ScriptRunner(playerScript);
  const restart = () => {
    game.setLoops(echoes);
    runner = new ScriptRunner(playerScript);
  };
  restart();
  game.drainEvents();
  return {
    level,
    step() {
      const st = game.getState();
      if (st.status !== 'playing') {
        restart();
      } else {
        game.step(runner.next(st) ?? { ...IDLE_INPUT, tick: st.tick });
      }
      return game.drainEvents();
    },
    state: () => game.getState(),
    prev: () => game.getPreviousState(),
  };
}

// ---------------------------------------------------------------- campaign level (real engine, solution replay)

function levelDriver(idOrOrder: string): Driver {
  const level = CAMPAIGN_LEVELS.find((l) => l.id === idOrOrder || String(l.order) === idOrOrder) ?? CAMPAIGN_LEVELS[0] ?? testChamber;
  const game = new TemporalGame(createDefaultRegistry());
  game.loadLevel(level);
  const loops = compileSolution(level);
  const echoes = loops.slice(0, -1);
  const final = loops[loops.length - 1];
  const restart = () => game.setLoops(echoes);
  restart();
  game.drainEvents();
  return {
    level,
    step() {
      const st = game.getState();
      if (st.status !== 'playing') restart();
      else game.step(final?.inputs[st.tick] ?? { ...IDLE_INPUT, tick: st.tick });
      return game.drainEvents();
    },
    state: () => game.getState(),
    prev: () => game.getPreviousState(),
  };
}

// ---------------------------------------------------------------- showcase (render-only fixture)

const SHOWCASE: LevelDefinition = {
  id: 'G00-graphics-showcase',
  order: 0,
  name: 'Graphics Showcase',
  grid: {
    width: 14,
    height: 10,
    tiles: [
      '##############',
      '#............#',
      '#.O........O.#',
      '#............#',
      '#...  .......#',
      '#...  ....=v=#',
      '#...  ....=.=#',
      '#............#',
      '#............#',
      '##############',
    ],
    heights: [
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000000',
      '00000000000111',
      '00000000000111',
      '00000000000000',
      '00000000000000',
    ],
  },
  entities: [
    { id: 'a-plate', kind: 'pressurePlate', col: 2, row: 1, config: {} },
    { id: 'b-door', kind: 'door', col: 6, row: 0, facing: 0, config: {} },
    { id: 'c-switch', kind: 'timedSwitch', col: 9, row: 1, config: { durationTicks: 240 } },
    { id: 'd-crate', kind: 'crate', col: 3, row: 3, config: {} },
    { id: 'e-cell', kind: 'energyCell', col: 7, row: 3, config: {} },
    { id: 'f-socket', kind: 'energySocket', col: 9, row: 3, config: {} },
    { id: 'f-cell2', kind: 'energyCell', col: 9, row: 3, config: { tag: 'v' } },
    { id: 'g-elev', kind: 'elevator', col: 4, row: 4, config: { levels: [0, 1] } },
    { id: 'h-laser', kind: 'laserEmitter', col: 1, row: 8, facing: 1, config: {} },
    { id: 'i-recv', kind: 'laserReceiver', col: 8, row: 8, facing: 3, config: {} },
    { id: 'j-gate', kind: 'temporalGate', col: 7, row: 5, facing: 0, config: { allows: 'echoes' } },
    { id: 'k-plat', kind: 'movingPlatform', col: 5, row: 4, config: { path: [{ col: 5, row: 4 }, { col: 5, row: 6 }] } },
    { id: 'l-exit', kind: 'exitPortal', col: 11, row: 6, config: {} },
    { id: 'm-crate2', kind: 'crate', col: 10, row: 4, config: {} },
  ],
  wires: [
    { from: 'a-plate', to: 'b-door' },
    { from: 'i-recv', to: 'l-exit' },
    { from: 'f-socket', to: 'j-gate' },
  ],
  playerSpawn: { col: 6, row: 7 },
  exitId: 'l-exit',
  maxEchoes: 3,
  loopDurationTicks: 3600,
  parTimeSeconds: 30,
  hints: [],
  solution: [],
  decor: [
    { type: 'observationWindow', col: 3, row: 0, facing: 2 },
    { type: 'observationWindow', col: 10, row: 0, facing: 2 },
    { type: 'conduit', col: 0, row: 5, facing: 1 },
    { type: 'ring', col: 7, row: 9, params: { scale: 1.6 } },
  ],
  camera: { zoom: 1.05 },
};

function actor(id: string, kind: 'player' | 'echo', echoIndex: number, x: number, z: number, heading: number, moving: boolean, carrying: string | null, y = 0): ActorState {
  return {
    id: id as ActorState['id'],
    kind,
    echoIndex,
    loopId: kind === 'echo' ? echoIndex + 1 : null,
    x: Math.round(x),
    y,
    z: Math.round(z),
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 1,
    heading: (((heading % 8) + 8) % 8) as ActorState['heading'],
    moving,
    carrying,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
  };
}

function showcaseState(tick: number): SimState {
  const c = (col: number) => col * 1000 + 500;
  const ent = (id: string, kind: AnySimEntity['kind'], col: number, row: number, state: unknown, y = 0, carriedBy: string | null = null): AnySimEntity =>
    ({ id, kind, x: c(col), y, z: c(row), carriedBy, state }) as AnySimEntity;
  const phase = (period: number) => (tick % period) / period;
  const pressed = phase(240) < 0.6;
  const doorP = Math.round(Math.max(0, Math.min(1, Math.sin(phase(240) * Math.PI * 2) * 1.4 + 0.4)) * 1000);
  const elevY = Math.round((0.5 - 0.5 * Math.cos(phase(360) * Math.PI * 2)) * 1000);
  const platT = 0.5 - 0.5 * Math.cos(phase(300) * Math.PI * 2);
  const platZ = c(4) + Math.round(platT * 2000);
  const platDz = Math.round(Math.sin(phase(300) * Math.PI * 2) * 20);
  // player walks a loop, echo 2 carries a crate along a line
  const a = phase(420) * Math.PI * 2;
  const px = c(6) + Math.cos(a) * 1300;
  const pz = c(7) + Math.sin(a) * 700;
  const ph = Math.round(((Math.atan2(Math.cos(a), -Math.sin(a) * 0.54) / (Math.PI * 2)) * 8 + 8) % 8);
  const e2t = 0.5 - 0.5 * Math.cos(phase(360) * Math.PI * 2);
  const e2x = c(8) + e2t * 2400;
  const e2h = Math.sin(phase(360) * Math.PI * 2) >= 0 ? 2 : 6;
  const actors = [
    actor('echo:1', 'echo', 0, c(2), c(1) + 100, 4, false, null),
    actor('echo:2', 'echo', 1, e2x, c(7) + 200, e2h, true, 'm-crate2'),
    actor('player', 'player', -1, px, pz, ph, true, null),
  ];
  actors[0]!.interactHeld = false;
  const entities: Record<string, AnySimEntity> = {
    'a-plate': ent('a-plate', 'pressurePlate', 2, 1, { pressed, occupants: pressed ? 1 : 0, pressedTicks: 0 }),
    'b-door': ent('b-door', 'door', 6, 0, { open: doorP > 500, progress: doorP, blocked: false }),
    'c-switch': ent('c-switch', 'timedSwitch', 9, 1, { on: true, remainingTicks: 240 - (tick % 240), activatedBy: 'player' }),
    'd-crate': ent('d-crate', 'crate', 3, 3, { restTicks: 100 }),
    'e-cell': ent('e-cell', 'energyCell', 7, 3, { socketId: null }),
    'f-socket': ent('f-socket', 'energySocket', 9, 3, { cellId: 'f-cell2', powered: true }),
    'f-cell2': ent('f-cell2', 'energyCell', 9, 3, { socketId: 'f-socket' }),
    'g-elev': ent('g-elev', 'elevator', 4, 4, { y: elevY, targetIndex: 1, moving: true, dy: 0, ...(forceHeld ? { held: true, moving: false } : {}) }, elevY),
    'h-laser': ent('h-laser', 'laserEmitter', 1, 8, { on: true, beamLength: 7000, hitEntityId: 'i-recv', hitActorId: null }),
    'i-recv': ent('i-recv', 'laserReceiver', 8, 8, { lit: true, litBy: 'h-laser', litTicks: 100 }),
    'j-gate': ent('j-gate', 'temporalGate', 7, 5, { open: true, phaseTicks: tick, ...(forceHeld ? { held: true } : {}) }),
    'k-plat': { ...ent('k-plat', 'movingPlatform', 5, 4, { targetIndex: 1, direction: 1, waitTicks: 0, dx: 0, dz: platDz }), z: platZ },
    'l-exit': ent('l-exit', 'exitPortal', 11, 6, { active: true, activeTicks: tick }, 1000),
    'm-crate2': { ...ent('m-crate2', 'crate', 10, 4, { restTicks: 0 }, 500, 'echo:2'), x: Math.round(e2x), z: c(7) + 200 },
  };
  return {
    tick,
    status: 'playing',
    completedAtTick: null,
    rng: 1,
    actors,
    entities,
    signals: { 'a-plate': pressed, 'i-recv': true, 'f-socket': true },
  };
}

function showcaseDriver(): Driver {
  let tick = 0;
  let cur = showcaseState(0);
  let prev = cur;
  return {
    level: SHOWCASE,
    step() {
      tick++;
      prev = cur;
      cur = showcaseState(tick);
      return tick === 60 ? [{ type: 'echoSpawned', tick, actorId: 'echo:1', loopId: 1, echoIndex: 0 }] : [];
    },
    state: () => cur,
    prev: () => prev,
  };
}

// ---------------------------------------------------------------- main loop

const driver = scene === 'showcase' ? showcaseDriver() : scene === 'level' ? levelDriver(params.get('id') ?? '1') : chamberDriver();
renderer.setLevel(driver.level, driver.state());
if (params.has('camera')) renderer.setCameraMode(cameraMode);

if (targetTick !== null) {
  // deterministic screenshot mode
  const settle = Math.max(1, settleFrames);
  while (driver.state().tick < Math.max(0, targetTick - settle)) driver.step();
  let frames = 0;
  const frame = () => {
    const events = driver.state().tick < targetTick ? driver.step() : [];
    renderer.render(driver.state(), driver.prev(), 1, events, 1 / 60);
    frames++;
    if (frames < settle + 2) requestAnimationFrame(frame);
    else preview.ready = true;
  };
  requestAnimationFrame(frame);
} else {
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const events: SimEvent[] = [];
    let n = 0;
    while (acc >= 1 / 60 && n < 5) {
      events.push(...driver.step());
      acc -= 1 / 60;
      n++;
    }
    if (n === 5) acc = 0;
    renderer.render(driver.state(), driver.prev(), acc * 60, events, dt);
    preview.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'o') renderer.setCameraMode(renderer.getCameraMode() === 'overview' ? 'follow' : 'overview');
  if (e.key === 'i') renderer.playIntro();
  if (e.key === '1') renderer.setQuality('low');
  if (e.key === '2') renderer.setQuality('medium');
  if (e.key === '3') renderer.setQuality('high');
});
