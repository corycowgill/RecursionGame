/**
 * Self-hosted webfonts (Orbitron for display, Rajdhani for UI text) bundled by Vite from @fontsource — the same
 * Google Fonts families, but available offline and without a third-party request. CSS falls back to system
 * fonts (see --rx-display / --rx-body) until they load.
 */
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';

export const UI_FONTS_LOADED = true;
