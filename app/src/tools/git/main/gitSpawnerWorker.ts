import { parentPort, workerData } from 'node:worker_threads';
import { serveGitSpawns } from './gitSpawner';
import { processHolderAt } from './processHold';

if (parentPort !== null) {
  const koffi: unknown = Reflect.get(Object(workerData), 'koffi');
  serveGitSpawns(
    parentPort,
    processHolderAt(typeof koffi === 'string' ? koffi : undefined),
  );
}
