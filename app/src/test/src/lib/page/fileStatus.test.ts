import { plainOf } from '../../../../lib/shared/sentences';
import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  changeKind,
  changeTitle,
  renamedPath,
} from '../../../../lib/page/fileStatus';
import { fileChange as change } from '../../../helpers/gitValues';
import type { Sentence } from '../../../../lib/shared/sentences';

const textOf = (said: Sentence) =>
  typeof said === 'string'
    ? said
    : said
        .map((part) => (typeof part === 'string' ? part : part.name))
        .join('');

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
      ].map(([from, to]) => textOf(renamedPath(from, to))),
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

  test('names each piece of a rename as the files and folders it is, in the folder of the worktree it is in, so they are drawn as the parts of a path', () => {
    assert.deepStrictEqual(renamedPath('a/b/c.txt', 'a/c.txt', 'C:\\repo'), [
      { name: 'a/', path: 'folder', root: 'C:\\repo' },
      '{',
      { name: 'b', path: 'folder', root: 'C:\\repo\\a\\' },
      ' → }/',
      { name: 'c.txt', path: 'file', root: 'C:\\repo\\a\\' },
    ]);
    assert.deepStrictEqual(
      renamedPath('lib/old.ts', 'components/diff/new.ts', '/repo'),
      [
        { name: 'lib/old.ts', path: 'file', root: '/repo' },
        ' → ',
        { name: 'components/diff/new.ts', path: 'file', root: '/repo' },
      ],
    );
    assert.deepStrictEqual(renamedPath('docs/old.md', 'docs/new.md'), [
      { name: 'docs/', path: 'folder' },
      '{',
      { name: 'old.md', path: 'file', root: 'docs/' },
      ' → ',
      { name: 'new.md', path: 'file', root: 'docs/' },
      '}',
    ]);
  });

  test('keeps what two whole paths of Windows share outside the braces too, as it does for those of git', () => {
    assert.deepStrictEqual(
      [
        ['C:\\work\\after.txt', 'C:\\work\\before.txt'],
        ['C:\\a\\x.txt', 'C:\\b\\x.txt'],
      ].map(([from, to]) => textOf(renamedPath(from ?? '', to ?? ''))),
      ['C:\\work\\{after.txt → before.txt}', 'C:\\{a → b}\\x.txt'],
    );
  });

  test('names the status and both paths of a rename in the tooltip, each path as a file of its repository, so a tooltip draws them as every path is drawn', () => {
    assert.deepStrictEqual(
      changeTitle(change('new.ts', { status: 'R', oldPath: 'old.ts' }), '/r'),
      [
        'Renamed: ',
        { name: 'old.ts', path: 'file', root: '/r' },
        ' → ',
        { name: 'new.ts', path: 'file', root: '/r' },
      ],
    );
    assert.deepStrictEqual(changeTitle(change('gone.ts', { status: 'D' })), [
      'Deleted: ',
      { name: 'gone.ts', path: 'file' },
    ]);
  });

  test('names a symbolic link as one in the tooltip, with each status', () => {
    assert.deepStrictEqual(
      (['A', 'M', 'D', 'T', 'U'] as const).map((status) =>
        plainOf(changeTitle(change('l', { status, link: true }))),
      ),
      [
        'Added symbolic link: "l"',
        'Modified symbolic link: "l"',
        'Deleted symbolic link: "l"',
        'Changed to a symbolic link: "l"',
        'Untracked symbolic link: "l"',
      ],
    );
    assert.strictEqual(
      plainOf(
        changeTitle(change('b', { status: 'R', oldPath: 'a', link: true })),
      ),
      'Renamed symbolic link: "a" → "b"',
    );
  });
});
