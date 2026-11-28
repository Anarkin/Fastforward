import { parentPort } from 'node:worker_threads';
import { answerTo, type PatternAsk } from '../lib/main/patternSearch';

if (parentPort !== null) {
  const port = parentPort;
  port.on('message', (ask: PatternAsk) => port.postMessage(answerTo(ask)));
}
