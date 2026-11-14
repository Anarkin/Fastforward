import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  gitStarter,
  threadFor,
} from '../../../../../tools/git/main/spawnedGit';
import { tempFolder } from '../../../../helpers/repositories';

suite('Starting git', () => {
  test('says git could not be started, as for a command not found', async () => {
    const child = gitStarter(tempFolder('no-starter')).spawn(
      'no-such-git-command',
      [],
      { cwd: process.cwd(), env: process.env, detached: false },
    );
    child.stdin.end();

    const error = await new Promise<NodeJS.ErrnoException>((resolve) =>
      child.on('error', resolve),
    );

    assert.strictEqual(error.code, 'ENOENT');
  });

  test('starts each git on a thread starting no other, adding threads up to the most it may have, then on the one starting fewest, as one start held up for seconds held up every start behind it', () => {
    assert.strictEqual(threadFor([], 4), 0);
    assert.strictEqual(threadFor([0], 4), 0);
    assert.strictEqual(threadFor([1], 4), 1);
    assert.strictEqual(threadFor([1, 0, 2], 4), 1);
    assert.strictEqual(threadFor([2, 1, 3, 1], 4), 1);
    assert.strictEqual(threadFor([1], 1), 0);
  });
});
