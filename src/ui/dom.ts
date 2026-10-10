/** Tiny DOM helpers (no framework). */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Element from an SVG/HTML markup string (first element). */
export function fromHTML(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * Arrow-key focus navigation inside a container (menus): Up/Down (and Left/Right when `horizontal`) move focus
 * among enabled buttons; Home/End jump. Returns a disposer.
 */
export function arrowNav(container: HTMLElement, selector = 'button:not([disabled]), [role="menuitem"]:not([aria-disabled="true"])', grid = 0): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.closest('[hidden]'));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    const cols = grid > 0 ? grid : 1;
    switch (e.key) {
      case 'ArrowDown':
        next = i < 0 ? 0 : Math.min(items.length - 1, i + cols);
        break;
      case 'ArrowUp':
        next = i < 0 ? 0 : Math.max(0, i - cols);
        break;
      case 'ArrowRight':
        if (grid > 0) next = i < 0 ? 0 : Math.min(items.length - 1, i + 1);
        break;
      case 'ArrowLeft':
        if (grid > 0) next = i < 0 ? 0 : Math.max(0, i - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    if (next >= 0) {
      e.preventDefault();
      e.stopPropagation();
      items[next]?.focus();
    }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

export function focusFirst(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>('[autofocus], button:not([disabled]), [tabindex="0"]');
  el?.focus({ preventScroll: true });
}
