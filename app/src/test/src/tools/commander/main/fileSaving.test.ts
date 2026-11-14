import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  NoRoomToSave,
  ReadOnlyFile,
  saveFile,
} from '../../../../../tools/commander/main/fileSaving';
import { removeFolder, tempFolder } from '../../../../support/repositories';

const bytes = (text: string) => new TextEncoder().encode(text);

function linksMade(): boolean {
  const folder = tempFolder('links');
  try {
    fs.writeFileSync(path.join(folder, 'target'), '');
    fs.symlinkSync(path.join(folder, 'target'), path.join(folder, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    removeFolder(folder);
  }
}

const windows = process.platform === 'win32';
const superUser = process.getuid?.() === 0;

suite('Saving a file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('saving');
    file = path.join(folder, 'notes.txt');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('replaces a file with the new bytes through a file of its own beside it, leaving nothing else behind', async () => {
    fs.writeFileSync(file, 'old text that is longer');
    assert.strictEqual(await saveFile(file, bytes('new')), 'replaced');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
    assert.deepStrictEqual(fs.readdirSync(folder), ['notes.txt']);
  });

  test('makes a file that is not there yet', async () => {
    assert.strictEqual(await saveFile(file, bytes('made')), 'created');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'made');
    assert.deepStrictEqual(fs.readdirSync(folder), ['notes.txt']);
  });

  test('leaves the files beside it alone, those named as a temporary file of it might be too', async () => {
    fs.writeFileSync(file, 'old');
    const beside = [
      'notes.txt.tmp',
      '.notes.txt.tmp',
      '~notes.txt',
      'notes.txt~',
    ];
    for (const name of beside) {
      fs.writeFileSync(path.join(folder, name), name);
    }
    await saveFile(file, bytes('new'));
    for (const name of beside) {
      assert.strictEqual(
        fs.readFileSync(path.join(folder, name), 'utf8'),
        name,
      );
    }
    assert.deepStrictEqual(
      fs.readdirSync(folder).toSorted(),
      [...beside, 'notes.txt'].toSorted(),
    );
  });

  test('writes a file of several names in place, so that each of them reads the new bytes', async () => {
    fs.writeFileSync(file, 'old text');
    const other = path.join(folder, 'other name.txt');
    fs.linkSync(file, other);
    assert.strictEqual(await saveFile(file, bytes('new')), 'inPlace');
    assert.strictEqual(fs.readFileSync(other, 'utf8'), 'new');
    assert.strictEqual(fs.statSync(file).ino, fs.statSync(other).ino);
  });

  test.skipIf(!linksMade())(
    'writes through a symbolic link into the file it points to, keeping the link',
    async () => {
      const target = path.join(folder, 'target.txt');
      fs.writeFileSync(target, 'old');
      fs.symlinkSync(target, file);
      await saveFile(file, bytes('new'));
      assert.ok(fs.lstatSync(file).isSymbolicLink());
      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'new');
    },
  );

  test.skipIf(windows)(
    'keeps the mode of the file it replaces, so a script stays one that runs',
    async () => {
      fs.writeFileSync(file, '#!/bin/sh\n');
      fs.chmodSync(file, 0o751);
      await saveFile(file, bytes('#!/bin/sh\necho hi\n'));
      assert.strictEqual(fs.statSync(file).mode & 0o777, 0o751);
    },
  );

  test('turns a read-only file away unless told to write it, and keeps it read-only once written', async () => {
    fs.writeFileSync(file, 'old');
    fs.chmodSync(file, 0o444);
    await assert.rejects(saveFile(file, bytes('new')), ReadOnlyFile);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'old');
    await saveFile(file, bytes('new'), { overwriteReadOnly: true });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
    assert.strictEqual(fs.statSync(file).mode & 0o222, 0);
    fs.chmodSync(file, 0o644);
  });

  test.skipIf(windows || superUser)(
    'writes in place in a folder that lets no file be made in it, as the file itself may still be written',
    async () => {
      fs.writeFileSync(file, 'old');
      fs.chmodSync(folder, 0o555);
      try {
        assert.strictEqual(await saveFile(file, bytes('new')), 'inPlace');
        assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
      } finally {
        fs.chmodSync(folder, 0o755);
      }
    },
  );

  test('turns away writing in place more than its drive has room for, leaving the file as it was', async () => {
    fs.writeFileSync(file, 'old');
    fs.linkSync(file, path.join(folder, 'other.txt'));
    await assert.rejects(
      saveFile(file, bytes('a longer text'), {
        freeBytes: () => Promise.resolve(3),
      }),
      NoRoomToSave,
    );
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'old');
  });

  test('writes in place, leaving no file of its own behind, once the system cannot replace the file', async () => {
    fs.writeFileSync(file, 'old text');
    assert.strictEqual(
      await saveFile(file, bytes('new'), {
        replaceFile: () => Promise.resolve(false),
      }),
      'inPlace',
    );
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
    assert.deepStrictEqual(fs.readdirSync(folder), ['notes.txt']);
  });

  test.skipIf(!windows)(
    'keeps the attributes and the streams of a file on Windows, its Mark of the Web too, as ReplaceFile carries them over to the new one',
    async () => {
      const { windowsReplaceFile } =
        await import('../../../../../tools/commander/main/windowsReplaceFile.js');
      fs.writeFileSync(file, 'old');
      fs.writeFileSync(
        `${file}:Zone.Identifier`,
        '[ZoneTransfer]\r\nZoneId=3\r\n',
      );
      execFileSync('attrib', ['+h', file]);
      assert.strictEqual(
        await saveFile(file, bytes('new'), {
          replaceFile: windowsReplaceFile(),
        }),
        'replaced',
      );
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new');
      assert.match(
        fs.readFileSync(`${file}:Zone.Identifier`, 'utf8'),
        /ZoneId=3/,
      );
      assert.match(
        execFileSync('attrib', [file], { encoding: 'utf8' }),
        /^\s*A?\s*H/,
      );
      execFileSync('attrib', ['-h', file]);
    },
  );
});
