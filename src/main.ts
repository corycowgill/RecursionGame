import { bootstrap } from './app/bootstrap';

const appRoot = document.getElementById('app');
const uiRoot = document.getElementById('ui');
if (!appRoot || !uiRoot) throw new Error('index.html must contain #app and #ui');
bootstrap(appRoot, uiRoot);
