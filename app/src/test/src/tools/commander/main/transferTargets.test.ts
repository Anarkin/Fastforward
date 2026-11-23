import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, suite, test } from 'vitest';
import { refusedTargetOnDisk } from '../../../../../tools/commander/main/transferTargets';
import { strings } from '../../../../../lib/shared/strings';

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
});
