import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { activeDescendant } from '../../../../lib/page/rowIds';

suite('Row ids', () => {
  test('points at the picked row only while it is drawn, as the row it points at must exist', () => {
    const items = [{ key: 'a' }, { key: 2 }];
    assert.strictEqual(activeDescendant('list-', 'a', items), 'list-a');
    assert.strictEqual(activeDescendant('list-', 2, items), 'list-2');
    assert.strictEqual(activeDescendant('list-', 'b', items), undefined);
    assert.strictEqual(activeDescendant('list-', undefined, items), undefined);
  });

  test('gives a row whose name holds a lone surrogate, as Windows allows, an id of its own rather than throwing, as a throw took the whole window down', () => {
    const items = [
      { key: 'a\uD800.txt' },
      { key: 'a\uDC00.txt' },
      { key: 'a�.txt' },
      { key: 'a%uD800.txt' },
      { key: 'a😀.txt' },
    ];
    const ids = items.map(({ key }) => activeDescendant('list-', key, items));

    assert.ok(ids.every((id) => id !== undefined && !/\s/.test(id)));
    assert.strictEqual(new Set(ids).size, items.length);
  });

  test('gives a row whose path holds spaces an id without them, as aria-activedescendant takes no spaces, keeping it apart from the ids of other paths', () => {
    const items = [{ key: 'file:a b' }, { key: 'file:a%20b' }];
    const ids = items.map(({ key }) => activeDescendant('list-', key, items));
    assert.ok(ids.every((id) => id !== undefined && !/\s/.test(id)));
    assert.strictEqual(new Set(ids).size, 2);
  });
});
