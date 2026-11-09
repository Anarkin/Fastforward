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

  test('puts the file selected, or the ones marked, on the clipboard on Mod+C, nothing on the parent folder, and pastes on Mod+V whatever is selected', () => {
    assert.deepStrictEqual(
      paneKey(pressed('c', { ctrlKey: true }), at('a.txt')),
      { act: { kind: 'copyToClipboard', names: ['a.txt'] } },
    );
    assert.deepStrictEqual(
      paneKey(
        pressed('c', { ctrlKey: true }),
        at('a.txt', { marked: new Set(['docs', 'b.txt']) }),
      ),
      { act: { kind: 'copyToClipboard', names: ['docs', 'b.txt'] } },
    );
    assert.deepStrictEqual(
      paneKey(pressed('c', { ctrlKey: true }), at('..')),
      {},
    );
    assert.deepStrictEqual(paneKey(pressed('v', { ctrlKey: true }), at('..')), {
      act: { kind: 'paste' },
    });
  });

  test('asks for the new name of the file or folder selected on Shift+F6, of no other marked, and of nothing on the parent folder', () => {
    const rename = pressed('F6', { shiftKey: true });
    assert.deepStrictEqual(
      paneKey(rename, at('a.txt', { marked: new Set(['b.txt']) })),
      { act: { kind: 'rename', name: 'a.txt' } },
    );
    assert.deepStrictEqual(paneKey(rename, at('docs')), {
      act: { kind: 'rename', name: 'docs' },
    });
    assert.deepStrictEqual(paneKey(rename, at('..')), {});
  });

  test('asks how to pack the file selected, or the ones marked, on Alt+F5, and nothing on the parent folder', () => {
    const pack = pressed('F5', { altKey: true });
    assert.deepStrictEqual(paneKey(pack, at('a.txt')), {
      act: { kind: 'pack', names: ['a.txt'] },
    });
    assert.deepStrictEqual(
      paneKey(pack, at('a.txt', { marked: new Set(['docs', 'b.txt']) })),
      { act: { kind: 'pack', names: ['docs', 'b.txt'] } },
    );
    assert.deepStrictEqual(paneKey(pack, at('..')), {});
  });

  test('tests the archive selected, or the ones marked, on Alt+Shift+F9, and nothing on the parent folder', () => {
    const testing = pressed('F9', { altKey: true, shiftKey: true });
    assert.deepStrictEqual(paneKey(testing, at('a.txt')), {
      act: { kind: 'test', names: ['a.txt'] },
    });
    assert.deepStrictEqual(
      paneKey(testing, at('a.txt', { marked: new Set(['docs', 'b.txt']) })),
      { act: { kind: 'test', names: ['docs', 'b.txt'] } },
    );
    assert.deepStrictEqual(paneKey(testing, at('..')), {});
  });

  test('asks for a new folder on F7, whatever is selected', () => {
    assert.deepStrictEqual(paneKey(pressed('F7'), at('a.txt')), {
      act: { kind: 'newFolder' },
    });
    assert.deepStrictEqual(paneKey(pressed('F7'), at('..')), {
      act: { kind: 'newFolder' },
    });
  });

  test('opens the menu of the selection on Shift+F10 or the Menu key, of the folder shown on .., or of the folder shown with nothing selected', () => {
    assert.deepStrictEqual(
      paneKey(pressed('F10', { shiftKey: true }), at('a.txt')),
      { act: { kind: 'menu', key: 'a.txt' } },
    );
    assert.deepStrictEqual(paneKey(pressed('ContextMenu'), at('docs')), {
      act: { kind: 'menu', key: 'docs' },
    });
    assert.deepStrictEqual(
      paneKey(pressed('F10', { shiftKey: true }), at('..')),
      { act: { kind: 'menu', key: '..' } },
    );
    assert.deepStrictEqual(paneKey(pressed('ContextMenu'), at('gone')), {
      act: { kind: 'menu', key: undefined },
    });
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

  test('goes up on Backspace while there is a parent and opens a folder on Enter, leaving the keys alone where they do nothing, and opens a file with 7-Zip on Shift+Enter, as the menu does, but no folder', () => {
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
    const withSevenZip = pressed('Enter', { shiftKey: true });
    assert.deepStrictEqual(paneKey(withSevenZip, at('a.txt')), {
      act: { kind: 'enterArchive', name: 'a.txt' },
    });
    assert.deepStrictEqual(paneKey(withSevenZip, at('repo')), {});
    assert.deepStrictEqual(paneKey(withSevenZip, at('docs')), {});
    assert.deepStrictEqual(paneKey(withSevenZip, at('..')), {});
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

  test('goes on marking the rows it passes while Shift and an arrow are held down', () => {
    assert.deepStrictEqual(
      paneKey(
        pressed('ArrowDown', { shiftKey: true, repeat: true }),
        at('repo', { marked: new Set(['docs']) }),
      ),
      {
        act: { kind: 'mark', keys: ['repo'], marked: true, select: 'a.txt' },
      },
    );
    assert.deepStrictEqual(
      paneKey(
        pressed('ArrowUp', { shiftKey: true, repeat: true }),
        at('b.txt'),
      ),
      {
        act: { kind: 'mark', keys: ['b.txt'], marked: true, select: 'a.txt' },
      },
    );
  });

  test('marks every row but the parent folder on Mod+A, whatever is selected, and unmarks them all once every one is marked', () => {
    const all = ['docs', 'repo', 'a.txt', 'b.txt'];
    const markAll = pressed('a', { ctrlKey: true });
    assert.deepStrictEqual(paneKey(markAll, at('..')), {
      act: { kind: 'mark', keys: all, marked: true, select: '..' },
    });
    assert.deepStrictEqual(
      paneKey(markAll, at('a.txt', { marked: new Set(['docs', 'a.txt']) })),
      { act: { kind: 'mark', keys: all, marked: true, select: 'a.txt' } },
    );
    assert.deepStrictEqual(
      paneKey(markAll, at('a.txt', { marked: new Set(all) })),
      { act: { kind: 'mark', keys: all, marked: false, select: 'a.txt' } },
    );
    assert.deepStrictEqual(
      paneKey(markAll, at('..', { rows: rows.slice(0, 1) })),
      {},
    );
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
