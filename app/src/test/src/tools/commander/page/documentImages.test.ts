import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { documentImagePath } from '../../../../../tools/commander/page/documentImages';

const from = (src: string) => documentImagePath('docs/guide/a.md', src);

suite('Images in documents', () => {
  test('finds an image by its path from the document, or from the root as GitHub does, never outside the repository nor on a server, so opening a document tells no server, and only an image', () => {
    assert.strictEqual(from('shot.png'), 'docs/guide/shot.png');
    assert.strictEqual(
      from('./img/shot.png?raw=1#x'),
      'docs/guide/img/shot.png',
    );
    assert.strictEqual(from('../../logo.png'), 'logo.png');
    assert.strictEqual(from('/assets/my%20logo.png'), 'assets/my logo.png');
    for (const outside of [
      '../../../up.png',
      'https://example.com/a.png',
      '//example.com/a.png',
      'data:image/png;base64,AA',
      'C:/a.png',
      '%E0%A4%A.png',
      '/',
    ]) {
      assert.strictEqual(from(outside), undefined, outside);
    }
    assert.strictEqual(documentImagePath('README.md', 'a.png'), 'a.png');
    assert.strictEqual(from('notes.txt'), undefined);
  });

  test('takes a backslash in an image path for a slash, as browsers do, and an encoded one as well, so a path written on Windows finds the image on both sides and never leaves the repository', () => {
    assert.strictEqual(from('img\\shot.png'), 'docs/guide/img/shot.png');
    assert.strictEqual(from('..\\..\\logo.png'), 'logo.png');
    assert.strictEqual(from('\\assets\\a.png'), 'assets/a.png');
    assert.strictEqual(from('img%5Cshot.png'), 'docs/guide/img/shot.png');
    assert.strictEqual(from('..%5C..%5Clogo.png'), 'logo.png');
    for (const outside of [
      '..\\..\\..\\up.png',
      '\\\\example.com\\a.png',
      '..%5C..%5C..%5Cup.png',
    ]) {
      assert.strictEqual(from(outside), undefined, outside);
    }
  });
});
