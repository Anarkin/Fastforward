import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { zipped } from './fakeArchives';
import { commander, tab } from './commanderFixtures';
import { at, file, root } from './entryFixtures';

export function withCopiesFolder(made: (folder: string) => void): void {
  let copiesFolder = '';

  beforeEach(() => {
    copiesFolder = tempFolder('archive-copies');
    made(copiesFolder);
  });

  afterEach(() => {
    for (const copy of fs.readdirSync(copiesFolder, {
      recursive: true,
      encoding: 'utf8',
    })) {
      fs.chmodSync(path.join(copiesFolder, copy), 0o777);
    }
    removeFolder(copiesFolder);
  });
}

export const commanderInArchive = async (copiesFolder: string) => {
  const made = commander({ [root]: [file('a.zip'), file('notes.txt')] });
  made.archived.set(at('a.zip'), zipped);
  made.copies.folder = copiesFolder;
  await made.tool.show(made.page, tab);
  await made.send({
    type: 'enterArchive',
    tab: '1',
    side: 'right',
    name: 'a.zip',
  });
  return made;
};
