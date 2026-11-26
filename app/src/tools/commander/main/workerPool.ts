import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { appFs } from '../../../lib/main/appFiles';
import { workerCount } from '../shared/workers';

const idleMillis = 30_000;

type Unanswered = 'aborted' | 'lost' | 'closed';

export interface PooledTask<Ask, Answer> {
  readonly asked: Ask;
  readonly signal: AbortSignal;
  readonly answered: (answer: Answer) => void;
  readonly unanswered: (why: Unanswered) => void;
}

export interface WorkerPool<Ask, Answer> {
  readonly run: (task: PooledTask<Ask, Answer>) => void;
  readonly stop: (task: PooledTask<Ask, Answer>) => void;
  readonly close: () => void;
}

interface Thread<Ask, Answer> {
  readonly worker: Worker;
  task: PooledTask<Ask, Answer> | undefined;
}

export function workerPool<Ask, Answer>(
  folder: string,
  workerFile: string,
  workerData?: unknown,
): WorkerPool<Ask, Answer> | undefined {
  const file = path.join(folder, workerFile);
  if (!appFs.existsSync(file)) {
    return undefined;
  }
  let code: string | undefined;
  const threads: Thread<Ask, Answer>[] = [];
  const queue: PooledTask<Ask, Answer>[] = [];
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

  const spawn = (): Thread<Ask, Answer> => {
    code ??= appFs.readFileSync(file, 'utf8');
    const worker = new Worker(code, {
      eval: true,
      ...(workerData !== undefined && { workerData }),
    });
    worker.unref();
    const thread: Thread<Ask, Answer> = { worker, task: undefined };
    worker.on('message', (answer: Answer) => {
      const { task } = thread;
      thread.task = undefined;
      task?.answered(answer);
      next();
    });
    const lost = () => {
      const at = threads.indexOf(thread);
      if (at !== -1) {
        threads.splice(at, 1);
      }
      const { task } = thread;
      thread.task = undefined;
      task?.unanswered('lost');
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
        task.unanswered('aborted');
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

  return {
    run: (task) => {
      if (closed) {
        task.unanswered('closed');
        return;
      }
      if (task.signal.aborted) {
        task.unanswered('aborted');
        return;
      }
      queue.push(task);
      next();
    },
    stop: (task) => {
      const waiting = queue.indexOf(task);
      if (waiting !== -1) {
        queue.splice(waiting, 1);
        task.unanswered('aborted');
        return;
      }
      const running = threads.find((thread) => thread.task === task);
      if (running !== undefined) {
        threads.splice(threads.indexOf(running), 1);
        void running.worker.terminate();
      }
    },
    close: () => {
      closed = true;
      clearTimeout(resting);
      for (const task of queue.splice(0)) {
        task.unanswered('closed');
      }
      for (const thread of threads.splice(0)) {
        void thread.worker.terminate();
      }
    },
  };
}
