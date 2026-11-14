import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { ImageCache } from '../../../../lib/page/imageCache';
import { policyOfPage } from '../../../helpers/fixtures';

function fakeImages(
  responses: Record<string, () => Promise<Response>>,
  limit?: number,
) {
  const fetched: string[] = [];
  const revoked: string[] = [];
  let made = 0;
  const cache = new ImageCache(
    (url) => {
      fetched.push(url);
      return responses[url]();
    },
    { create: () => `blob:${++made}`, revoke: (url) => revoked.push(url) },
    limit,
  );
  return { cache, fetched, revoked };
}

const bytes = (size: number) => () =>
  Promise.resolve(new Response(new Uint8Array(size)));

const sized = (size: number) => () => {
  const blob = new Blob();
  Object.defineProperty(blob, 'size', { value: size });
  const response = new Response();
  Object.defineProperty(response, 'blob', {
    value: () => Promise.resolve(blob),
  });
  return Promise.resolve(response);
};

suite('Image cache', () => {
  test('may fetch the images from the app or from their own text, and show them from memory, by the page policy, which allows no remote source, so opening a document tells no server', () => {
    const policy = policyOfPage();
    assert.deepStrictEqual(policy.get('connect-src'), ["'self'", 'data:']);
    assert.deepStrictEqual(policy.get('img-src'), ["'self'", 'data:', 'blob:']);
  });

  test('fetches each image once, and knows it once loaded', async () => {
    const { cache, fetched } = fakeImages({ a: bytes(3) });
    assert.strictEqual(cache.peek('a'), undefined);
    const [first, second] = await Promise.all([
      cache.load('a'),
      cache.load('a'),
    ]);
    assert.deepStrictEqual(first, { kind: 'loaded', url: 'blob:1', bytes: 3 });
    assert.strictEqual(second, first);
    assert.strictEqual(cache.peek('a'), first);
    assert.deepStrictEqual(fetched, ['a']);
  });

  test('tells an image too large to preview from one that failed by how the app answers its fetch, rather than having it sent as a message, and tries the failed one again', async () => {
    const { cache, fetched } = fakeImages({
      large: () => Promise.resolve(new Response(null, { status: 413 })),
      missing: () => Promise.resolve(new Response(null, { status: 404 })),
      broken: () => Promise.reject(new Error('gone')),
    });
    assert.deepStrictEqual(await cache.load('large'), { kind: 'tooLarge' });
    assert.deepStrictEqual(await cache.load('large'), { kind: 'tooLarge' });
    for (const url of ['missing', 'broken']) {
      assert.deepStrictEqual(await cache.load(url), { kind: 'failed' });
      assert.deepStrictEqual(await cache.load(url), { kind: 'failed' });
    }
    assert.deepStrictEqual(fetched, [
      'large',
      'missing',
      'missing',
      'broken',
      'broken',
    ]);
  });

  test('keeps up to 256 MB of images, forgetting the ones used longest ago past them, never the one just loaded', async () => {
    const half = 128 * 1024 * 1024;
    const kept = fakeImages({ a: sized(half), b: sized(half), c: sized(1) });
    await kept.cache.load('a');
    await kept.cache.load('b');
    assert.deepStrictEqual(kept.revoked, []);
    await kept.cache.load('c');
    assert.deepStrictEqual(kept.revoked, ['blob:1']);
    assert.ok(kept.cache.peek('b'));
  });

  test('forgets the images used longest ago past its size, never the one just loaded', async () => {
    const { cache, revoked } = fakeImages(
      { a: bytes(4), b: bytes(4), c: bytes(4), huge: bytes(20) },
      10,
    );
    await cache.load('a');
    await cache.load('b');
    await cache.load('a');
    await cache.load('c');
    assert.deepStrictEqual(revoked, ['blob:2']);
    assert.strictEqual(cache.peek('b'), undefined);
    assert.ok(cache.peek('a'));
    await cache.load('huge');
    assert.deepStrictEqual(revoked, ['blob:2', 'blob:1', 'blob:3']);
    assert.ok(cache.peek('huge'));
  });

  test('keeps an image a preview holds though the images pass its size, as one handed to a preview may not be shown yet, forgetting it once let go', async () => {
    const { cache, revoked } = fakeImages({ a: bytes(6), b: bytes(6) }, 10);
    const a = cache.hold('a');
    const b = cache.hold('b');
    assert.deepStrictEqual(await a.loading, {
      kind: 'loaded',
      url: 'blob:1',
      bytes: 6,
    });
    await b.loading;
    assert.deepStrictEqual(revoked, []);
    assert.ok(cache.peek('a'));
    a.release();
    await Promise.resolve();
    assert.deepStrictEqual(revoked, ['blob:1']);
    assert.strictEqual(cache.peek('a'), undefined);
    b.release();
    await Promise.resolve();
    assert.ok(cache.peek('b'));
  });

  test('keeps an image let go and held again at once, as a pane moving to another row lets go of it just before the new one holds it', async () => {
    const { cache, revoked } = fakeImages({ a: bytes(6), b: bytes(6) }, 10);
    const a = cache.hold('a');
    const b = cache.hold('b');
    await Promise.all([a.loading, b.loading]);
    const shown = cache.peek('a');
    a.release();
    const again = cache.hold('a');
    await Promise.resolve();
    assert.deepStrictEqual(revoked, []);
    assert.strictEqual(cache.peek('a'), shown);
    again.release();
    b.release();
  });
});
