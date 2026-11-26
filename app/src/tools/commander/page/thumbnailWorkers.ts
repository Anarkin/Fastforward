import type {
  FromThumbnailWorker,
  ToThumbnailWorker,
} from './thumbnailMessages';

import { workerCount } from '../shared/workers';

export interface WorkerLike {
  postMessage(message: ToThumbnailWorker): void;
  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void;
  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void;
}

interface Job {
  readonly message: ToThumbnailWorker;
  readonly answer: (answer: FromThumbnailWorker) => void;
}

export const fillingWorkers = 2;

export class ThumbnailWorkers {
  private readonly idle: WorkerLike[] = [];
  private readonly shown: Job[] = [];
  private readonly filling: Job[] = [];
  private started = 0;
  private fillsRunning = 0;
  private asked = 0;

  constructor(
    private readonly create: () => WorkerLike = () =>
      new Worker(new URL('thumbnailWorker.js', location.href), {
        type: 'module',
      }),
    private readonly size = workerCount,
    private readonly fillLimit = fillingWorkers,
  ) {}

  make(
    url: string,
    box: number,
    pixelRatio: number,
    filling: boolean,
  ): Promise<FromThumbnailWorker> {
    const id = ++this.asked;
    const { promise, resolve } = Promise.withResolvers<FromThumbnailWorker>();
    (filling ? this.filling : this.shown).push({
      message: { id, url, box, pixelRatio, filling },
      answer: resolve,
    });
    this.assign();
    return promise;
  }

  private assign(): void {
    for (;;) {
      const job =
        this.shown.shift() ??
        (this.fillsRunning < this.fillLimit ? this.filling.shift() : undefined);
      if (job === undefined) {
        return;
      }
      const worker =
        this.idle.pop() ??
        (this.started < this.size ? this.newWorker() : undefined);
      if (worker === undefined) {
        (job.message.filling ? this.filling : this.shown).unshift(job);
        return;
      }
      this.run(worker, job);
    }
  }

  private newWorker(): WorkerLike {
    this.started++;
    return this.create();
  }

  private run(worker: WorkerLike, job: Job): void {
    const { id, filling } = job.message;
    if (filling) {
      this.fillsRunning++;
    }
    const done = (answer: FromThumbnailWorker) => {
      worker.removeEventListener('message', answered);
      worker.removeEventListener('error', failed);
      if (filling) {
        this.fillsRunning--;
      }
      this.idle.push(worker);
      job.answer(answer);
      this.assign();
    };
    const answered = ({ data }: MessageEvent<FromThumbnailWorker>) => {
      if (data.id === id) {
        done(data);
      }
    };
    const failed = () => done({ id });
    worker.addEventListener('message', answered);
    worker.addEventListener('error', failed);
    worker.postMessage(job.message);
  }
}

export const workers = new ThumbnailWorkers();
