import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { workingTreeFiles } from '../../../../../tools/git/main/workingTree';
import {
  UntrackedPatches,
  workingTreePatch,
} from '../../../../../tools/git/main/workingTreePatch';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../../../../helpers/repositories';

suite('Uncommitted changes', () => {
  let gitPath: string;
  let cwd: string;

  beforeAll(async () => {
    const repository = await tempRepository(tempFolder('changes'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
    const nested = await tempRepository(path.join(cwd, 'nested'));
    fs.writeFileSync(path.join(nested.root, 'inner.txt'), 'inner\n');
  });

  afterAll(() => removeFolder(cwd));

  test('diffs an untracked file again only once it changed on disk', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'first\n');
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const first = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(first.includes('+first'), first);
      for (const [file, { stamp }] of new Map(patches)) {
        patches.set(file, { stamp, patch: `kept ${file}\n` });
      }
      const kept = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(kept.includes('kept draft.txt'), kept);
      assert.ok(kept.includes('kept untracked.txt'), kept);
      assert.ok(kept.includes('+two'), kept);
      assert.strictEqual(
        await workingTreePatch(
          gitPath,
          cwd,
          workingTree,
          { path: 'draft.txt' },
          patches,
        ),
        'kept draft.txt\n',
      );
      fs.writeFileSync(draft, 'second line\n');
      const changed = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(changed.includes('+second line'), changed);
      assert.ok(changed.includes('kept untracked.txt'), changed);
    } finally {
      fs.rmSync(draft);
    }
  });

  test('forgets the patch kept of an untracked file the list no longer has', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'draft\n');
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      await workingTreePatch(gitPath, cwd, workingTree, {}, patches);
      assert.ok(patches.has('draft.txt'));
      const listed = {
        ...workingTree,
        files: workingTree.files.filter((file) => file.path !== 'draft.txt'),
        untracked: workingTree.untracked.filter((file) => file !== 'draft.txt'),
      };
      await workingTreePatch(gitPath, cwd, listed, {}, patches);
      assert.deepStrictEqual([...patches.keys()], ['untracked.txt']);
    } finally {
      fs.rmSync(draft);
    }
  });

  test('keeps no patch of an untracked file over 2 MB, diffing it again on every refresh, but keeps that of one of exactly 2 MB', async () => {
    const files = {
      'large.log': `${'x'.repeat(2 * 1024 * 1024)}\n`,
      'exact.log': `${'x'.repeat(2 * 1024 * 1024 - 1)}\n`,
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      for (const file of Object.keys(files)) {
        const patch = await workingTreePatch(
          gitPath,
          cwd,
          workingTree,
          { path: file },
          patches,
        );
        assert.ok(patch.includes('+xxx'));
      }
      assert.ok(!patches.has('large.log'));
      assert.ok(patches.has('exact.log'));
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('forgets the patches of the untracked files used least recently once they pass its size', async () => {
    const files = ['kept-a.txt', 'kept-b.txt', 'kept-c.txt'];
    for (const file of files) {
      fs.writeFileSync(path.join(cwd, file), 'same\n');
    }
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const alone = (file: string, patches?: UntrackedPatches) =>
        workingTreePatch(gitPath, cwd, workingTree, { path: file }, patches);
      const patches = new UntrackedPatches(
        (await alone('kept-a.txt')).length * 2,
      );
      for (const file of [
        'kept-a.txt',
        'kept-b.txt',
        'kept-a.txt',
        'kept-c.txt',
      ]) {
        await alone(file, patches);
      }
      assert.deepStrictEqual([...patches.keys()], ['kept-a.txt', 'kept-c.txt']);
    } finally {
      for (const file of files) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });
});
