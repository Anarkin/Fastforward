import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import type { load } from 'koffi';
import { walkFolders, type SizeWalk } from './folderSizes';
import {
  nodeSizeReader,
  windowsSizeReader,
  type FolderReader,
} from './sizeReaders';

const budgetMillis = 50;

function readerFor(koffi: unknown): FolderReader {
  if (typeof koffi !== 'string') {
    return nodeSizeReader();
  }
  const loaded: { readonly load: typeof load } = createRequire(koffi)(koffi);
  return windowsSizeReader(loaded);
}

if (parentPort !== null) {
  const port = parentPort;
  const read = readerFor(Reflect.get(Object(workerData), 'koffi'));
  port.on('message', (walk: SizeWalk) => {
    void walkFolders(walk, read, budgetMillis).then((walked) =>
      port.postMessage(walked),
    );
  });
}
