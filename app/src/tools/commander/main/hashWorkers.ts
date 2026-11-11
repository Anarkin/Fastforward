import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Hashed } from './contentHash';
import type { ContentReader } from './duplicates';

const workerFile = 'hashWorker.js';
const workerCount = 4;
const idleMillis = 30_000;

export interface HashTask {
  readonly file: string;
  readonly bytes: number | undefined;
}

export type HashAnswer =
  { readonly hashed: Hashed } | { readonly failed: true };

interface Task {
  readonly asked: HashTask;
  readonly signal: AbortSignal;
  readonly done: (hashed: Hashed | undefined) => void;
}

interface Thread {
  readonly worker: Worker;
  task: Task | undefined;
}

export function hashWorkers(
  folder: string,
): (ContentReader & { close(): void }) | undefined {
  const file = path.join(folder, workerFile);
  if (!existsSync(file)) {
    return undefined;
  }
  let code: string | undefined;
  const threads: Thread[] = [];
  const queue: Task[] = [];
  let resting: NodeJS.Timeout | undefined;
  let closed = false;

  const rest = () => {
    clearTimeout(resting);
    if (queue.length > 0 || threads.some((thread) => thread.task)) {
      return;
    }
    resting = setTimeout(() => {
      for (const thread of threads.splice(0)) {
        void thread.worker.terminate();
      }
    }, idleMillis);
    resting.unref();
  };

  const spawn = (): Thread => {
    code ??= readFileSync(file, 'utf8');
    const worker = new Worker(code, { eval: true });
    worker.unref();
    const thread: Thread = { worker, task: undefined };
    worker.on('message', (answer: HashAnswer) => {
      const { task } = thread;
      thread.task = undefined;
      task?.done('hashed' in answer ? answer.hashed : undefined);
      next();
    });
    const lost = () => {
      const at = threads.indexOf(thread);
      if (at !== -1) {
        threads.splice(at, 1);
      }
      const { task } = thread;
      thread.task = undefined;
      task?.done(undefined);
      next();
    };
    worker.on('error', lost);
    worker.on('exit', lost);
    threads.push(thread);
    return thread;
  };

  const next = () => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) {
      if (task.signal.aborted) {
        task.done(undefined);
        continue;
      }
      const thread =
        threads.find((each) => each.task === undefined) ??
        (threads.length < workerCount && !closed ? spawn() : undefined);
      if (thread === undefined) {
        queue.unshift(task);
        break;
      }
      thread.task = task;
      thread.worker.postMessage(task.asked);
    }
    rest();
  };

  const stopped = (task: Task) => {
    const waiting = queue.indexOf(task);
    if (waiting !== -1) {
      queue.splice(waiting, 1);
      task.done(undefined);
      return;
    }
    const reading = threads.find((thread) => thread.task === task);
    if (reading !== undefined) {
      void reading.worker.terminate();
    }
  };

  return {
    hash: (hashed, bytes, signal) =>
      new Promise((resolve) => {
        if (closed || signal.aborted) {
          resolve(undefined);
          return;
        }
        const onAbort = () => stopped(task);
        const task: Task = {
          asked: { file: hashed, bytes },
          signal,
          done: (result) => {
            signal.removeEventListener('abort', onAbort);
            resolve(result);
          },
        };
        signal.addEventListener('abort', onAbort, { once: true });
        queue.push(task);
        next();
      }),
    close: () => {
      closed = true;
      clearTimeout(resting);
      for (const task of queue.splice(0)) {
        task.done(undefined);
      }
      for (const thread of threads.splice(0)) {
        void thread.worker.terminate();
      }
    },
  };
}
