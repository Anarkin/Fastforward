import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  imageSourceOf,
  imageUrl,
  type ImageSource,
} from '../../../../../tools/git/shared/images';

const blob = 'a'.repeat(40);
const parse = (url: string) => imageSourceOf(new URL(url, 'fastforward://app'));

suite('Images', () => {
  test('reads back the source of an image from its URL', () => {
    const sources: ImageSource[] = [
      { root: 'C:\\repo & co', path: 'a b/c#d.png', id: blob, disk: false },
      { root: '/repo', path: 'new.png', id: '12-3.5', disk: true },
    ];
    for (const source of sources) {
      assert.deepStrictEqual(parse(imageUrl(source)), source);
    }
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
