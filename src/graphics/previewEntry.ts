/**
 * graphics-preview.html entry: `?turntable=1` opens the character turntable (front three-quarter studio view,
 * see turntable.ts); every other query runs the renderer test bed (preview.ts). Each mode is loaded on demand so
 * neither pays for the other.
 */
const params = new URLSearchParams(location.search);

if (params.get('turntable') === '1') {
  const { startTurntable, turntableOptions } = await import('./turntable');
  const preview = { ready: false, mode: 'turntable' as const };
  (window as unknown as { __PREVIEW__: typeof preview }).__PREVIEW__ = preview;
  const tag = document.getElementById('tag');
  if (tag) tag.textContent = 'Character turntable · ?actor=player|echo · ?angle=35 · ?spin=1';
  startTurntable(document.getElementById('app')!, turntableOptions(params), preview);
} else {
  await import('./preview');
}

export {};
