import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { openedOf, pastedLink } from '../../../../../tools/canvas/page/links';
import type { BoardNode } from '../../../../../tools/canvas/shared/board';

const box = { x: 0, y: 0, width: 70, height: 36 };

suite('Canvas links', () => {
  test('takes a text pasted for a link only when it is one URL of the web over https, which a link node opens, its blanks around it left out', () => {
    assert.strictEqual(
      pastedLink('  https://example.com/a?b=c#d \n'),
      'https://example.com/a?b=c#d',
    );
    for (const text of [
      'http://example.com',
      'plain words',
      'https://example.com/a https://example.com/b',
      'ftp://example.com/file',
      'file:///etc/passwd',
      'javascript:alert(1)',
      '',
    ]) {
      assert.strictEqual(pastedLink(text), undefined, text);
    }
  });

  test('opens the URL of a link node and the file of a file node once the main process has told where it is, and nothing of another node', () => {
    const link: BoardNode = {
      id: 'l',
      type: 'link',
      url: 'https://a.b/',
      ...box,
    };
    const file: BoardNode = { id: 'f', type: 'file', file: 'a.md', ...box };
    const text: BoardNode = { id: 't', type: 'text', text: 'a.md', ...box };
    const files = { 'a.md': { path: '/vault/a.md' } };
    assert.deepStrictEqual(openedOf(link, undefined), { url: 'https://a.b/' });
    assert.deepStrictEqual(openedOf(file, files), { path: '/vault/a.md' });
    assert.strictEqual(openedOf(file, undefined), undefined);
    assert.strictEqual(openedOf(text, files), undefined);
    assert.strictEqual(openedOf(undefined, files), undefined);
  });
});
