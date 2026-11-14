import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { ArchiveImages } from '../../../../../tools/commander/main/archiveImages';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  ArchiveTree,
  entryParts,
} from '../../../../../tools/commander/main/archiveTree';
import type {
  ArchiveAccess,
  OpenedArchive,
} from '../../../../../tools/commander/main/archives';

const refused = () => Promise.reject(new Error('Nothing is done here.'));

suite('Images of an archive', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('archive-images');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('reads an image from where 7-Zip took it out, leaving out the .. of its name, rather than a file outside the folder it was taken into', async () => {
    const work = path.join(folder, 'deep', 'work');
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(folder, 'mine.png'), 'a file of the user');
    const archives: ArchiveAccess = {
      open: refused,
      openInside: refused,
      usePassword: () => undefined,
      hasPassword: () => false,
      unchangeable: () => undefined,
      pack: refused,
      rename: refused,
      addFolder: refused,
      addItems: refused,
      remove: refused,
      test: refused,
      within: () => undefined,
      fileHolding: () => Promise.resolve(undefined),
      extract: (_archive, paths) => {
        for (const each of paths) {
          const taken = path.join(work, ...entryParts(each));
          fs.mkdirSync(path.dirname(taken), { recursive: true });
          fs.writeFileSync(taken, `the ${each} of the archive`);
        }
        return Promise.resolve({ kind: 'extracted', folder: work });
      },
    };
    const archive: OpenedArchive = {
      file: path.join(folder, 'a.zip'),
      version: '1',
      source: path.join(folder, 'a.zip'),
      tree: new ArchiveTree([], 'linux'),
    };
    const images = new ArchiveImages(archives);

    const read = await images.read(archive, '../../mine.png');

    assert.strictEqual(read?.toString(), 'the ../../mine.png of the archive');
  });
});
