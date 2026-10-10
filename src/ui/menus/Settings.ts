import {
  ACTION_GROUPS,
  ACTION_LABELS,
  assignBinding,
  bindingFromEvent,
  bindingLabel,
  clearBinding,
  defaultKeybinds,
  MAX_BINDINGS_PER_ACTION,
  type BindableAction,
  type KeyBindings,
} from '../../persistence/keybinds';
import { QUALITY_PRESETS, SETTINGS_LIMITS, type Settings } from '../../persistence/settings';
import { esc, h } from '../dom';
import { icon, shapeBadge } from '../icons';
import { echoStyle, playerStyle } from '../palette';
import type { Screen } from './MainMenu';

export interface SettingsActions {
  onChange(s: Settings): void;
  onKeybinds(b: KeyBindings): void;
  onBack(): void;
  onResetProgress?: () => void;
  sound(c: 'hover' | 'confirm' | 'back' | 'toggle' | 'error'): void;
}

type Tab = 'graphics' | 'audio' | 'access' | 'controls';
const TABS: { id: Tab; label: string }[] = [
  { id: 'graphics', label: 'Display' },
  { id: 'audio', label: 'Audio' },
  { id: 'access', label: 'Accessibility' },
  { id: 'controls', label: 'Controls' },
];

let uid = 0;

/** Settings: display, audio, accessibility, controls (key remapping). Every change is emitted immediately. */
export function createSettings(initial: Settings, initialBinds: KeyBindings, act: SettingsActions, startTab: Tab = 'graphics'): Screen & { setTab(t: Tab): void } {
  let s: Settings = { ...initial };
  let binds: KeyBindings = initialBinds;
  let tab: Tab = startTab;
  let capture: { action: BindableAction; slot: number } | null = null;
  let notice = '';
  const id = ++uid;

  const emit = (patch: Partial<Settings>): void => {
    s = { ...s, ...patch };
    act.onChange(s);
  };

  const field = (label: string, help: string | null, control: HTMLElement): HTMLElement =>
    h('div', { class: 'rx-field' }, h('div', { class: 'rx-field-label', html: `${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}` }), control);

  const segmented = <T extends string>(name: string, options: readonly T[], labels: Record<T, string>, value: T, onPick: (v: T) => void): HTMLElement => {
    const wrap = h('div', { class: 'rx-seg', role: 'group', 'aria-label': name });
    for (const o of options) {
      const b = h('button', { type: 'button', 'aria-pressed': String(o === value) }, labels[o]);
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        act.sound('toggle');
        onPick(o);
      });
      wrap.append(b);
    }
    return wrap;
  };

  const range = (name: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onInput: (v: number) => void): HTMLElement => {
    const inputId = `rx-r${id}-${name.replace(/\W/g, '')}`;
    const out = h('output', { for: inputId }, fmt(value));
    const input = h('input', { id: inputId, type: 'range', min, max, step, value, 'aria-label': name });
    const paint = (): void => {
      const v = Number(input.value);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      out.textContent = fmt(v);
      input.setAttribute('aria-valuetext', fmt(v));
    };
    input.addEventListener('input', () => {
      paint();
      onInput(Number(input.value));
    });
    paint();
    return h('div', { class: 'rx-range' }, input, out);
  };

  const toggle = (name: string, value: boolean, onToggle: (v: boolean) => void): HTMLElement => {
    const lbl = h('span', {}, value ? 'On' : 'Off');
    const sw = h('button', { class: 'rx-switch', type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': name });
    sw.addEventListener('click', () => {
      const v = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(v));
      lbl.textContent = v ? 'On' : 'Off';
      act.sound('toggle');
      onToggle(v);
    });
    return h('div', { class: 'rx-switch-wrap' }, sw, lbl);
  };

  const pct = (v: number): string => `${Math.round(v)}%`;
  const mult = (v: number): string => `×${v.toFixed(2)}`;

  const body = h('div', { role: 'tabpanel' });
  const tabBtns = new Map<Tab, HTMLButtonElement>();
  const tabs = h('div', { class: 'rx-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
  for (const t of TABS) {
    const b = h('button', { class: 'rx-tab', type: 'button', role: 'tab', id: `rx-tab${id}-${t.id}`, 'aria-selected': String(t.id === tab), tabindex: t.id === tab ? 0 : -1, autofocus: t.id === tab || null }, t.label);
    b.addEventListener('click', () => {
      setTab(t.id);
      b.focus();
    });
    b.addEventListener('keydown', (e) => {
      const i = TABS.findIndex((x) => x.id === tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length] as (typeof TABS)[number];
        setTab(next.id);
        tabBtns.get(next.id)?.focus();
      }
    });
    tabBtns.set(t.id, b);
    tabs.append(b);
  }

  function renderBinds(): HTMLElement {
    const grid = h('div', { class: 'rx-binds' });
    for (const g of ACTION_GROUPS) {
      grid.append(h('h4', {}, g.title));
      for (const a of g.actions) {
        grid.append(h('div', { class: 'rx-field-label' }, ACTION_LABELS[a]));
        for (let slot = 0; slot < MAX_BINDINGS_PER_ACTION; slot++) {
          const b = binds[a][slot];
          const capturing = capture?.action === a && capture.slot === slot;
          const btn = h(
            'button',
            {
              class: `rx-bind${b ? '' : ' empty'}${capturing ? ' capturing' : ''}`,
              type: 'button',
              'data-action': a,
              'data-slot': slot,
              'aria-label': `${ACTION_LABELS[a]}, ${slot === 0 ? 'primary' : 'alternate'} key: ${b ? bindingLabel(b) : 'unbound'}. Press Enter to rebind, Delete to clear.`,
            },
            capturing ? 'Press a key…' : b ? bindingLabel(b) : 'Unbound',
          );
          btn.addEventListener('click', () => {
            capture = { action: a, slot };
            notice = '';
            act.sound('confirm');
            render();
            (body.querySelector(`.rx-bind[data-action="${a}"][data-slot="${slot}"]`) as HTMLElement | null)?.focus();
          });
          btn.addEventListener('keydown', (e) => {
            if (!capture && (e.key === 'Delete' || e.key === 'Backspace') && binds[a][slot]) {
              e.preventDefault();
              binds = clearBinding(binds, a, slot);
              act.onKeybinds(binds);
              render();
              (body.querySelector(`.rx-bind[data-action="${a}"][data-slot="${slot}"]`) as HTMLElement | null)?.focus();
            }
          });
          grid.append(btn);
        }
      }
    }
    return grid;
  }

  function render(): void {
    body.setAttribute('aria-labelledby', `rx-tab${id}-${tab}`);
    body.replaceChildren();
    if (tab === 'graphics') {
      body.append(
        field(
          'Quality preset',
          'Shadows, bloom, particles and resolution scale',
          segmented('Quality preset', QUALITY_PRESETS, { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' }, s.quality, (v) => emit({ quality: v })),
        ),
        field(
          'Interface scale',
          'Size of all menus and HUD elements',
          range('Interface scale', s.uiScale, SETTINGS_LIMITS.uiScale.min, SETTINGS_LIMITS.uiScale.max, SETTINGS_LIMITS.uiScale.step, mult, (v) => emit({ uiScale: v })),
        ),
      );
    } else if (tab === 'audio') {
      const v = SETTINGS_LIMITS.volume;
      body.append(
        field('Master volume', null, range('Master volume', s.masterVolume, v.min, v.max, v.step, pct, (x) => emit({ masterVolume: x }))),
        field('Music', 'Exploration, solving and completion score', range('Music volume', s.musicVolume, v.min, v.max, v.step, pct, (x) => emit({ musicVolume: x }))),
        field('Effects', 'Machinery, echoes, interface', range('Effects volume', s.sfxVolume, v.min, v.max, v.step, pct, (x) => emit({ sfxVolume: x }))),
      );
    } else if (tab === 'access') {
      const preview = (pal: Settings['echoPalette']): string => {
        const p = playerStyle(pal);
        return [shapeBadge(p.shape, p.badge, p.color, 24), ...[0, 1, 2, 3, 4].map((i) => {
          const e = echoStyle(i, pal);
          return shapeBadge(e.shape, e.badge, e.color, 24);
        })].join('');
      };
      const pv = h('div', { class: 'rx-palette-preview', 'aria-hidden': 'true', html: preview(s.echoPalette) });
      const seg = segmented('Echo colours', ['default', 'highContrast'] as const, { default: 'Standard', highContrast: 'High contrast' }, s.echoPalette, (x) => {
        pv.innerHTML = preview(x);
        emit({ echoPalette: x });
      });
      body.append(
        field('Reduced motion', 'Disables UI animation, camera shake and screen pulses', toggle('Reduced motion', s.reducedMotion, (x) => emit({ reducedMotion: x }))),
        field('Echo colours', 'Colour-blind-friendly palette. Echoes always carry a shape and a number too.', h('div', {}, seg, pv)),
        field('Tutorial prompts', 'Contextual training in the first chambers', toggle('Tutorial prompts', s.tutorials, (x) => emit({ tutorials: x }))),
        field('Progressive hints', 'Hints appear after time spent or repeated attempts', toggle('Progressive hints', s.hints, (x) => emit({ hints: x }))),
      );
    } else {
      body.append(
        field(
          'Camera sensitivity',
          'Orbit and zoom speed',
          range('Camera sensitivity', s.cameraSensitivity, SETTINGS_LIMITS.cameraSensitivity.min, SETTINGS_LIMITS.cameraSensitivity.max, SETTINGS_LIMITS.cameraSensitivity.step, mult, (x) => emit({ cameraSensitivity: x })),
        ),
        h('div', { style: 'height:.8em' }),
        renderBinds(),
      );
      const reset = h('button', { class: 'rx-btn small', type: 'button', html: `${icon('restart')}<span>Restore default keys</span>` });
      reset.addEventListener('click', () => {
        binds = defaultKeybinds();
        capture = null;
        notice = 'Default keys restored';
        act.onKeybinds(binds);
        act.sound('confirm');
        render();
      });
      body.append(h('div', { class: 'rx-dialog-foot', style: 'justify-content:space-between;align-items:center' }, h('span', { class: 'rx-muted', role: 'status', 'aria-live': 'polite' }, notice), reset));
    }
  }

  function setTab(t: Tab): void {
    tab = t;
    capture = null;
    for (const [k, b] of tabBtns) {
      b.setAttribute('aria-selected', String(k === t));
      b.tabIndex = k === t ? 0 : -1;
    }
    act.sound('toggle');
    render();
  }

  // Key capture runs in the capture phase on window so gameplay/global handlers never see the key.
  const onKey = (e: KeyboardEvent): void => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = capture;
    if (e.code === 'Escape') {
      capture = null;
      notice = 'Rebinding cancelled';
      render();
      (body.querySelector(`.rx-bind[data-action="${c.action}"][data-slot="${c.slot}"]`) as HTMLElement | null)?.focus();
      return;
    }
    const b = bindingFromEvent(e.code, e.shiftKey);
    if (!b) return; // lone modifier: keep waiting
    const res = assignBinding(binds, c.action, c.slot, b);
    binds = res.binds;
    capture = null;
    notice = res.displaced ? `${bindingLabel(b)} moved from “${ACTION_LABELS[res.displaced]}”` : `${ACTION_LABELS[c.action]}: ${bindingLabel(b)}`;
    act.onKeybinds(binds);
    act.sound(res.displaced ? 'error' : 'confirm');
    render();
    (body.querySelector(`.rx-bind[data-action="${c.action}"][data-slot="${c.slot}"]`) as HTMLElement | null)?.focus();
  };
  window.addEventListener('keydown', onKey, true);

  const back = h('button', { class: 'rx-btn small', type: 'button', 'data-testid': 'back', html: `${icon('back')}<span>Back</span>` });
  back.addEventListener('click', () => {
    act.sound('back');
    act.onBack();
  });
  const foot = h('div', { class: 'rx-dialog-foot', style: 'justify-content:space-between' });
  if (act.onResetProgress) {
    let armed = false;
    const rp = h('button', { class: 'rx-btn small ghost', type: 'button', html: `${icon('warning')}<span>Reset progress</span>` });
    rp.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        rp.innerHTML = `${icon('warning')}<span>Confirm: erase all progress?</span>`;
        rp.style.color = 'var(--rx-coral)';
        act.sound('error');
        return;
      }
      armed = false;
      rp.innerHTML = `${icon('check')}<span>Progress erased</span>`;
      rp.style.color = '';
      act.onResetProgress?.();
    });
    foot.append(rp);
  } else foot.append(h('span', {}));
  foot.append(back);

  render();
  const panel = h(
    'section',
    { class: 'rx-panel rx-dialog' },
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'rx-dialog-head' }, h('div', {}, h('div', { class: 'rx-eyebrow' }, 'System configuration'), h('h2', {}, 'Settings'))),
    tabs,
    body,
    foot,
  );
  const el = h('div', { class: 'rx-screen rx-backdrop rx-center', role: 'dialog', 'aria-label': 'Settings', 'data-testid': 'settings' }, panel);
  return {
    el,
    setTab,
    dispose() {
      window.removeEventListener('keydown', onKey, true);
    },
  };
}
