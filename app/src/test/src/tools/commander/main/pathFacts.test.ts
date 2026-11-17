import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pathFactsOf } from '../../../../../tools/commander/main/pathFacts';

const disk: Record<string, 'folder' | 'file'> = {
  'C:\\': 'folder',
  'C:\\Code': 'folder',
  'C:\\Code\\repo': 'folder',
  'C:\\Code\\repo\\a.txt': 'file',
  'C:\\Code\\photos.zip': 'file',
};

const facts = (file: string, gitMissing = false) =>
  pathFactsOf(
    file,
    {
      stat: (at) =>
        Promise.resolve(
          disk[at] === undefined
            ? undefined
            : { isDirectory: () => disk[at] === 'folder' },
        ),
      inRepository: (folder) =>
        Promise.resolve(folder.startsWith('C:\\Code\\repo')),
      gitMissing: () => gitMissing,
    },
    'win32',
  );

suite('Path facts', () => {
  test('tells a folder from a file on disk, and whether a folder is in a repository, for the menu of a part of a path', async () => {
    assert.deepStrictEqual(await facts('C:\\Code\\repo'), {
      kind: 'folder',
      inRepository: true,
      gitMissing: false,
    });
    assert.deepStrictEqual(await facts('C:\\Code', true), {
      kind: 'folder',
      inRepository: false,
      gitMissing: true,
    });
    assert.deepStrictEqual(await facts('C:\\Code\\repo\\a.txt'), {
      kind: 'file',
      inRepository: false,
      gitMissing: false,
    });
  });

  test('takes a path under a file to be inside an archive, and one under no file and on no disk, or not whole, to be missing', async () => {
    assert.deepStrictEqual(await facts('C:\\Code\\photos.zip\\2024\\a.jpg'), {
      kind: 'inArchive',
      inRepository: false,
      gitMissing: false,
    });
    assert.deepStrictEqual(await facts('C:\\Code\\gone\\a.txt'), {
      kind: 'missing',
      inRepository: false,
      gitMissing: false,
    });
    assert.deepStrictEqual(await facts('a.txt'), {
      kind: 'missing',
      inRepository: false,
      gitMissing: false,
    });
  });
});
