import { parentPort } from 'node:worker_threads';
import { hashOf } from './contentHash';
import type { HashAnswer, HashTask } from './hashWorkers';

if (parentPort !== null) {
  const port = parentPort;
  port.on('message', ({ file, bytes }: HashTask) => {
    let answer: HashAnswer;
    try {
      answer = { hashed: hashOf(file, bytes) };
    } catch {
      answer = { failed: true };
    }
    port.postMessage(answer);
  });
}
