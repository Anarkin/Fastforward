import * as assert from 'node:assert';
import {
  imageSourceOf,
  imageType,
  imageUrl,
  type ImageSource,
} from '../../shared/images';

const blob = 'a'.repeat(40);
const parse = (url: string) => imageSourceOf(new URL(url, 'fastforward://app'));

suite('Images', () => {
  test('knows the images Chromium shows by their extension, in any case', () => {
    assert.strictEqual(imageType('a/b.png'), 'image/png');
    assert.strictEqual(imageType('photo.JPG'), 'image/jpeg');
    assert.strictEqual(imageType('photo.jpeg'), 'image/jpeg');
    assert.strictEqual(imageType('favicon.ico'), 'image/x-icon');
    assert.strictEqual(imageType('vector.svg'), 'image/svg+xml');
    for (const path of ['a.bin', 'png', '.png', 'a.png/b']) {
      assert.strictEqual(imageType(path), undefined, path);
    }
  });

  test('reads back the source of an image from its URL', () => {
    const sources: ImageSource[] = [
      { root: 'C:\\repo & co', path: 'a b/c#d.png', id: blob, disk: false },
      { root: '/repo', path: 'new.png', id: '12-3.5', disk: true },
    ];
    for (const source of sources) {
      assert.deepStrictEqual(parse(imageUrl(source)), source);
    }
  });

  test('reads back an image at a revision: a commit, its first parent, HEAD or the index', () => {
    for (const revision of [blob, `${blob}^`, 'HEAD', '']) {
      const source = {
        root: '/r',
        path: 'a.png',
        id: '3',
        disk: false,
        revision,
      };
      assert.deepStrictEqual(parse(imageUrl(source)), source);
    }
    for (const revision of [
      '--batch',
      'HEAD~1',
      'main',
      `${blob}:x`,
      `${blob}^^`,
    ]) {
      assert.strictEqual(
        parse(
          imageUrl({
            root: '/r',
            path: 'a.png',
            id: '3',
            disk: false,
            revision,
          }),
        ),
        undefined,
        revision,
      );
    }
    assert.strictEqual(
      parse(
        imageUrl({
          root: '/r',
          path: 'a.png',
          id: '3',
          disk: true,
          revision: 'HEAD',
        }),
      ),
      undefined,
    );
    assert.strictEqual(
      parse(imageUrl({ root: '/r', path: 'a\nb.png', id: blob, disk: false })),
      undefined,
    );
  });

  test('takes only a full hash as an object to read from git', () => {
    const source = { root: '/repo', path: 'a.png', disk: false };
    assert.strictEqual(
      parse(imageUrl({ ...source, id: '--batch' })),
      undefined,
    );
    assert.strictEqual(parse(imageUrl({ ...source, id: 'abcd' })), undefined);
    assert.strictEqual(parse(`/other?root=r&path=a.png&id=${blob}`), undefined);
    assert.strictEqual(parse(`/image?path=a.png&id=${blob}`), undefined);
  });
});
