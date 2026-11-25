import { plainOf } from '../../../../lib/shared/sentences';
import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  changeKind,
  changeMark,
  changeMeaning,
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

  test('marks each file with the letter of its status before its name, as git writes it, N for a file git does not track, as git keeps U for a conflict, ! for a file in conflict, @ after it for a symbolic link, and two blanks for an unchanged file, so every name starts in one column', () => {
    assert.deepStrictEqual(
      (['A', 'U', 'C', 'M', 'T', '?', 'D', 'R'] as const).map((status) =>
        changeMark(change('a.ts', { status })),
      ),
      ['A ', 'N ', 'C ', 'M ', 'T ', '? ', 'D ', 'R '],
    );
    assert.deepStrictEqual(
      [
        changeMark(change('a.ts', { status: 'M', conflict: true })),
        changeMark(change('a.ts', { status: 'A', link: true })),
        changeMark(change('a.ts', { status: 'M', conflict: true, link: true })),
        changeMark(undefined),
      ],
      ['! ', 'A@', '!@', '  '],
    );
  });

  test('sorts a file in conflict apart from the four kinds, whatever git calls its change, so it is drawn in the color of a conflict', () => {
    assert.deepStrictEqual(
      [
        changeKind(change('a.ts', { status: 'M', conflict: true })),
        changeKind(change('a.ts', { status: '?', conflict: true })),
      ],
      ['conflict', 'conflict'],
    );
  });

  test('tells what the mark of a file means in the words alone, as its tooltip shows over the mark itself, and names the path of the file apart', () => {
    assert.deepStrictEqual(
      [
        plainOf(changeMeaning(change('src/a.ts', { status: 'M' }))),
        plainOf(changeMeaning(change('src/a.ts', { status: 'U' }))),
        plainOf(changeMeaning(change('src/a.ts', { status: 'A', link: true }))),
        plainOf(
          changeMeaning(change('src/a.ts', { status: 'M', conflict: true })),
        ),
        plainOf(
          changeMeaning(
            change('src/a.ts', { status: 'M', conflict: true, link: true }),
          ),
        ),
      ],
      [
        'Modified',
        'Untracked',
        'Added symbolic link',
        'In conflict',
        'Symbolic link in conflict',
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

  test('names a symbolic link as one in the tooltip of its mark, with each status', () => {
    assert.deepStrictEqual(
      (['A', 'M', 'D', 'T', 'U', 'R'] as const).map((status) =>
        plainOf(changeMeaning(change('l', { status, link: true }))),
      ),
      [
        'Added symbolic link',
        'Modified symbolic link',
        'Deleted symbolic link',
        'Changed to a symbolic link',
        'Untracked symbolic link',
        'Renamed symbolic link',
      ],
    );
  });
});
