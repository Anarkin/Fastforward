import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  fillOrder,
  ThumbnailCache,
  ThumbnailFiller,
  ThumbnailWorkers,
  type Thumbnail,
  type WorkerLike,
} from '../../../../../tools/commander/page/thumbnailFills';
import type {
  FromThumbnailWorker,
  ToThumbnailWorker,
} from '../../../../../tools/commander/page/thumbnailMessages';

const deferred = () => Promise.withResolvers<Thumbnail | undefined>();

function cacheOf(limit = 500) {
  const asked: string[] = [];
  const waiting = new Map<string, ReturnType<typeof deferred>>();
  const revoked: string[] = [];
  const cache = new ThumbnailCache(
    (url, box, pixelRatio) => {
      asked.push(`${url} ${box} ${pixelRatio}`);
      const made = deferred();
      waiting.set(url, made);
      return made.promise;
    },
    (url) => revoked.push(url),
    limit,
  );
  const finish = async (url: string, made = true) => {
    waiting
      .get(url)
      ?.resolve(
        made ? { url: `blob:${url}`, width: 10, height: 5 } : undefined,
      );
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { cache, asked, revoked, finish };
}

suite('Thumbnails', () => {
  test('makes the thumbnail of an image once however often it is asked for, at the size of the box in pixels of the screen, and keeps it', async () => {
    const { cache, asked, finish } = cacheOf();
    const first = cache.hold('a.png', 144, 1.5);
    const second = cache.hold('a.png', 144, 1.5);
    await finish('a.png');
    assert.deepStrictEqual(await first.loading, {
      url: 'blob:a.png',
      width: 10,
      height: 5,
    });
    assert.strictEqual(await second.loading, await first.loading);
    assert.deepStrictEqual(asked, ['a.png 144 1.5']);
    assert.strictEqual(cache.peek('a.png', 144, 1.5)?.url, 'blob:a.png');
    assert.strictEqual(cache.peek('a.png', 96, 1.5), undefined);
  });

  test('makes four thumbnails at a time, one for each of its workers, in the order the tiles came into view, and none for a tile scrolled out of view before its turn', async () => {
    const { cache, asked, finish } = cacheOf();
    const scrolledAway = cache.hold('away.png', 144, 1);
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      cache.hold(`${name}.png`, 144, 1);
    }
    assert.deepStrictEqual(asked, [
      'away.png 144 1',
      'a.png 144 1',
      'b.png 144 1',
      'c.png 144 1',
    ]);
    cache.hold('gone.png', 144, 1).release();
    cache.hold('f.png', 144, 1);
    scrolledAway.release();
    await finish('away.png');
    assert.deepStrictEqual(asked.at(-1), 'd.png 144 1');
    await finish('a.png');
    assert.deepStrictEqual(asked.at(-1), 'e.png 144 1');
    await finish('b.png');
    assert.deepStrictEqual(asked.at(-1), 'f.png 144 1');
    for (const name of ['c', 'd', 'e', 'f']) {
      await finish(`${name}.png`);
    }
    assert.strictEqual(asked.length, 7);
  });

  test('lets go of the thumbnails shown least lately beyond its limit, keeping those still shown, and tries again for one that could not be made', async () => {
    const { cache, asked, revoked, finish } = cacheOf(2);
    const kept = cache.hold('a.png', 144, 1);
    await finish('a.png');
    for (const name of ['b', 'c']) {
      cache.hold(`${name}.png`, 144, 1).release();
    }
    const shown = [cache.hold('b.png', 144, 1), cache.hold('c.png', 144, 1)];
    await finish('b.png');
    await finish('c.png');
    for (const each of shown) {
      each.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(revoked, ['blob:b.png']);
    assert.strictEqual(cache.peek('a.png', 144, 1)?.url, 'blob:a.png');
    kept.release();

    cache.hold('broken.png', 144, 1);
    await finish('broken.png', false);
    cache.hold('broken.png', 144, 1);
    assert.strictEqual(
      asked.filter((each) => each.startsWith('broken.png')).length,
      2,
    );
  });

  test('fills a folder from the first tile in view down to its end, then the tiles above, as people jump somewhere and go on down from there', () => {
    assert.deepStrictEqual(fillOrder(6, 2), [2, 3, 4, 5, 0, 1]);
    assert.deepStrictEqual(fillOrder(3, 0), [0, 1, 2]);
    assert.deepStrictEqual(fillOrder(3, 7), [0, 1, 2]);
    assert.deepStrictEqual(fillOrder(0, 0), []);
  });

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

  test('fills two at a time in its order, skipping what it filled before when asked again from elsewhere, and stops once the thumbnails are full or it is told', async () => {
    const asked: string[] = [];
    const pending = new Map<
      string,
      (outcome: 'made' | 'stored' | 'online' | 'full') => void
    >();
    const filler = new ThumbnailFiller((item: string) => {
      asked.push(item);
      const { promise, resolve } = Promise.withResolvers<
        'made' | 'stored' | 'online' | 'full'
      >();
      pending.set(item, resolve);
      return promise;
    }, 2);
    const settle = async (
      item: string,
      outcome: 'made' | 'stored' | 'online' | 'full',
    ) => {
      pending.get(item)?.(outcome);
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    filler.start(['c', 'd', 'e', 'a', 'b']);
    assert.deepStrictEqual(asked, ['c', 'd']);
    await settle('c', 'made');
    assert.deepStrictEqual(asked, ['c', 'd', 'e']);
    filler.start(['a', 'b', 'c', 'd', 'e']);
    await settle('d', 'stored');
    await settle('e', 'online');
    assert.deepStrictEqual(asked, ['c', 'd', 'e', 'a', 'b']);
    await settle('a', 'full');
    await settle('b', 'made');
    filler.start(['f', 'g']);
    assert.deepStrictEqual(asked, ['c', 'd', 'e', 'a', 'b', 'f', 'g']);
    filler.stop();
    await settle('f', 'made');
    await settle('g', 'made');
    filler.start(['h']);
    assert.deepStrictEqual(asked.at(-1), 'h');
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
