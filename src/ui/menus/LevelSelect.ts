import type { LevelDefinition } from '../../engine/contracts';
import type { CampaignProgress } from '../../levels/progression';
import { arrowNav, esc, h } from '../dom';
import { icon } from '../icons';
import { formatTicks } from '../timeline/model';
import type { LevelEntry } from '../types';
import type { Screen } from './MainMenu';

/**
 * Builds level-select entries from campaign levels + saved progress. Mirrors Campaign.isUnlocked (first level
 * always unlocked; each next level unlocks once the previous one is completed).
 */
export function buildLevelEntries(levels: readonly LevelDefinition[], progress: CampaignProgress): LevelEntry[] {
  let nextMarked = false;
  return levels.map((l, i) => {
    const rec = progress.records[l.id];
    const prev = levels[i - 1];
    const unlocked = i === 0 || (prev !== undefined && (progress.records[prev.id]?.completions ?? 0) > 0);
    const completed = (rec?.completions ?? 0) > 0;
    const status = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';
    const isNext = !nextMarked && status === 'unlocked';
    if (isNext) nextMarked = true;
    const entry: LevelEntry = {
      id: l.id,
      order: l.order,
      name: l.name,
      status,
      isNext,
      maxEchoes: l.maxEchoes,
      parTimeSeconds: l.parTimeSeconds,
      best: rec ? { ticks: rec.bestTicks, echoes: rec.bestEchoes, stars: rec.bestStars } : null,
    };
    if (l.subtitle) entry.subtitle = l.subtitle;
    return entry;
  });
}

export interface LevelSelectActions {
  onPick(id: string): void;
  onBack(): void;
  /** Round 5: replay the ending / open the credits. Shown once the final chamber has been completed. */
  onEnding?(): void;
  onCredits?(): void;
  sound(c: 'hover' | 'confirm' | 'error' | 'back'): void;
}

export function createLevelSelect(entries: LevelEntry[], act: LevelSelectActions): Screen {
  const grid = h('div', { class: 'rx-levels', role: 'list' });
  for (const e of entries) {
    const locked = e.status === 'locked';
    const card = h('button', {
      class: `rx-level ${e.status}${e.isNext ? ' next' : ''}`,
      type: 'button',
      role: 'listitem',
      'aria-disabled': locked ? 'true' : null,
      'data-level': e.id,
      autofocus: e.isNext || null,
      'aria-label': `Chamber ${e.order}: ${e.name}. ${locked ? 'Locked. Complete the previous chamber to unlock.' : e.status === 'completed' ? `Completed. Best time ${formatTicks(e.best?.ticks ?? 0)}, ${e.best?.echoes ?? 0} echoes, ${e.best?.stars ?? 0} of 3 stars.` : 'Unlocked.'}`,
    });
    const status = locked
      ? `${icon('lock')}<span>Locked</span>`
      : e.status === 'completed'
        ? `${icon('check')}<span>Restored</span>`
        : `${icon('play')}<span>${e.isNext ? 'Next' : 'Open'}</span>`;
    const stars = [1, 2, 3].map((s) => icon('star', `rx-ico${(e.best?.stars ?? 0) >= s ? ' on' : ''}`)).join('');
    card.innerHTML =
      `<span class="st">${status}</span>` +
      `<span class="no">${String(e.order).padStart(2, '0')}</span>` +
      `<span class="nm">${esc(e.name)}</span>` +
      `<span class="best">` +
      (e.best
        ? `<span>Best time</span><b>${formatTicks(e.best.ticks)}</b><span>Echoes</span><b>${e.best.echoes} / ${e.maxEchoes}</b>`
        : `<span>Par</span><b>${locked ? '—' : formatTicks(e.parTimeSeconds * 60)}</b><span>Echo limit</span><b>${locked ? '—' : e.maxEchoes}</b>`) +
      `</span>` +
      `<span class="stars" aria-hidden="true">${stars}</span>`;
    card.addEventListener('click', () => {
      if (locked) {
        act.sound('error');
        return;
      }
      act.sound('confirm');
      act.onPick(e.id);
    });
    card.addEventListener('pointerenter', () => !locked && act.sound('hover'));
    grid.append(card);
  }
  const back = h('button', { class: 'rx-btn small', type: 'button', 'data-testid': 'back', html: `${icon('back')}<span>Back</span>` });
  back.addEventListener('click', () => {
    act.sound('back');
    act.onBack();
  });
  const done = entries.filter((e) => e.status === 'completed').length;
  // Round 5: after the campaign is finished (the last chamber completed), the ending and credits can be replayed.
  const finished = entries.length > 0 && entries[entries.length - 1]?.status === 'completed';
  const extra = (label: string, ic: Parameters<typeof icon>[0], testid: string, fn: () => void): HTMLButtonElement => {
    const b = h('button', { class: 'rx-btn small', type: 'button', 'data-testid': testid, html: `${icon(ic)}<span>${esc(label)}</span>` });
    b.addEventListener('click', () => {
      act.sound('confirm');
      fn();
    });
    return b;
  };
  const headBtns = h('div', { style: 'display:flex;gap:.6em;flex-wrap:wrap;justify-content:flex-end' });
  if (finished && act.onEnding) headBtns.append(extra('Ending', 'play', 'levels-ending', act.onEnding));
  if (finished && act.onCredits) headBtns.append(extra('Credits', 'star', 'levels-credits', act.onCredits));
  headBtns.append(back);
  const headRight = headBtns.childElementCount > 1 ? headBtns : back; // unchanged layout until the campaign is finished
  const panel = h(
    'section',
    { class: 'rx-panel rx-dialog', style: 'width:min(1080px,100%)' },
    h('div', { class: 'rx-hair' }),
    h(
      'div',
      { class: 'rx-dialog-head' },
      h('div', {}, h('div', { class: 'rx-eyebrow' }, `Chambers · ${done} / ${entries.length} restored`), h('h2', {}, 'Level select')),
      headRight,
    ),
    grid,
  );
  const el = h('div', { class: 'rx-screen rx-backdrop rx-center', role: 'dialog', 'aria-label': 'Level select', 'data-testid': 'level-select' }, panel);
  const off = arrowNav(grid, '.rx-level', 5);
  return { el, dispose: off };
}
