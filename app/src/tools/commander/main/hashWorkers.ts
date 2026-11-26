import { workerPool, type PooledTask } from './workerPool';
import type { Hashed } from './contentHash';
import type { ContentReader } from './duplicates';

export interface HashTask {
  readonly file: string;
  readonly bytes: number | undefined;
}

export type HashAnswer =
  { readonly hashed: Hashed } | { readonly failed: true };

export function hashWorkers(
  folder: string,
): (ContentReader & { close(): void }) | undefined {
  const pool = workerPool<HashTask, HashAnswer>(folder, 'hashWorker.js');
  if (pool === undefined) {
    return undefined;
  }
  return {
    hash: (file, bytes, signal) =>
      new Promise((resolve) => {
        const done = (hashed: Hashed | undefined) => {
          signal.removeEventListener('abort', onAbort);
          resolve(hashed);
        };
        const task: PooledTask<HashTask, HashAnswer> = {
          asked: { file, bytes },
          signal,
          answered: (answer) =>
            done(
              signal.aborted || !('hashed' in answer)
                ? undefined
                : answer.hashed,
            ),
          unanswered: () => done(undefined),
        };
        const onAbort = () => pool.stop(task);
        signal.addEventListener('abort', onAbort, { once: true });
        pool.run(task);
      }),
    close: pool.close,
  };
}
