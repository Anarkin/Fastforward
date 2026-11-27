import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, suite, test } from 'vitest';
import {
  refusedTarget,
  refusedTargetInArchives,
  refusedTargetOnDisk,
} from '../../../../../tools/commander/main/transferTargets';
import { strings } from '../../../../../lib/shared/strings';

const from = (...parts: string[]) => path.join(path.sep, 'src', ...parts);

suite('The target of a copy on disk', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const folder of made.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  test('refuses a folder into itself through a link inside it, as copying it there would never end', async () => {
    const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-targets-')),
    );
    made.push(root);
    const folder = path.join(root, 'folder');
    const inside = path.join(folder, 'inside');
    fs.mkdirSync(inside, { recursive: true });
    const link = path.join(root, 'link');
    fs.symlinkSync(inside, link, 'junction');
    const other = path.join(root, 'other');
    fs.mkdirSync(other);

    assert.deepStrictEqual(
      await refusedTargetOnDisk([folder], link, process.platform, true),
      strings.commander.intoItself(folder),
    );
    assert.strictEqual(
      await refusedTargetOnDisk([folder], other, process.platform, true),
      undefined,
    );
    assert.deepStrictEqual(
      await refusedTargetOnDisk([folder], inside, process.platform, true),
      strings.commander.intoItself(folder),
    );
    assert.strictEqual(
      await refusedTargetOnDisk(
        [path.join(root, 'gone')],
        path.join(root, 'nowhere'),
        process.platform,
        true,
      ),
      undefined,
    );
  });

  test('refuses an item of an archive into itself or the folder it is in through another path to the archive, as a move added it over itself and then deleted it', async () => {
    const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-targets-')),
    );
    made.push(root);
    const folder = path.join(root, 'folder');
    fs.mkdirSync(folder);
    const archive = path.join(folder, 'a.zip');
    fs.writeFileSync(archive, '');
    const link = path.join(root, 'link');
    fs.symlinkSync(folder, link, 'junction');
    const again = path.join(link, 'a.zip');
    const docs = path.join(archive, 'docs');
    const into = (...parts: string[]) => path.join(again, ...parts);

    assert.deepStrictEqual(
      await refusedTargetInArchives(
        [path.join(docs, 'x.txt')],
        archive,
        into('docs'),
        again,
        process.platform,
      ),
      strings.commander.alreadyIn(docs),
    );
    assert.deepStrictEqual(
      await refusedTargetInArchives(
        [docs],
        archive,
        into('docs', 'deeper'),
        again,
        process.platform,
      ),
      strings.commander.intoItself(docs),
    );
    assert.strictEqual(
      await refusedTargetInArchives(
        [path.join(docs, 'x.txt')],
        archive,
        into('other'),
        again,
        process.platform,
      ),
      undefined,
    );
  });

  test('refuses items of one name from two folders into one folder, as from flat view, as the second took the first for an item there already and Overwrite replaced it, the first moved there lost, its case aside where the system ignores it', () => {
    const target = path.join(path.sep, 'target');
    const alike = [from('a', 'x.txt'), from('b', 'X.TXT')];
    assert.deepStrictEqual(
      refusedTarget(alike, target, 'win32'),
      strings.commander.namesAlike('X.TXT'),
    );
    assert.strictEqual(refusedTarget(alike, target, 'linux'), undefined);
    assert.strictEqual(
      refusedTarget([from('a', 'x.txt'), from('b', 'y.txt')], target, 'win32'),
      undefined,
    );
  });
});
