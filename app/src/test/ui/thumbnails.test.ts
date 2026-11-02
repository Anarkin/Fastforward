import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  fittedSize,
  ThumbnailCache,
  type Thumbnail,
} from '../../ui/thumbnails';

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
  test('fits an image within the box, keeping its shape, and never makes a small one larger', () => {
    assert.deepStrictEqual(fittedSize({ width: 600, height: 300 }, 144), {
      width: 144,
      height: 72,
    });
    assert.deepStrictEqual(fittedSize({ width: 300, height: 600 }, 144), {
      width: 72,
      height: 144,
    });
    assert.deepStrictEqual(fittedSize({ width: 20, height: 10 }, 144), {
      width: 20,
      height: 10,
    });
    assert.deepStrictEqual(fittedSize({ width: 2000, height: 1 }, 144), {
      width: 144,
      height: 1,
    });
  });

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

  test('makes two thumbnails at a time, in the order the tiles came into view, and none for a tile scrolled out of view before its turn', async () => {
    const { cache, asked, finish } = cacheOf();
    const scrolledAway = cache.hold('away.png', 144, 1);
    for (const name of ['a', 'b', 'c']) {
      cache.hold(`${name}.png`, 144, 1);
    }
    assert.deepStrictEqual(asked, ['away.png 144 1', 'a.png 144 1']);
    cache.hold('gone.png', 144, 1).release();
    cache.hold('d.png', 144, 1);
    scrolledAway.release();
    await finish('away.png');
    assert.deepStrictEqual(asked.at(-1), 'b.png 144 1');
    await finish('a.png');
    assert.deepStrictEqual(asked.at(-1), 'c.png 144 1');
    await finish('b.png');
    assert.deepStrictEqual(asked.at(-1), 'd.png 144 1');
    await finish('c.png');
    await finish('d.png');
    assert.strictEqual(asked.length, 5);
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
});
