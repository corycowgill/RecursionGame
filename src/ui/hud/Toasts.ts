import { h } from '../dom';
import { icon, type IconName } from '../icons';

export type ToastKind = 'info' | 'success' | 'warn' | 'gold';

const KIND_ICON: Record<ToastKind, IconName> = { info: 'echo', success: 'check', warn: 'warning', gold: 'star' };

/** Transient notifications (top centre). Same-text toasts are coalesced; at most 4 visible. */
export class Toasts {
  readonly el = h('div', { class: 'rx-toasts', role: 'status', 'aria-live': 'polite', 'data-testid': 'toasts' });
  private readonly active = new Map<string, { el: HTMLElement; timer: ReturnType<typeof setTimeout> }>();

  show(text: string, kind: ToastKind = 'info', ms = 2600, iconName?: IconName): void {
    const key = `${kind}|${text}`;
    const prev = this.active.get(key);
    if (prev) {
      clearTimeout(prev.timer);
      prev.timer = setTimeout(() => this.dismiss(key), ms);
      return;
    }
    const el = h('div', { class: `rx-panel rx-toast ${kind}`, html: icon(iconName ?? KIND_ICON[kind]) });
    el.append(h('span', {}, text));
    this.el.append(el);
    const timer = setTimeout(() => this.dismiss(key), ms);
    this.active.set(key, { el, timer });
    while (this.active.size > 4) {
      const first = this.active.keys().next().value as string;
      this.dismiss(first, true);
    }
  }

  private dismiss(key: string, immediate = false): void {
    const t = this.active.get(key);
    if (!t) return;
    this.active.delete(key);
    clearTimeout(t.timer);
    if (immediate) {
      t.el.remove();
      return;
    }
    t.el.classList.add('out');
    setTimeout(() => t.el.remove(), 420);
  }

  clear(): void {
    for (const k of [...this.active.keys()]) this.dismiss(k, true);
  }
}
