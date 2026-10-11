import { bootstrap } from './app/bootstrap';
import { loadSolutions } from './app/lazySolutions';
import { registerServiceWorker } from './app/serviceWorker';

const appRoot = document.getElementById('app');
const uiRoot = document.getElementById('ui');
if (!appRoot || !uiRoot) throw new Error('index.html must contain #app and #ui');
// Studio ident started in index.html; boot once it ends or is skipped. The attract replay's solution chunk loads
// while the ident plays, so the menu's first frame already has its echoes: adding them after first paint costs a
// second shader-compile stall. A failed fetch (offline) just boots without it; the attract retries later.
const studioIntro = (window as Window & { __studioIntro?: Promise<void> }).__studioIntro;
void Promise.all([studioIntro ?? Promise.resolve(), loadSolutions().catch(() => undefined)]).then(() =>
  bootstrap(appRoot, uiRoot),
);
// Offline home-screen play (production, https/localhost, never under automation). See src/app/serviceWorker.ts.
registerServiceWorker();
