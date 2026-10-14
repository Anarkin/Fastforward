import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { changeKind, changeTitle, renamedPath } from '../../webview/fileStatus';
import { fileChange as change } from '../fixtures';

suite('File status', () => {
  test('sorts every status into the four kinds GitHub shows, a copy or an untracked file being new and a type change or an unknown status a modification', () => {
    assert.deepStrictEqual(
      (['A', 'U', 'C', 'M', 'T', '?', 'D', 'R'] as const).map((status) =>
        changeKind(change('a.ts', { status })),
      ),
      [
        'added',
        'added',
        'added',
        'modified',
        'modified',
        'modified',
        'deleted',
        'renamed',
      ],
    );
  });

  test('shortens a rename to what changed between the folders both paths share, as git does', () => {
    assert.deepStrictEqual(
      [
        ['samples/old-name.txt', 'samples/new-name.txt'],
        ['moved/to-folder.txt', 'elsewhere/to-folder.txt'],
        [
          'showcase/everything/folder/one.txt',
          'showcase/everything/renamed-folder/one.txt',
        ],
        ['a/b/c.txt', 'a/c.txt'],
        ['a/c.txt', 'a/b/c.txt'],
        ['moved/Case.txt', 'moved/CASE.txt'],
        ['old.txt', 'new.txt'],
        ['ab/c.txt', 'b/c.txt'],
      ].map(([from, to]) => renamedPath(from, to)),
      [
        'samples/{old-name.txt → new-name.txt}',
        '{moved → elsewhere}/to-folder.txt',
        'showcase/everything/{folder → renamed-folder}/one.txt',
        'a/{b → }/c.txt',
        'a/{ → b}/c.txt',
        'moved/{Case.txt → CASE.txt}',
        'old.txt → new.txt',
        '{ab → b}/c.txt',
      ],
    );
  });

  test('names the status and both paths of a rename in the tooltip', () => {
    assert.strictEqual(
      changeTitle(change('new.ts', { status: 'R', oldPath: 'old.ts' })),
      'Renamed: old.ts → new.ts',
    );
    assert.strictEqual(
      changeTitle(change('gone.ts', { status: 'D' })),
      'Deleted: gone.ts',
    );
  });
});
