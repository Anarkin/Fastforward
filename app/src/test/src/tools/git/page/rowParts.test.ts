import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fileColorsOf, noFileColors } from '../../../../../lib/page/fileColors';
import { knownWith } from '../../../../../lib/page/pathLooks';
import { rowParts } from '../../../../../tools/git/page/rowParts';

const folder = { hidden: false, file: false, executable: false };

const plain = { known: new Map(), fileColors: noFileColors, dotHides: false };

suite('Parts of a row of the files', () => {
  test('names each folder and file of a row by its whole path, in the separators of the folder of the worktree, as a right click opens the menu of that path', () => {
    const { parts } = rowParts('src/test', false, 'C:\\repo', plain);
    assert.deepStrictEqual(
      parts.map(({ name, at, whole, file }) => [name, at, whole, file]),
      [
        ['src', 0, 'C:\\repo\\src', false],
        ['test', 4, 'C:\\repo\\src\\test', false],
      ],
    );
  });

  test('colors a file as the commander lists it, by its kind and its looks in the folder of the worktree it is in, a hidden folder of a merged row too', () => {
    const known = knownWith(new Map(), [
      {
        path: '/repo/src/test/a.ts',
        parts: [
          folder,
          folder,
          folder,
          { ...folder, hidden: true },
          { hidden: true, file: true, executable: false },
        ],
      },
    ]);
    const shown = (name: string, file: boolean, root: string) =>
      rowParts(name, file, root, {
        known,
        fileColors: fileColorsOf([
          { extensions: ['ts'], colors: { light: 'blue', dark: 'blue' } },
        ]),
        dotHides: false,
      });
    assert.deepStrictEqual(
      shown('a.ts', true, '/repo/src/test').parts.map(({ color, hidden }) => [
        color,
        hidden,
      ]),
      [['light-dark(blue, blue)', true]],
    );
    const merged = shown('src/test', false, '/repo');
    assert.deepStrictEqual(
      merged.parts.map(({ name, hidden }) => [name, hidden]),
      [
        ['src', false],
        ['test', true],
      ],
    );
    assert.strictEqual(merged.unknown, undefined);
  });

  test('asks for the looks of a whole path it knows no part of, and of none that is not whole', () => {
    assert.strictEqual(
      rowParts('a.ts', true, '/repo/src', plain).unknown,
      '/repo/src/a.ts',
    );
    assert.strictEqual(
      rowParts('a.ts', true, undefined, plain).unknown,
      undefined,
    );
  });
});
