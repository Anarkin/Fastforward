import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { item } from './archivesFixtures';
import { ArchiveTree } from '../../../../../tools/commander/main/archiveTree';

suite('ArchiveTree', () => {
  test('lists each folder of an archive, making the folders that have no item of their own from the paths of what is inside them', () => {
    const tree = new ArchiveTree(
      [item('docs/readme.md'), item('src/app/main.ts', { size: 11 })],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.folder]),
      [
        ['docs', true],
        ['src', true],
      ],
    );
    assert.deepStrictEqual(tree.entries(['src', 'app']), [
      {
        name: 'main.ts',
        folder: false,
        link: false,
        hidden: false,
        size: 11,
        modified: 5,
      },
    ]);
    assert.strictEqual(tree.entries(['nowhere']), undefined);
    assert.deepStrictEqual(tree.item(['src'], 'app'), {
      path: 'src/app',
      encrypted: false,
    });
  });

  test('takes the item of a folder for its date over the folder made from paths, whichever comes first', () => {
    const tree = new ArchiveTree(
      [
        item('docs/readme.md'),
        item('docs', { folder: true, size: undefined, modified: 9 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(tree.entries([])?.[0], {
      name: 'docs',
      folder: true,
      link: false,
      hidden: false,
      size: 1,
      modified: 9,
    });
    assert.deepStrictEqual(
      tree.entries(['docs'])?.map((entry) => entry.name),
      ['readme.md'],
    );
  });

  test('leaves out the empty, . and .. parts of a path, as 7-Zip extracts it, keeping the path the archive names it by to extract it', () => {
    const tree = new ArchiveTree(
      [item('../evil.txt'), item('/root.txt'), item('a/./b//c.txt')],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => entry.name),
      ['evil.txt', 'root.txt', 'a'],
    );
    assert.deepStrictEqual(tree.item([], 'evil.txt'), {
      path: '../evil.txt',
      encrypted: false,
    });
    assert.deepStrictEqual(
      tree.entries(['a', 'b'])?.map((entry) => entry.name),
      ['c.txt'],
    );
  });

  test('keeps a folder over a file of its name, and the last of the items of one name, as 7-Zip extracts them', () => {
    const tree = new ArchiveTree(
      [
        item('a/inside.txt'),
        item('a'),
        item('dup.txt', { size: 1 }),
        item('dup.txt', { size: 2 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.folder, entry.size]),
      [
        ['a', true, 1],
        ['dup.txt', false, 2],
      ],
    );
  });

  test('counts the files and bytes of the items asked for, a folder by all the files under it, and says whether one of those files is encrypted', () => {
    const tree = new ArchiveTree(
      [
        item('docs/a.md', { size: 3 }),
        item('docs/deep/b.md', { size: 4, encrypted: true }),
        item('top.txt', { size: 5 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.totals([
        { inner: [], name: 'docs' },
        { inner: [], name: 'top.txt' },
      ]),
      { files: 3, bytes: 12, encrypted: true },
    );
    assert.deepStrictEqual(
      tree.totals([{ inner: ['docs', 'deep'], name: 'b.md' }]),
      { files: 1, bytes: 4, encrypted: true },
    );
    assert.deepStrictEqual(tree.totals([{ inner: [], name: 'top.txt' }]), {
      files: 1,
      bytes: 5,
      encrypted: false,
    });
  });

  test('gives each folder the size of every file under it, as the listing of the archive tells them all', () => {
    const tree = new ArchiveTree(
      [
        item('docs/a.md', { size: 3 }),
        item('docs/deep/b.md', { size: 4 }),
        item('docs/deep/unsized.bin', { size: undefined }),
        item('empty', { folder: true, size: undefined }),
        item('top.txt', { size: 5 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.size]),
      [
        ['docs', 7],
        ['empty', 0],
        ['top.txt', 5],
      ],
    );
    assert.deepStrictEqual(
      tree.entries(['docs'])?.map((entry) => [entry.name, entry.size]),
      [
        ['a.md', 3],
        ['deep', 4],
      ],
    );
  });

  test('hides by the hidden attribute on Windows, and by a leading dot elsewhere, as the folders of the system are', () => {
    const items = [
      item('.git/config'),
      item('shown.txt', { hiddenAttribute: true }),
    ];
    const hiddenOn = (platform: NodeJS.Platform) =>
      new ArchiveTree(items, platform)
        .entries([])
        ?.map((entry) => [entry.name, entry.hidden]);
    assert.deepStrictEqual(hiddenOn('win32'), [
      ['.git', false],
      ['shown.txt', true],
    ]);
    assert.deepStrictEqual(hiddenOn('darwin'), [
      ['.git', true],
      ['shown.txt', false],
    ]);
  });
});
