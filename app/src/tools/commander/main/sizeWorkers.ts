import { workerPool } from './workerPool';
import { strings } from '../../../lib/shared/strings';
import type { SizeWalk, SizeWalked, SizeWalker } from './sizeWalk';

const nothingWalked: SizeWalked = {
  bytes: 0,
  unread: 0,
  unreadable: false,
  rest: [],
};

export function sizeWorkers(
  folder: string,
  koffi: string | undefined,
): (SizeWalker & { close(): void }) | undefined {
  const pool = workerPool<SizeWalk, SizeWalked>(folder, 'sizeWorker.js', {
    koffi,
  });
  if (pool === undefined) {
    return undefined;
  }
  return {
    walk: (walk, signal) =>
      new Promise((resolve, reject) => {
        pool.run({
          asked: walk,
          signal,
          answered: resolve,
          unanswered: (why) =>
            why === 'aborted'
              ? resolve(nothingWalked)
              : reject(
                  new Error(
                    why === 'lost'
                      ? strings.errors.sizeWorkerStopped
                      : strings.errors.sizeWorkersClosed,
                  ),
                ),
        });
      }),
    close: pool.close,
  };
}
