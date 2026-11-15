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
});

class FakeWorker implements WorkerLike {
  readonly asked: ToThumbnailWorker[] = [];
  private readonly listeners = new Set<
    (event: MessageEvent<FromThumbnailWorker>) => void
  >();

  postMessage(message: ToThumbnailWorker): void {
    this.asked.push(message);
  }

  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void {
    if (type === 'message') {
      this.listeners.delete(listener);
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
