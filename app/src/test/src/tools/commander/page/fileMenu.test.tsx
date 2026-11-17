import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { MenuTarget } from '../../../../../lib/page/fileMenu';
import { menuTargetOf } from '../../../../../tools/commander/page/fileMenu';
import { rowsOf } from '../../../../../tools/commander/page/listing';

const entry = (name: string, folder = false) => ({
  name,
  folder,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

const rows = rowsOf(
  [
    entry('app', true),
    entry('docs', true),
    entry('photo.png'),
    entry('logo.svg'),
    entry('notes.txt'),
  ],
  true,
  true,
  { column: 'name', descending: false, groupByColor: false },
  new Set(['app']),
);

const folderShown = (inRepository: boolean): MenuTarget => ({
  kind: 'folder',
  inRepository,
});

suite('Commander file menu', () => {
  test('is on the folder shown for .. or the empty space, on the folder or file pointed at, or on the marked items when the one pointed at is marked', () => {
    assert.deepStrictEqual(
      menuTargetOf(rows, undefined, undefined, false),
      folderShown(false),
    );
    assert.deepStrictEqual(
      menuTargetOf(rows, '..', undefined, true),
      folderShown(true),
    );
    assert.deepStrictEqual(menuTargetOf(rows, 'docs', undefined, false), {
      kind: 'folder',
      name: 'docs',
      inRepository: false,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'photo.png', undefined, false), {
      kind: 'file',
      name: 'photo.png',
      image: true,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'notes.txt', undefined, false), {
      kind: 'file',
      name: 'notes.txt',
      image: false,
    });
    assert.deepStrictEqual(
      menuTargetOf(rows, 'docs', new Set(['docs', 'notes.txt']), false),
      { kind: 'items', names: ['docs', 'notes.txt'] },
    );
    assert.deepStrictEqual(
      menuTargetOf(rows, 'docs', new Set(['notes.txt']), false),
      { kind: 'folder', name: 'docs', inRepository: false },
    );
    assert.strictEqual(menuTargetOf(rows, 'gone', undefined, false), undefined);
  });

  test('takes a folder to be in a repository when it is one, or the folder shown is in one', () => {
    assert.deepStrictEqual(menuTargetOf(rows, 'app', undefined, false), {
      kind: 'folder',
      name: 'app',
      inRepository: true,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'docs', undefined, true), {
      kind: 'folder',
      name: 'docs',
      inRepository: true,
    });
  });
});
