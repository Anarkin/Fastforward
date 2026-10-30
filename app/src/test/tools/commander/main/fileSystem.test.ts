import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  fileSystemFor,
  type FileSystem,
} from '../../../../tools/commander/main/fileSystem';
import { nodeFileSystem } from '../../../../tools/commander/main/nodeFileSystem';
import type { Entry } from '../../../../tools/commander/shared/protocol';
import { removeFolder, tempFolder } from '../../../repositories';

const windows = process.platform === 'win32';

const implementations: readonly (readonly [
  string,
  () => Promise<FileSystem>,
])[] = [
  ['Node', () => Promise.resolve(nodeFileSystem)],
  ...(windows ? [['Windows', () => fileSystemFor('win32')] as const] : []),
];

function hide(file: string): void {
  if (windows) {
    execFileSync('attrib', ['+h', file]);
  }
}

function byName(entries: readonly Entry[]): Entry[] {
  return entries.toSorted((a, b) => a.name.localeCompare(b.name));
}

const modified = new Date('2026-05-21T10:48:00Z');

suite.each(implementations)('The file system of %s', (name, make) => {
  let folder: string;
  let fileSystem: FileSystem;

  beforeEach(async () => {
    folder = tempFolder('file-system');
    fileSystem = await make();
  });

  afterEach(() => removeFolder(folder));

  test('lists the files with their size and time, and the folders without a size, leaving out . and ..', async () => {
    fs.writeFileSync(path.join(folder, 'notes.txt'), '12345');
    fs.utimesSync(path.join(folder, 'notes.txt'), modified, modified);
    fs.mkdirSync(path.join(folder, 'src'));
    fs.utimesSync(path.join(folder, 'src'), modified, modified);

    assert.deepStrictEqual(byName(await fileSystem.list(folder)), [
      {
        name: 'notes.txt',
        folder: false,
        link: false,
        hidden: false,
        size: 5,
        modified: modified.getTime(),
      },
      {
        name: 'src',
        folder: true,
        link: false,
        hidden: false,
        size: undefined,
        modified: modified.getTime(),
      },
    ]);
  });

  test('lists nothing in an empty folder', async () => {
    assert.deepStrictEqual(await fileSystem.list(folder), []);
  });

  test('marks the hidden folders, by their attribute on Windows and by a leading dot elsewhere', async () => {
    const hiddenName = name === 'Windows' ? 'cache' : '.cache';
    fs.mkdirSync(path.join(folder, hiddenName));
    hide(path.join(folder, hiddenName));
    fs.writeFileSync(path.join(folder, 'shown.txt'), '');

    assert.deepStrictEqual(
      byName(await fileSystem.list(folder)).map((entry) => [
        entry.name,
        entry.hidden,
      ]),
      [
        [hiddenName, true],
        ['shown.txt', false],
      ],
    );
  });

  test('lists a link to a folder as a folder that is a link', async () => {
    fs.mkdirSync(path.join(folder, 'target'));
    fs.symlinkSync(
      path.join(folder, 'target'),
      path.join(folder, 'linked'),
      'junction',
    );

    const linked = (await fileSystem.list(folder)).find(
      (entry) => entry.name === 'linked',
    );

    assert.deepStrictEqual(
      linked && { folder: linked.folder, link: linked.link },
      { folder: true, link: true },
    );
  });

  test('lists every entry of a folder too large to read in one go, with names in any script', async () => {
    const names = Array.from(
      { length: 3000 },
      (_, index) =>
        `file ${String(index).padStart(4, '0')} ünïcødé 文件 🙂.txt`,
    );
    for (const each of names) {
      fs.writeFileSync(path.join(folder, each), '');
    }

    assert.deepStrictEqual(
      (await fileSystem.list(folder)).map((entry) => entry.name).toSorted(),
      names,
    );
  });

  test('lists a folder whose path is longer than Windows allowed once', async () => {
    let deep = folder;
    while (deep.length < 300) {
      deep = path.join(deep, 'a-long-folder-name-to-pass-the-limit');
    }
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'deep.txt'), 'deep');

    assert.deepStrictEqual(
      (await fileSystem.list(deep)).map((entry) => [entry.name, entry.size]),
      [['deep.txt', 4]],
    );
  });

  test('fails as Node does for a folder that is missing', async () => {
    await assert.rejects(fileSystem.list(path.join(folder, 'missing')), {
      code: 'ENOENT',
    });
  });

  test('fails as Node does for a file', async () => {
    fs.writeFileSync(path.join(folder, 'file.txt'), '');

    await assert.rejects(fileSystem.list(path.join(folder, 'file.txt')), {
      code: 'ENOTDIR',
    });
  });
});

suite('The drives', () => {
  test.skipIf(!windows)(
    'are the roots of the drive letters on Windows, the system drive among them',
    async () => {
      const drives = await (await fileSystemFor('win32')).drives();

      assert.ok(
        drives.includes(`${process.env.SystemDrive ?? 'C:'}\\`),
        drives.join(),
      );
      assert.ok(drives.every((drive) => /^[A-Z]:\\$/.test(drive)));
    },
  );

  test('are none elsewhere, where everything is under one root', async () => {
    assert.deepStrictEqual(await (await fileSystemFor('linux')).drives(), []);
    assert.deepStrictEqual(await (await fileSystemFor('darwin')).drives(), []);
  });
});
