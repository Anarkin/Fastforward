import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { comparisonOf } from '../../shared/comparisons';
import { imageSourceOf } from '../../shared/images';
import { workingTreeHash } from '../../shared/protocol';
import { parsePatch, type DiffFile } from '../../webview/diff';
import {
  diffImageUrl,
  ImageCache,
  previewsImage,
  previewsWholeImage,
  rendersImage,
  rendersWholeImage,
  wholeImageUrl,
  withUnchangedObjects,
  type ImageOrigin,
} from '../../webview/images';

const oldId = '1'.repeat(40);
const newId = '2'.repeat(40);
const commit = 'c'.repeat(40);

function binaryFile(from: string, to: string, index: string): DiffFile {
  const [file] = parsePatch(
    [
      `diff --git a/${from} b/${to}`,
      ...(from === to ? [] : [`rename from ${from}`, `rename to ${to}`]),
      `index ${index}`,
      `Binary files a/${from} and b/${to} differ`,
    ].join('\n'),
  );
  return file;
}

const modified = binaryFile('a.png', 'a.png', `${oldId}..${newId}`);

const at = (hash: string, area?: ImageOrigin['area']) => ({
  root: '/repo',
  hash,
  ...(area ? { area } : {}),
});

const source = (url: string | undefined) =>
  url === undefined
    ? undefined
    : imageSourceOf(new URL(url, 'fastforward://app'));

function svgPatch(index: string, binary = false): DiffFile {
  const [file] = parsePatch(
    [
      'diff --git a/v.svg b/v.svg',
      `index ${index}`,
      ...(binary
        ? ['Binary files a/v.svg and b/v.svg differ']
        : ['--- a/v.svg', '+++ b/v.svg', '@@ -1 +1 @@', '-<svg/>', '+<svg />']),
    ].join('\n'),
  );
  return file;
}

const change = (file: string, id?: string) => ({
  path: file,
  oldPath: undefined,
  status: 'R' as const,
  insertions: 0,
  deletions: 0,
  ...(id ? { id } : {}),
});

suite('Image previews', () => {
  test('previews an image moved or copied unchanged by the object its change names', () => {
    const [moved, renamedText, edited] = parsePatch(
      [
        'diff --git a/resources/a.png b/src/a.png',
        'similarity index 100%',
        'rename from resources/a.png',
        'rename to src/a.png',
        'diff --git a/a.ts b/b.ts',
        'similarity index 100%',
        'rename from a.ts',
        'rename to b.ts',
        'diff --git a/c.png b/c.png',
        `index ${oldId}..${newId}`,
        'Binary files a/c.png and b/c.png differ',
      ].join('\n'),
    );
    const files = [moved, renamedText, edited];
    const [image, text, kept] = withUnchangedObjects(files, [
      change('src/a.png', commit),
      change('b.ts', commit),
      change('c.png', commit),
    ]);
    assert.strictEqual(previewsImage(moved), false);
    assert.strictEqual(previewsImage(image), true);
    assert.deepStrictEqual(
      [
        source(diffImageUrl(at(commit), image, 'old')),
        source(diffImageUrl(at(commit), image, 'new'))?.path,
      ],
      [
        { root: '/repo', path: 'resources/a.png', id: commit, disk: false },
        'src/a.png',
      ],
    );
    assert.strictEqual(text.binary, false);
    assert.strictEqual(kept, edited);
    assert.strictEqual(
      withUnchangedObjects(files, [change('src/a.png')]),
      files,
    );
  });

  test('renders an SVG from its source, in a diff with either side or whole', () => {
    const svg = svgPatch(`${oldId}..${newId}`);
    assert.strictEqual(rendersImage(svg), true);
    assert.strictEqual(previewsImage(svg), false);
    assert.strictEqual(source(diffImageUrl(at(commit), svg, 'new'))?.id, newId);
    assert.strictEqual(
      rendersImage(svgPatch(`${oldId}..${newId}`, true)),
      false,
    );
    assert.strictEqual(rendersImage({ ...svg, blobs: undefined }), false);
    assert.strictEqual(
      rendersImage({ ...svg, placeholder: { lines: 1 } }),
      false,
    );
    assert.strictEqual(rendersImage({ ...modified, binary: false }), false);

    const whole = { path: 'v.svg', content: '<svg>#&</svg>', binary: false };
    assert.strictEqual(rendersWholeImage(whole), true);
    assert.strictEqual(rendersWholeImage({ ...whole, path: 'v.xml' }), false);
    const url = wholeImageUrl(at(commit), whole) ?? '';
    const prefix = 'data:image/svg+xml;charset=utf-8,';
    assert.ok(url.startsWith(prefix));
    assert.strictEqual(
      decodeURIComponent(url.slice(prefix.length)),
      whole.content,
    );
  });

  test('previews a binary image that has either side', () => {
    assert.strictEqual(previewsImage(modified), true);
    assert.strictEqual(
      previewsImage(
        binaryFile('a.png', 'a.png', `${'0'.repeat(40)}..${newId}`),
      ),
      true,
    );
    assert.strictEqual(
      previewsImage(binaryFile('a.bin', 'a.bin', `${oldId}..${newId}`)),
      false,
    );
    assert.strictEqual(
      previewsImage({ path: 'a.png', binary: true, hunks: [] }),
      false,
    );
    assert.strictEqual(previewsImage({ ...modified, binary: false }), false);
  });

  test('reads the working tree side of an image from disk, and the rest from git', () => {
    const disk = (origin: ImageOrigin) => [
      source(diffImageUrl(origin, modified, 'old'))?.disk,
      source(diffImageUrl(origin, modified, 'new'))?.disk,
    ];
    assert.deepStrictEqual(disk(at(commit)), [false, false]);
    assert.deepStrictEqual(disk(at(workingTreeHash)), [false, true]);
    assert.deepStrictEqual(disk(at(workingTreeHash, 'unstaged')), [
      false,
      true,
    ]);
    assert.deepStrictEqual(disk(at(workingTreeHash, 'staged')), [false, false]);
    assert.deepStrictEqual(disk(at(comparisonOf(workingTreeHash, commit))), [
      true,
      false,
    ]);
    assert.deepStrictEqual(source(diffImageUrl(at(commit), modified, 'new')), {
      root: '/repo',
      path: 'a.png',
      id: newId,
      disk: false,
    });
  });

  test('reads each side of a renamed image at its own path, and no side it lacks', () => {
    const renamed = binaryFile('old.jpg', 'new.png', `${oldId}..${newId}`);
    const origin = {
      root: '/repo',
      hash: comparisonOf(workingTreeHash, commit),
    };
    assert.deepStrictEqual(source(diffImageUrl(origin, renamed, 'old')), {
      root: '/repo',
      path: 'old.jpg',
      id: oldId,
      disk: true,
    });
    assert.strictEqual(
      source(diffImageUrl(origin, renamed, 'new'))?.path,
      'new.png',
    );
    const added = binaryFile('a.png', 'a.png', `${'0'.repeat(40)}..${newId}`);
    assert.strictEqual(diffImageUrl(origin, added, 'old'), undefined);
    const typeChanged = binaryFile('a.png', 'a.bin', `${oldId}..${newId}`);
    assert.strictEqual(diffImageUrl(origin, typeChanged, 'new'), undefined);
  });

  test('previews a binary image shown whole, from disk in the working tree', () => {
    const whole = { path: 'a.png', content: '', binary: true, id: commit };
    assert.strictEqual(previewsWholeImage(whole), true);
    assert.strictEqual(previewsWholeImage({ ...whole, path: 'a.bin' }), false);
    assert.strictEqual(
      previewsWholeImage({ path: 'a.png', binary: true }),
      false,
    );
    assert.strictEqual(
      source(wholeImageUrl({ root: '/repo', hash: commit }, whole))?.disk,
      false,
    );
    assert.strictEqual(
      source(
        wholeImageUrl(
          { root: '/repo', hash: workingTreeHash, area: 'staged' },
          whole,
        ),
      )?.disk,
      true,
    );
  });
});

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

function policyOfPage(): Map<string, string[]> {
  const page = fs.readFileSync(
    path.join(__dirname, '../../../src/webview/index.html'),
    'utf8',
  );
  const [, policy = ''] =
    /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(page) ?? [];
  return new Map(
    policy.split(';').map((directive) => {
      const [name = '', ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

suite('Image cache', () => {
  test('may fetch the images from the app or from their own text, and show them from memory, by the page policy', () => {
    const policy = policyOfPage();
    assert.ok(policy.get('connect-src')?.includes("'self'"));
    assert.ok(policy.get('connect-src')?.includes('data:'));
    assert.ok(policy.get('img-src')?.includes('blob:'));
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

  test('tells an image too large to preview from one that failed, and tries the failed one again', async () => {
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
});
