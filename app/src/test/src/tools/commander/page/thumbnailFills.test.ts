import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  fillOrder,
  ThumbnailFiller,
} from '../../../../../tools/commander/page/thumbnailFills';

suite('Thumbnails', () => {
  test('fills a folder from the first tile in view down to its end, then the tiles above, as people jump somewhere and go on down from there', () => {
    assert.deepStrictEqual(fillOrder(6, 2), [2, 3, 4, 5, 0, 1]);
    assert.deepStrictEqual(fillOrder(3, 0), [0, 1, 2]);
    assert.deepStrictEqual(fillOrder(3, 7), [0, 1, 2]);
    assert.deepStrictEqual(fillOrder(0, 0), []);
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
