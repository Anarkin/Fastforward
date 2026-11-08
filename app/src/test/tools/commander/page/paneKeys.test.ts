import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsOf } from '../../../../tools/commander/page/listing';
import {
  paneKey,
  type PaneKeys,
} from '../../../../tools/commander/page/paneKeys';
import { keyPress } from '../../../fixtures';

const entry = (name: string, folder = false) => ({
  name,
  folder,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

const rows = rowsOf(
  [entry('docs', true), entry('repo', true), entry('a.txt'), entry('b.txt')],
  true,
  true,
  { column: 'name', descending: false, groupByColor: false },
  new Set(['repo']),
);

const at = (key: string, shown: Partial<PaneKeys> = {}): PaneKeys => ({
  rows,
  selected: key,
  selectedIndex: rows.findIndex((row) => row.key === key),
  marked: undefined,
  filtering: false,
  reading: false,
  parent: true,
  tiled: false,
  across: 1,
  visible: { first: 0, last: rows.length - 1 },
  ...shown,
});

const pressed = (key: string, extra: Parameters<typeof keyPress>[1] = {}) =>
  keyPress(key, extra);

suite('Commander keys', () => {
  test('lays out the rows the keys are tried on, the parent folder first and the folders before the files', () => {
    assert.deepStrictEqual(
      rows.map((row) => row.key),
      ['..', 'docs', 'repo', 'a.txt', 'b.txt'],
    );
  });

  test('deletes the file selected, or the ones marked, to the bin or for good, and nothing on the parent folder', () => {
    assert.deepStrictEqual(paneKey(pressed('Delete'), at('a.txt')), {
      act: { kind: 'delete', names: ['a.txt'], permanently: false },
    });
    assert.deepStrictEqual(
      paneKey(
        pressed('Delete', { shiftKey: true }),
        at('a.txt', { marked: new Set(['a.txt', 'b.txt']) }),
      ),
      { act: { kind: 'delete', names: ['a.txt', 'b.txt'], permanently: true } },
    );
    assert.deepStrictEqual(paneKey(pressed('Delete'), at('..')), {});
  });

  test('copies the file selected, or the ones marked, to the other side on F5, moves them on F6, and does nothing on the parent folder', () => {
    assert.deepStrictEqual(paneKey(pressed('F5'), at('a.txt')), {
      act: { kind: 'transfer', names: ['a.txt'], move: false },
    });
    assert.deepStrictEqual(
      paneKey(
        pressed('F6'),
        at('a.txt', { marked: new Set(['docs', 'b.txt']) }),
      ),
      { act: { kind: 'transfer', names: ['docs', 'b.txt'], move: true } },
    );
    assert.deepStrictEqual(paneKey(pressed('F5'), at('..')), {});
  });

  test('asks for a new folder on F7, whatever is selected', () => {
    assert.deepStrictEqual(paneKey(pressed('F7'), at('a.txt')), {
      act: { kind: 'newFolder' },
    });
    assert.deepStrictEqual(paneKey(pressed('F7'), at('..')), {
      act: { kind: 'newFolder' },
    });
  });

  test('opens the menu of the system for the selection, extended with Shift', () => {
    assert.deepStrictEqual(
      paneKey(pressed('F10', { shiftKey: true }), at('a.txt')),
      {
        act: { kind: 'menu', names: ['a.txt'], extended: false },
      },
    );
    assert.deepStrictEqual(
      paneKey(pressed('F10', { shiftKey: true }), at('..')),
      {},
    );
  });

  test('starts the filter on Alt and a letter, opens it on Mod+F, and closes it on Escape only while it is open', () => {
    assert.deepStrictEqual(
      paneKey(pressed('b', { altKey: true, code: 'KeyB' }), at('a.txt')),
      { act: { kind: 'filterLetter', letter: 'b' } },
    );
    assert.deepStrictEqual(
      paneKey(pressed('f', { ctrlKey: true }), at('a.txt')),
      {
        act: { kind: 'openFilter' },
      },
    );
    assert.strictEqual(paneKey(pressed('Escape'), at('a.txt')), undefined);
    assert.deepStrictEqual(
      paneKey(pressed('Escape'), at('a.txt', { filtering: true })),
      { act: { kind: 'stopFiltering' } },
    );
  });

  test('stops the reading of a flat side on Escape while it reads, once the filter is closed', () => {
    assert.deepStrictEqual(
      paneKey(pressed('Escape'), at('a.txt', { reading: true })),
      { act: { kind: 'stopReading' } },
    );
    assert.deepStrictEqual(
      paneKey(
        pressed('Escape'),
        at('a.txt', { reading: true, filtering: true }),
      ),
      { act: { kind: 'stopFiltering' } },
    );
  });

  test('switches sides on Tab and compares on Shift+F3', () => {
    assert.deepStrictEqual(paneKey(pressed('Tab'), at('a.txt')), {
      act: { kind: 'switchSide' },
    });
    assert.deepStrictEqual(
      paneKey(pressed('F3', { shiftKey: true }), at('a.txt')),
      {
        act: { kind: 'compare' },
      },
    );
  });

  test('views a file on F3 but no folder, and opens a row on the other side', () => {
    assert.deepStrictEqual(paneKey(pressed('F3'), at('a.txt')), {
      act: { kind: 'view', name: 'a.txt' },
    });
    assert.deepStrictEqual(paneKey(pressed('F3'), at('docs')), {});
    assert.deepStrictEqual(
      paneKey(pressed('ArrowRight', { ctrlKey: true }), at('docs')),
      { act: { kind: 'openOnSide', side: 'right', name: 'docs' } },
    );
  });

  test('goes up on Backspace while there is a parent, opens a folder on Enter, and a repository in git on Shift+Enter, leaving the keys alone where they do nothing', () => {
    assert.deepStrictEqual(paneKey(pressed('Backspace'), at('a.txt')), {
      act: { kind: 'open', name: '..' },
    });
    assert.deepStrictEqual(
      paneKey(pressed('Backspace'), at('a.txt', { parent: false })),
      {},
    );
    assert.deepStrictEqual(paneKey(pressed('Enter'), at('docs')), {
      act: { kind: 'open', name: 'docs' },
    });
    assert.deepStrictEqual(
      paneKey(pressed('Enter', { shiftKey: true }), at('repo')),
      { act: { kind: 'openRepository', name: 'repo' } },
    );
    assert.strictEqual(
      paneKey(pressed('Enter', { shiftKey: true }), at('docs')),
      undefined,
    );
  });

  test('marks the rows it passes with Shift and the arrows, as the first of them is marked or not, and marks one and moves down on Space', () => {
    assert.deepStrictEqual(
      paneKey(pressed('ArrowDown', { shiftKey: true }), at('docs')),
      {
        act: {
          kind: 'mark',
          keys: ['docs'],
          marked: true,
          select: 'repo',
        },
      },
    );
    assert.deepStrictEqual(
      paneKey(
        pressed(' ', { code: 'Space' }),
        at('a.txt', { marked: new Set(['a.txt']) }),
      ),
      {
        act: { kind: 'mark', keys: ['a.txt'], marked: false, select: 'b.txt' },
      },
    );
    assert.deepStrictEqual(
      paneKey(pressed(' ', { code: 'Space' }), at('none')),
      {},
    );
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      assert.deepStrictEqual(
        paneKey(pressed(key, { shiftKey: true }), at('a.txt')),
        {},
        key,
      );
    }
  });

  test('moves the selection with the arrows, across the tiles only while they are shown, and leaves other keys alone', () => {
    assert.deepStrictEqual(paneKey(pressed('ArrowDown'), at('a.txt')), {
      act: { kind: 'select', key: 'b.txt' },
    });
    assert.strictEqual(paneKey(pressed('ArrowRight'), at('a.txt')), undefined);
    assert.deepStrictEqual(
      paneKey(pressed('ArrowRight'), at('docs', { tiled: true, across: 2 })),
      { act: { kind: 'select', key: 'repo' } },
    );
    assert.strictEqual(paneKey(pressed('x'), at('a.txt')), undefined);
  });
});
