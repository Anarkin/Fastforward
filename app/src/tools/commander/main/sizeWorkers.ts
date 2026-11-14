import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { strings } from '../../../lib/shared/strings';
import type { SizeWalk, SizeWalked, SizeWalker } from './folderSizes';

const workerFile = 'sizeWorker.js';
const workerCount = 4;
const idleMillis = 30_000;

const nothingWalked: SizeWalked = {
  bytes: 0,
  unread: 0,
  unreadable: false,
  rest: [],
};

interface Task {
  readonly walk: SizeWalk;
  readonly signal: AbortSignal;
  readonly resolve: (walked: SizeWalked) => void;
  readonly reject: (error: Error) => void;
}

interface Thread {
  readonly worker: Worker;
  task: Task | undefined;
}

export function unpacked(file: string): string {
  return file.replace(
    /([\\/])app\.asar([\\/])/,
    (_match, before: string, after: string) =>
      `${before}app.asar.unpacked${after}`,
  );
}

export function unpackedKoffi(): string {
  return unpacked(createRequire(__filename).resolve('koffi'));
}

export function sizeWorkers(
  folder: string,
  koffi: string | undefined,
): (SizeWalker & { close(): void }) | undefined {
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
    const worker = new Worker(code, { eval: true, workerData: { koffi } });
    worker.unref();
    const thread: Thread = { worker, task: undefined };
    worker.on('message', (walked: SizeWalked) => {
      const { task } = thread;
      thread.task = undefined;
      task?.resolve(walked);
      next();
    });
    const lost = () => {
      const at = threads.indexOf(thread);
      if (at !== -1) {
        threads.splice(at, 1);
      }
      const { task } = thread;
      thread.task = undefined;
      task?.reject(new Error(strings.errors.sizeWorkerStopped));
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
        task.resolve(nothingWalked);
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
      thread.worker.postMessage(task.walk);
    }
    rest();
  };

  return {
    walk: (walk, signal) =>
      new Promise((resolve, reject) => {
        if (closed) {
          reject(new Error(strings.errors.sizeWorkersClosed));
          return;
        }
        queue.push({ walk, signal, resolve, reject });
        next();
      }),
    close: () => {
      closed = true;
      clearTimeout(resting);
      for (const task of queue.splice(0)) {
        task.reject(new Error(strings.errors.sizeWorkersClosed));
      }
      for (const thread of threads.splice(0)) {
        void thread.worker.terminate();
      }
    },
  };
}
