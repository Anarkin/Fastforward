import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  ThumbnailWorkers,
  type WorkerLike,
} from '../../../../../tools/commander/page/thumbnailWorkers';
import type {
  FromThumbnailWorker,
  ToThumbnailWorker,
} from '../../../../../tools/commander/page/thumbnailMessages';

suite('Thumbnails', () => {
  test('gives a free worker to a tile in view before the background, starting no more workers than it has', async () => {
    const started: FakeWorker[] = [];
    const workers = new ThumbnailWorkers(() => {
      const worker = new FakeWorker();
      started.push(worker);
      return worker;
    }, 2);
    const answered: string[] = [];
    const ask = (url: string, filling: boolean) =>
      void workers.make(url, 144, 1, filling).then(() => answered.push(url));
    ask('fill-1', true);
    ask('fill-2', true);
    ask('fill-3', true);
    ask('shown', false);
    assert.strictEqual(started.length, 2);
    started[0]?.answer();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(started[0]?.asked.at(-1)?.url, 'shown');
    started[1]?.answer();
    started[0]?.answer();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(
      started.map((worker) => worker.asked.map((each) => each.url)),
      [
        ['fill-1', 'shown'],
        ['fill-2', 'fill-3'],
      ],
    );
  });

  test('ends a worker that failed, as one whose script never loaded answers nothing again, and gives the next tile a new one, the failed tile answered empty', async () => {
    const started: FakeWorker[] = [];
    const workers = new ThumbnailWorkers(() => {
      const worker = new FakeWorker();
      started.push(worker);
      return worker;
    }, 1);
    const failed = workers.make('broken', 144, 1, false);
    started[0]?.fail();
    assert.deepStrictEqual(await failed, { id: 1 });
    assert.strictEqual(started[0]?.ended, true);
    const next = workers.make('next', 144, 1, false);
    assert.strictEqual(started.length, 2);
    assert.deepStrictEqual(started[0]?.asked.length, 1);
    started[1]?.answer();
    assert.deepStrictEqual(await next, { id: 2, outcome: 'stored' });
  });
});

class FakeWorker implements WorkerLike {
  ended = false;
  readonly asked: ToThumbnailWorker[] = [];
  private readonly listeners = new Set<
    (event: MessageEvent<FromThumbnailWorker>) => void
  >();
  private readonly failures = new Set<
    (event: MessageEvent<FromThumbnailWorker>) => void
  >();

  postMessage(message: ToThumbnailWorker): void {
    this.asked.push(message);
  }

  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void {
    (type === 'message' ? this.listeners : this.failures).add(listener);
  }

  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void {
    (type === 'message' ? this.listeners : this.failures).delete(listener);
  }

  terminate(): void {
    this.ended = true;
  }

  fail(): void {
    const event = new MessageEvent<FromThumbnailWorker>('error');
    for (const listener of Array.from(this.failures)) {
      listener(event);
    }
  }

  answer(): void {
    const last = this.asked.at(-1);
    if (last === undefined) {
      return;
    }
    const event = new MessageEvent<FromThumbnailWorker>('message', {
      data: { id: last.id, outcome: 'stored' },
    });
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}
