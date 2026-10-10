import { ForecastEngine, type ForecastRequest } from './forecastEngine';

/**
 * Echo-forecast worker: reproduces the live pass in a private TemporalGame and streams future samples back in
 * chunks (see forecastEngine.ts). A new request supersedes the running one; work is sliced so messages get through.
 */
const engine = new ForecastEngine();
let scheduled = false;

const run = (): void => {
  scheduled = false;
  const chunk = engine.pump(12, () => performance.now());
  if (chunk && (chunk.samples.length || chunk.done)) postMessage(chunk);
  if (engine.busy) schedule();
};
const schedule = (): void => {
  if (scheduled) return;
  scheduled = true;
  setTimeout(run, 0);
};

self.onmessage = (e: MessageEvent<ForecastRequest | { cancel: true }>) => {
  const msg = e.data;
  if ('cancel' in msg) engine.cancel();
  else engine.start(msg);
  schedule();
};
