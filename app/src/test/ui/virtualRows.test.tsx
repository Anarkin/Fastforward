import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  activeDescendant,
  estimatedRowHeight,
  pinnedRows,
  revealAgain,
  revealOffset,
  scrollTarget,
  VirtualRows,
} from '../../ui/virtualRows';
import { countingReads, noop } from '../fixtures';

suite('Virtual rows', () => {
  test('scrolls to the selected row again once it arrives, as a tree loads after its file was selected', () => {
    assert.strictEqual(scrollTarget('a', []), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'c']), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'a']), 'a');
    assert.strictEqual(scrollTarget(undefined, ['a']), undefined);
  });

  test('scrolls to the selected row again once the rows it reveals with change, as unchanged files load above a selected one', () => {
    const files = ['b'];
    const tree = ['a', 'b'];
    assert.ok(revealAgain(undefined, { key: 'b', rows: files }));
    assert.ok(
      !revealAgain({ key: 'b', rows: files }, { key: 'b', rows: files }),
    );
    assert.ok(revealAgain({ key: 'b', rows: files }, { key: 'b', rows: tree }));
    assert.ok(revealAgain({ key: 'b', rows: tree }, { key: 'a', rows: tree }));
    assert.ok(
      !revealAgain({ key: 'b', rows: files }, { key: undefined, rows: tree }),
    );
  });

  test('compares the values it reveals with one by one, so the same values given anew reveal nothing', () => {
    assert.ok(
      !revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['one', true] },
      ),
    );
    assert.ok(
      revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['one', false] },
      ),
    );
    assert.ok(
      revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['two', true] },
      ),
    );
  });

  test('draws only the rows in view of a long list, not every row', () => {
    const drawn: number[] = [];
    const keys = Array.from({ length: 10_000 }, (_, index) => `row:${index}`);
    renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: keys.length,
          keyOf: (index) => keys[index],
          indexOf: (key) => keys.indexOf(key),
        }}
        renderRow={(index) => {
          drawn.push(index);
          return keys[index];
        }}
        selectedKey={undefined}
        initialRect={{ width: 400, height: 240 }}
      />,
    );
    const inView = Array.from({ length: 10 }, (_, index) => index);
    assert.deepStrictEqual(drawn.slice(0, inView.length), inView);
    assert.ok(drawn.length < 100, `${drawn.length} rows drawn`);
  });

  test('sizes the rows not drawn yet at the fixed height of a row, so the list is as long as it will be', () => {
    const html = renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: 1000,
          keyOf: (index) => `row:${index}`,
          indexOf: () => -1,
        }}
        renderRow={() => null}
        selectedKey={undefined}
      />,
    );
    const height = 1000 * estimatedRowHeight;
    assert.match(
      html,
      new RegExp(`class="virtual-spacer" style="height:${height}px"`),
    );
  });
});

function rows(count: number): { start: number; end: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * 20,
    end: i * 20 + 20,
  }));
}

suite('Pinned rows', () => {
  const parents: Record<number, number[]> = {
    1: [0],
    2: [0, 1],
    3: [0, 1],
    4: [0, 1],
    5: [0],
    6: [],
  };
  const ancestorsOf = (index: number) => parents[index] ?? [];

  test('pins nothing at the top, or while the folders are still in view', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 0, ancestorsOf), []);
  });

  test('pins the folders of the row at the top, under the folders pinned above it', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 25, ancestorsOf), [0, 1]);
    assert.deepStrictEqual(pinnedRows(rows(7), 45, ancestorsOf), [0, 1]);
  });

  test('pins fewer folders once a shallower row comes under them', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 81, ancestorsOf), [0]);
    assert.deepStrictEqual(pinnedRows(rows(7), 110, ancestorsOf), []);
  });

  test('finds the row at the top of a long list reading only a few rows', () => {
    const all = countingReads(rows(100_000));
    assert.deepStrictEqual(
      pinnedRows(all.counted, 1_500_005, () => []),
      [],
    );
    assert.ok(all.reads < 100, `${all.reads} reads`);
  });
});

suite('Revealing a row', () => {
  const row = { start: 200, end: 220 };

  test('leaves a row alone that is in view below the pinned folders', () => {
    assert.strictEqual(revealOffset(row, 100, 300, 40), undefined);
  });

  test('scrolls a row hidden under the pinned folders, or above the view, to just below them', () => {
    assert.strictEqual(revealOffset(row, 180, 300, 40), 160);
    assert.strictEqual(revealOffset(row, 250, 300, 0), 200);
    assert.strictEqual(revealOffset({ start: 10, end: 30 }, 20, 300, 40), 0);
  });

  test('scrolls a row below the view up to its bottom', () => {
    assert.strictEqual(revealOffset(row, 0, 150, 40), 70);
  });
});

suite('Virtual rows for assistive technology', () => {
  const keys = ['folder:a', 'file:a/b', 'file:c'];
  const listed = {
    count: keys.length,
    keyOf: (index: number) => keys[index],
    indexOf: (key: string) => keys.indexOf(key),
  };
  const drawn = (selectedKey: string, tree: boolean) =>
    new JSDOM(
      renderToStaticMarkup(
        <VirtualRows
          rows={listed}
          renderRow={(index) => keys[index]}
          selectedKey={selectedKey}
          label="Files"
          treeItemOf={
            tree
              ? (index) =>
                  index === 0
                    ? { level: 1, expanded: true }
                    : { level: index === 1 ? 2 : 1 }
              : undefined
          }
          onKeyDown={noop}
          initialRect={{ width: 400, height: 240 }}
        />,
      ),
    ).window.document;

  test('tells that the rows form a tree, how deep each lies, whether a folder is open, and which row is picked', () => {
    const document = drawn('file:a/b', true);
    const tree = document.querySelector('[role="tree"]');
    assert.strictEqual(tree?.getAttribute('aria-label'), 'Files');
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('[role="treeitem"]'), (item) => [
        item.textContent,
        item.getAttribute('aria-level'),
        item.getAttribute('aria-expanded'),
        item.getAttribute('aria-selected'),
      ]),
      [
        ['folder:a', '1', 'true', 'false'],
        ['file:a/b', '2', null, 'true'],
        ['file:c', '1', null, 'false'],
      ],
    );
    assert.strictEqual(
      document.getElementById(tree.getAttribute('aria-activedescendant') ?? '')
        ?.textContent,
      'file:a/b',
    );
  });

  test('tells that the rows form a list without levels', () => {
    const document = drawn('file:c', false);
    const list = document.querySelector('[role="listbox"]');
    assert.ok(list);
    assert.strictEqual(document.querySelectorAll('[role="option"]').length, 3);
    assert.strictEqual(
      document
        .getElementById(list.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('aria-selected'),
      'true',
    );
  });

  test('points at the picked row only while it is drawn, as the row it points at must exist', () => {
    const items = [{ key: 'a' }, { key: 2 }];
    assert.strictEqual(activeDescendant('list-', 'a', items), 'list-a');
    assert.strictEqual(activeDescendant('list-', 2, items), 'list-2');
    assert.strictEqual(activeDescendant('list-', 'b', items), undefined);
    assert.strictEqual(activeDescendant('list-', undefined, items), undefined);
  });

  test('gives a row whose path holds spaces an id without them, as aria-activedescendant takes no spaces, keeping it apart from the ids of other paths', () => {
    const items = [{ key: 'file:a b' }, { key: 'file:a%20b' }];
    const ids = items.map(({ key }) => activeDescendant('list-', key, items));
    assert.ok(ids.every((id) => id !== undefined && !/\s/.test(id)));
    assert.strictEqual(new Set(ids).size, 2);
  });
});
