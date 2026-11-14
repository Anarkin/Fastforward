import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { stopRunningGit } from '../../../../../../tools/git/main/cli/run';
import { waitFor } from '../../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';

export function heldHook(folder: string, name: string) {
  const mark = (what: string) =>
    path.join(folder, `${name}-${what}`).replaceAll('\\', '/');
  const [started, release, done] = ['started', 'release', 'done'].map(mark);
  return {
    started,
    release,
    done,
    script: `#!/bin/sh\necho > '${started}'\nwhile [ ! -e '${release}' ]; do sleep 0.05; done\necho > '${done}'\n`,
  };
}

export async function settledYet(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  const settle = () => {
    settled = true;
  };
  promise.then(settle, settle);
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}

export async function stoppedAtOnce(writing: Promise<void>): Promise<void> {
  await stopRunningGit(0);
  await writing;
}

export async function filteredSlowly(): Promise<TempRepository> {
  const slow = await tempRepository(tempFolder('slow'));
  await slow.commit('first', {
    '.gitattributes': '*.txt filter=slow\n',
    'a.txt': 'a\n',
  });
  await slow.git('switch', '-q', '-c', 'slow');
  await slow.commit('slow', { 'a.txt': 'b\n' });
  await slow.git('switch', '-q', 'main');
  return slow;
}

export async function stuckWriting(
  slow: TempRepository,
  name: string,
  write: (root: string) => Promise<unknown>,
  stuckWhile: (writing: Promise<void>) => Promise<void>,
): Promise<void> {
  const folder = tempFolder(`${name}-marks`);
  const started = path.join(folder, 'started').replaceAll('\\', '/');
  const stuck = await slow.copy(tempFolder(name));
  try {
    await stuck.git(
      'config',
      'filter.slow.smudge',
      `echo > '${started}'; sleep 15; cat`,
    );
    const writing = assert.rejects(write(stuck.root));
    await waitFor(() => fs.existsSync(started), `the ${name} to start`);
    await stuckWhile(writing);
    assert.strictEqual(
      fs.existsSync(path.join(stuck.root, '.git', 'index.lock')),
      false,
      name,
    );
  } finally {
    removeFolder(stuck.root);
    removeFolder(folder);
  }
}
