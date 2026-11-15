import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  collapseThreshold,
  deferredChanges,
  includedChanges,
  patchByteBudget,
  patchLineBudget,
  patchPathBudget,
} from '../../../../../tools/git/shared/patchBudget';
import { fileChange } from '../../../../helpers/gitValues';

const filesChanging = (...counts: readonly number[]) =>
  counts.map((insertions, index) =>
    fileChange(`${index}.ts`, { insertions, deletions: 0 }),
  );

suite('Large files in a commit diff', () => {
  const large = fileChange('large.json', {
    insertions: collapseThreshold,
    deletions: 1,
  });

  test('defers each file over 25000 changed lines, and every file once the diff would grow past its budget, as the page would freeze laying them out', () => {
    const fitting = [];
    for (let left = patchLineBudget - 3; left > 0;) {
      const insertions = Math.min(collapseThreshold, left);
      fitting.push(
        fileChange(`${fitting.length}.ts`, { insertions, deletions: 0 }),
      );
      left -= insertions;
    }
    const files = [
      ...fitting,
      large,
      fileChange('a.ts', { insertions: collapseThreshold, deletions: 0 }),
      fileChange('b.ts', { insertions: 0, deletions: 0 }),
    ];
    assert.deepStrictEqual(
      [...deferredChanges(files)],
      ['large.json', 'a.ts', 'b.ts'],
    );
    assert.deepStrictEqual(
      [...deferredChanges([...fitting, large, fileChange('b.ts')])],
      ['large.json'],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(25_000, 1))],
      ['1.ts'],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(25_001, 1))],
      ['0.ts'],
    );
  });

  test('keeps a diff of exactly the 25000 changed lines of its budget whole, deferring from the file that passes it', () => {
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(20_000, 5_000, 0))],
      [],
    );
    assert.deepStrictEqual(
      [...deferredChanges(filesChanging(20_000, 5_001, 0))],
      ['1.ts', '2.ts'],
    );
  });

  test('defers every file once the paths of the rest would make too long a command line', () => {
    const long = 'x'.repeat(patchPathBudget / 2);
    const files = [
      fileChange(`${long}1`, { oldPath: 'a' }),
      fileChange('b'),
      fileChange(`${long}2`),
      fileChange('c'),
    ];
    assert.deepStrictEqual([...deferredChanges(files)], [`${long}2`, 'c']);
  });

  test('keeps the paths of a diff of exactly the 16000 characters of its budget whole, deferring from the file that passes it', () => {
    const half = 8_000;
    const files = (last: string) => [
      fileChange('x'.repeat(half)),
      fileChange('y'.repeat(half - 2), { oldPath: 'z' }),
      fileChange(last),
    ];
    assert.deepStrictEqual([...deferredChanges(files('c'))], []);
    assert.deepStrictEqual(
      [...deferredChanges([...files('cc'), fileChange('d')])],
      ['cc', 'd'],
    );
  });

  test('defers every file once the old and new text of the files changed would pass the bytes of its budget, however few lines they have', () => {
    const files = [
      fileChange('bundle.min.js', { bytes: patchByteBudget / 2 }),
      fileChange('a.ts', { bytes: 100 }),
      fileChange('bundle.js.map', { bytes: patchByteBudget / 2 }),
      fileChange('b.ts'),
    ];
    assert.deepStrictEqual(
      [...deferredChanges(files)],
      ['bundle.js.map', 'b.ts'],
    );
  });

  test('keeps a diff of exactly the 16 MB of its budget whole, deferring from the file that passes it', () => {
    const half = 8 * 1024 * 1024;
    const files = (bytes: number) => [
      fileChange('a.min.js', { bytes: half }),
      fileChange('b.min.js', { bytes }),
      fileChange('c.ts'),
    ];
    assert.deepStrictEqual([...deferredChanges(files(half))], []);
    assert.deepStrictEqual(
      [...deferredChanges(files(half + 1))],
      ['b.min.js', 'c.ts'],
    );
  });

  test('counts toward the bytes of its budget only the files it keeps, not one left out for its lines', () => {
    const files = [
      fileChange('huge.json', {
        insertions: 0,
        deletions: 0,
        uncounted: true,
        bytes: patchByteBudget,
      }),
      fileChange('a.ts', { bytes: patchByteBudget }),
      fileChange('b.ts'),
    ];
    assert.deepStrictEqual([...deferredChanges(files)], ['huge.json']);
  });

  test('passes git no paths when it leaves out no file, and only the paths of the files it keeps, both of a rename, once it leaves out any', () => {
    const files = [
      fileChange('a.ts'),
      fileChange('new.ts', { status: 'R', oldPath: 'old.ts' }),
    ];
    assert.strictEqual(includedChanges(files), undefined);
    assert.deepStrictEqual(includedChanges([...files, large]), [
      'a.ts',
      'old.ts',
      'new.ts',
    ]);
  });

  test('passes git the paths of the files it keeps rather than those it leaves out, so the command line stays under the 32767 characters Windows allows', () => {
    const files = Array.from({ length: 4000 }, (_, index) =>
      fileChange(`a b/${index}.ts`, {
        status: 'R',
        oldPath: `c d/${index}.ts`,
      }),
    );
    const included = includedChanges(files) ?? [];
    assert.ok(included.length > 0);
    assert.ok(included.map((file) => `"${file}"`).join(' ').length < 32_767);
  });
});
