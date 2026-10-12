import {
  CHRONO_RELAY_MAX_DELAY,
  CHRONO_RELAY_MIN_DELAY,
  DIR4_DX,
  DIR4_DZ,
  TILE_LEGEND,
  type Dir4,
  type EntityDefinition,
  type LevelDefinition,
} from '../../engine/contracts';

/**
 * ROUND-6 MECHANIC AUTHORING RULES (Chrono Relay, Check Valve, Attuned Devices / Paradox Glass). Called by
 * validateLevel; kept in its own file so the expansion rules are easy to find and review. See the behaviour docs in
 * src/gameplay/entities/{chronoRelay,checkValve,pressurePlate,timedSwitch}.ts and docs/architecture/contracts.md.
 */
export function validateMechanics(level: LevelDefinition, err: (m: string) => void, warn: (m: string) => void): void {
  const byId = new Map(level.entities.map((e) => [e.id, e] as const));
  const inputsOf = (id: string) => level.wires.filter((w) => w.to === id);
  const outputsOf = (id: string) => level.wires.filter((w) => w.from === id);
  const ch = (c: number, r: number): string => level.grid.tiles[r]?.[c] ?? ' ';
  const tileKind = (c: number, r: number) => TILE_LEGEND[ch(c, r)]?.kind ?? 'void';
  const h = (c: number, r: number): number => {
    const d = level.grid.heights?.[r]?.[c];
    return d && d >= '0' && d <= '9' ? d.charCodeAt(0) - 48 : 0;
  };
  const solidTile = (c: number, r: number) => {
    const k = tileKind(c, r);
    return k === 'wall' || k === 'pillar' || k === 'railing';
  };

  // Cells that move or carry: lifts and deck lanes (a valve cell must be none of them).
  const dynamicCells = new Set<string>();
  for (const e of level.entities) {
    if (e.kind === 'elevator') dynamicCells.add(`${e.col},${e.row}`);
    if (e.kind === 'movingPlatform') {
      const p = e.config.path;
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i]!;
        const b = p[i + 1]!;
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
          for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) dynamicCells.add(`${c},${r}`);
      }
      dynamicCells.add(`${e.col},${e.row}`);
    }
  }

  for (const e of level.entities) {
    switch (e.kind) {
      case 'chronoRelay':
        checkRelay(e);
        break;
      case 'checkValve':
        checkValve(e);
        break;
      case 'pressurePlate':
      case 'timedSwitch':
        checkAttuned(e);
        break;
      default: {
        const cfg = e.config as Record<string, unknown>;
        if ('accepts' in cfg) err(`'${e.id}': 'accepts' is only valid on pressure plates and timed switches`);
        if ('shatterOn' in cfg) err(`'${e.id}': 'shatterOn' is only valid on pressure plates and timed switches`);
        break;
      }
    }
  }

  function checkRelay(e: Extract<EntityDefinition, { kind: 'chronoRelay' }>): void {
    const d = e.config.delayTicks;
    if (!Number.isInteger(d) || d < CHRONO_RELAY_MIN_DELAY || d > CHRONO_RELAY_MAX_DELAY)
      err(`relay '${e.id}' delayTicks must be an integer in [${CHRONO_RELAY_MIN_DELAY}, ${CHRONO_RELAY_MAX_DELAY}] (got ${String(d)})`);
    if (inputsOf(e.id).length === 0) err(`relay '${e.id}' has no input wire`);
    if (Number.isFinite(d) && d >= level.loopDurationTicks - 120)
      warn(`relay '${e.id}' delay (${d} ticks) leaves less than 2 s of the loop for the delayed signal to matter`);
    // Feedback: the relay's output reaches its own input directly or through doors / gates (stateless pass-throughs).
    const seen = new Set<string>();
    const stack = outputsOf(e.id).map((w) => w.to);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === e.id) {
        err(`relay '${e.id}' is wired (directly or via doors/gates) back into its own input`);
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const k = byId.get(id)?.kind;
      if (k === 'door' || k === 'temporalGate') for (const w of outputsOf(id)) stack.push(w.to);
    }
  }

  function checkValve(e: Extract<EntityDefinition, { kind: 'checkValve' }>): void {
    const { col, row } = e;
    const f = (e.facing ?? 0) as Dir4;
    if (e.facing === undefined) warn(`valve '${e.id}' has no facing (allowed direction defaults to north)`);
    if (tileKind(col, row) !== 'floor') err(`valve '${e.id}' must sit on a flat floor cell (got '${ch(col, row)}')`);
    if (dynamicCells.has(`${col},${row}`)) err(`valve '${e.id}' cell is a lift or deck lane cell`);
    const others = level.entities.filter((o) => o.id !== e.id && o.col === col && o.row === row);
    if (others.length > 0) err(`valve '${e.id}' shares its cell with '${others.map((o) => o.id).join("', '")}'`);
    const dx = DIR4_DX[f] ?? 0;
    const dz = DIR4_DZ[f] ?? 0;
    for (const s of [-1, 1]) {
      const c = col + s * dz;
      const r = row + s * dx;
      if (!solidTile(c, r)) err(`valve '${e.id}' lateral neighbour (${c},${r}) must be a wall, pillar or railing (no side entry)`);
    }
    for (const s of [-1, 1]) {
      const c = col + s * dx;
      const r = row + s * dz;
      const k = tileKind(c, r);
      const name = s < 0 ? 'upstream' : 'downstream';
      if (k !== 'floor' && k !== 'ramp') err(`valve '${e.id}' ${name} neighbour (${c},${r}) must be walkable`);
      else if (k === 'floor' && h(c, r) !== h(col, row)) err(`valve '${e.id}' ${name} neighbour (${c},${r}) is at a different height`);
      if (dynamicCells.has(`${c},${r}`)) err(`valve '${e.id}' ${name} neighbour (${c},${r}) is a lift or deck lane cell`);
    }
    const ins = inputsOf(e.id).length;
    if (e.config.reverseWhenPowered === true && ins === 0) err(`valve '${e.id}' reverseWhenPowered needs at least one input wire`);
    if (e.config.reverseWhenPowered !== true && ins > 0) warn(`valve '${e.id}' has inputs but no reverseWhenPowered (they do nothing)`);
    if (outputsOf(e.id).length > 0) err(`valve '${e.id}' has no output: wires from a valve are not allowed`);
  }

  function checkAttuned(e: Extract<EntityDefinition, { kind: 'pressurePlate' | 'timedSwitch' }>): void {
    const accepts = e.config.accepts;
    const shatterOn = e.config.shatterOn;
    const okClass = (v: unknown, all: boolean) => v === undefined || v === 'echoes' || v === 'player' || (all && v === 'all');
    if (!okClass(accepts, true)) err(`'${e.id}' accepts must be 'all', 'echoes' or 'player'`);
    if (!okClass(shatterOn, false)) err(`'${e.id}' shatterOn must be 'echoes' or 'player'`);
    if (shatterOn !== undefined && shatterOn === accepts) err(`'${e.id}' shatterOn equals accepts: the device would break on its only users`);
    if (accepts === 'echoes' && level.maxEchoes === 0) err(`'${e.id}' accepts only echoes but the level allows no echoes`);
    if (e.kind === 'pressurePlate') {
      if (accepts === 'player' && (e.config.threshold ?? 1) > 1) err(`plate '${e.id}' accepts only the player but needs threshold > 1 (there is one player)`);
      if (accepts !== undefined && accepts !== 'all' && e.config.acceptsCrates === true)
        warn(`plate '${e.id}' is attuned (accepts '${accepts}'): acceptsCrates is ignored, crates never count`);
    }
  }
}
