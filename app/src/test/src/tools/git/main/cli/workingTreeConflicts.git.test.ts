import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { listTree } from '../../../../../../tools/git/main/cli/files';
import {
  workingTreeFiles,
  workingTreePatch,
} from '../../../../../../tools/git/main/cli/workingTree';
import { parsePatch } from '../../../../../../tools/git/page/diff';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { holdingGit } from './workingTreeFixtures';

suite('A conflicted merge', () => {
  let conflicted: TempRepository;

  beforeAll(async () => {
    conflicted = await tempRepository(tempFolder('conflicted'));
    await conflicted.commit('initial');
    await conflicted.git('checkout', '-q', '-b', 'side');
    await conflicted.commit('side', { 'conflict.txt': 'a\n' });
    await conflicted.git('checkout', '-q', 'main');
    await conflicted.commit('main', { 'conflict.txt': 'b\n' });
    await assert.rejects(conflicted.git('merge', 'side'));
  });

  afterAll(() => removeFolder(conflicted.root));

  test('lists the conflicted file once, with the unstaged changes and among all of them', async () => {
    const workingTree = await workingTreeFiles(
      conflicted.gitPath,
      conflicted.root,
    );
    assert.deepStrictEqual(workingTree.staged, []);
    assert.deepStrictEqual(
      [workingTree.files, workingTree.all?.files ?? []].map((files) =>
        files.map((file) => file.path),
      ),
      [['conflict.txt'], ['conflict.txt']],
    );
  });

  test('diffs the conflicted file against our side, alone and with the rest, in as many lines as it counts', async () => {
    for (const base of [undefined, 'HEAD']) {
      const workingTree = await workingTreeFiles(
        conflicted.gitPath,
        conflicted.root,
        { base, reverse: false },
      );
      const [listed] = workingTree.files;
      for (const scope of [{}, { path: 'conflict.txt' }]) {
        const patch = await workingTreePatch(
          conflicted.gitPath,
          conflicted.root,
          workingTree,
          scope,
        );
        const files = parsePatch(patch);
        assert.deepStrictEqual(
          files.map((file) => file.path),
          ['conflict.txt'],
          patch,
        );
        const lines = files[0].hunks.flatMap((hunk) => hunk.lines);
        const count = (kind: string) =>
          lines.filter((line) => line.kind === kind).length;
        assert.deepStrictEqual(
          [count('added'), count('removed')],
          [listed.insertions, listed.deletions],
        );
        assert.deepStrictEqual(
          lines.map((line) => [line.kind, line.text.slice(0, 7)]),
          [
            ['added', '<<<<<<<'],
            ['context', 'b'],
            ['added', '======='],
            ['added', 'a'],
            ['added', '>>>>>>>'],
          ],
        );
      }
    }
  });

  test('lists the conflicted file once its text is back to our side, as it is still not resolved', async () => {
    const conflict = path.join(conflicted.root, 'conflict.txt');
    const marked = fs.readFileSync(conflict);
    try {
      fs.writeFileSync(conflict, 'b\n');
      const workingTree = await workingTreeFiles(
        conflicted.gitPath,
        conflicted.root,
      );
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['conflict.txt'],
      );
    } finally {
      fs.writeFileSync(conflict, marked);
    }
  });

  test('lists the conflicted file once among the files of the working tree', async () => {
    assert.deepStrictEqual(
      await listTree(conflicted.gitPath, conflicted.root, undefined),
      ['conflict.txt'],
    );
  });
});

suite('A merge conflicting over a file our side deleted', () => {
  let conflicted: TempRepository;

  beforeAll(async () => {
    conflicted = await tempRepository(tempFolder('deleted-by-us'));
    await conflicted.commit('initial', { 'kept.txt': 'one\ntwo\n' });
    await conflicted.git('checkout', '-q', '-b', 'side');
    await conflicted.commit('side', { 'kept.txt': 'one\ntwo side\nthree\n' });
    await conflicted.git('checkout', '-q', 'main');
    await conflicted.git('rm', '-q', 'kept.txt');
    await conflicted.git('commit', '-q', '-m', 'main');
    await assert.rejects(conflicted.git('merge', 'side'));
  });

  afterAll(() => removeFolder(conflicted.root));

  test('lists the file their side changed as added, and diffs it from nothing to what the working tree holds, alone and with the rest, rather than as a change without lines', async () => {
    const workingTree = await workingTreeFiles(
      conflicted.gitPath,
      conflicted.root,
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [['A', 'kept.txt', 3, 0]],
    );
    for (const scope of [{}, { path: 'kept.txt' }]) {
      const patch = await workingTreePatch(
        conflicted.gitPath,
        conflicted.root,
        workingTree,
        scope,
      );
      const files = parsePatch(patch);
      assert.deepStrictEqual(
        files.map((file) => file.path),
        ['kept.txt'],
        patch,
      );
      assert.deepStrictEqual(
        files[0].hunks
          .flatMap((hunk) => hunk.lines)
          .map((line) => [line.kind, line.text]),
        [
          ['added', 'one'],
          ['added', 'two side'],
          ['added', 'three'],
        ],
      );
    }
  });

  test('lists the file their side changed as still conflicted once it is removed from disk, not as added', async () => {
    const kept = path.join(conflicted.root, 'kept.txt');
    const text = fs.readFileSync(kept);
    try {
      fs.rmSync(kept);
      const workingTree = await workingTreeFiles(
        conflicted.gitPath,
        conflicted.root,
      );
      assert.deepStrictEqual(
        workingTree.files.map((file) => [file.status, file.path]),
        [['?', 'kept.txt']],
      );
    } finally {
      fs.writeFileSync(kept, text);
    }
  });
});

function unreadable(file: string): () => void {
  if (process.platform === 'win32') {
    execFileSync('icacls', [file, '/deny', '*S-1-1-0:(R)'], {
      stdio: 'ignore',
    });
    return () =>
      execFileSync('icacls', [file, '/remove:d', '*S-1-1-0'], {
        stdio: 'ignore',
      });
  }
  fs.chmodSync(file, 0);
  return () => fs.chmodSync(file, 0o644);
}

function canRead(file: string): boolean {
  try {
    fs.readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

suite('A changed file that cannot be read', () => {
  test('lists every changed file without counting their lines, rather than failing, as git stops counting at the file it cannot read', async (context) => {
    const repository = await tempRepository(tempFolder('unreadable'));
    try {
      await repository.commit('initial', {
        'a.txt': 'one\n',
        'b.txt': 'one\n',
      });
      const locked = path.join(repository.root, 'a.txt');
      fs.writeFileSync(locked, 'two\n');
      fs.writeFileSync(path.join(repository.root, 'b.txt'), 'two\n');
      const readable = unreadable(locked);
      try {
        if (canRead(locked)) {
          context.skip();
        }
        for (const base of [undefined, 'HEAD']) {
          const { files } = await workingTreeFiles(
            repository.gitPath,
            repository.root,
            { base, reverse: false },
          );
          assert.deepStrictEqual(
            files.map((file) => [file.status, file.path, file.uncounted]),
            [
              ['M', 'a.txt', true],
              ['M', 'b.txt', true],
            ],
            base,
          );
        }
      } finally {
        readable();
      }
    } finally {
      removeFolder(repository.root);
    }
  });
});

suite('Counting uncommitted changes', () => {
  test('counts them without diffing their lines when only their number is shown, telling a file only touched from one changed by its hash, as each refresh diffed every changed file whole', async () => {
    const repository = await tempRepository(tempFolder('count-only'));
    try {
      await repository.commit('initial', {
        'changed.txt': 'one\n',
        'touched.txt': 'same\n',
        'staged.txt': 'old\n',
      });
      const touched = path.join(repository.root, 'touched.txt');
      fs.writeFileSync(path.join(repository.root, 'changed.txt'), 'two\n');
      fs.writeFileSync(touched, 'same\n');
      const later = new Date(Date.now() + 60_000);
      fs.utimesSync(touched, later, later);
      fs.writeFileSync(path.join(repository.root, 'staged.txt'), 'new\n');
      await repository.git('add', 'staged.txt');
      const gits = holdingGit(() => false);
      let workingTree: Awaited<ReturnType<typeof workingTreeFiles>>;
      try {
        workingTree = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          undefined,
          undefined,
          undefined,
          false,
        );
      } finally {
        gits.release();
      }
      assert.strictEqual(gits.started('--numstat'), false);
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['changed.txt'],
      );
      assert.deepStrictEqual(
        workingTree.staged?.map((file) => file.path),
        ['staged.txt'],
      );
    } finally {
      removeFolder(repository.root);
    }
  });
});
