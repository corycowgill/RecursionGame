import { bootstrap } from './app/bootstrap';
import { registerServiceWorker } from './app/serviceWorker';

const appRoot = document.getElementById('app');
const uiRoot = document.getElementById('ui');
if (!appRoot || !uiRoot) throw new Error('index.html must contain #app and #ui');
// Studio ident started in index.html; boot once it ends or is skipped.
const studioIntro = (window as Window & { __studioIntro?: Promise<void> }).__studioIntro;
void (studioIntro ?? Promise.resolve()).then(() => bootstrap(appRoot, uiRoot));
// Offline home-screen play (production, https/localhost, never under automation). See src/app/serviceWorker.ts.
registerServiceWorker();
