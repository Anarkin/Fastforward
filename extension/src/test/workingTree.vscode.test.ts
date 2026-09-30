import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { aheadBehind, remoteDefaultBranches } from '../git/branches';
import { showPatch } from '../git/diff';
import { listTree, readFile } from '../git/files';
import { headCommit, listHistory } from '../git/history';
import { workingTreeFiles, workingTreePatch } from '../git/workingTree';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('A repository without commits', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    const repository = await tempRepository(tempFolder('empty'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    fs.writeFileSync(path.join(cwd, 'staged.txt'), 'one\n');
    await repository.git('add', 'staged.txt');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('has no HEAD and an empty history', async () => {
    assert.strictEqual(await headCommit(gitPath, cwd), undefined);
    assert.deepStrictEqual(await listHistory(gitPath, cwd), []);
  });

  test('lists staged files as added, and untracked ones', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['A', 'staged.txt'],
        ['U', 'untracked.txt'],
      ],
    );
    const patch = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'staged.txt',
    });
    assert.ok(patch.includes('+one'), patch);
  });
});

suite('Uncommitted changes', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    const repository = await tempRepository(tempFolder('changes'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
    const nested = await tempRepository(path.join(cwd, 'nested'));
    fs.writeFileSync(path.join(nested.root, 'inner.txt'), 'inner\n');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('lists modified and untracked files', async () => {
    const { files } = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['M', 'tracked.txt'],
        ['U', 'nested/'],
        ['U', 'untracked.txt'],
      ],
    );
  });

  test('includes untracked files in the full patch', async () => {
    const patch = await workingTreePatch(
      gitPath,
      cwd,
      await workingTreeFiles(gitPath, cwd),
    );
    assert.ok(patch.includes('+two'));
    assert.ok(patch.includes('+new'));
    assert.ok(!patch.includes('inner'));
  });

  test('narrows the patch to one untracked file', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const patch = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'untracked.txt',
    });
    assert.ok(patch.includes('+new'));
    assert.ok(!patch.includes('+two'));
    const nested = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'nested/',
    });
    assert.strictEqual(nested, '');
  });

  test('counts the lines of untracked files, and leaves large ones out when asked', async () => {
    const large = path.join(cwd, 'large.txt');
    fs.writeFileSync(large, 'line\n'.repeat(2000));
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const counts = workingTree.files.map((file) => [
        file.path,
        file.insertions,
      ]);
      assert.deepStrictEqual(counts, [
        ['tracked.txt', 1],
        ['large.txt', 2000],
        ['nested/', 0],
        ['untracked.txt', 1],
      ]);
      const patch = await workingTreePatch(gitPath, cwd, workingTree, {
        exclude: ['large.txt'],
      });
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('+line'), patch);
    } finally {
      fs.rmSync(large);
    }
  });

  test('leaves an untracked file it cannot read out of the full patch', async () => {
    const gone = path.join(cwd, 'gone.txt');
    fs.writeFileSync(gone, 'gone\n');
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      fs.rmSync(gone);
      const patch = await workingTreePatch(gitPath, cwd, workingTree);
      assert.ok(patch.includes('+two'), patch);
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('gone.txt'), patch);
    } finally {
      if (fs.existsSync(gone)) {
        fs.rmSync(gone);
      }
    }
  });

  test('counts a last line without a newline, and no lines of binary, empty or huge untracked files', async () => {
    const files: Record<string, string | Buffer> = {
      'partial.txt': 'a\nb',
      'binary.dat': Buffer.from([0, 1, 2]),
      'empty.txt': '',
      'huge.txt': 'x\n'.repeat(1024 * 1024 + 1),
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const { files: changes } = await workingTreeFiles(gitPath, cwd);
      assert.deepStrictEqual(
        Object.keys(files).map(
          (file) => changes.find((change) => change.path === file)?.insertions,
        ),
        [2, 0, 0, 0],
      );
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts an untracked symlink as the one line git diffs it as, its target', async function () {
    const target = path.join(cwd, 'target.txt');
    const link = path.join(cwd, 'link');
    fs.writeFileSync(target, 'a\nb\n');
    try {
      fs.symlinkSync('target.txt', link);
    } catch {
      fs.rmSync(target);
      this.skip();
    }
    try {
      const { files } = await workingTreeFiles(gitPath, cwd);
      assert.strictEqual(
        files.find((change) => change.path === 'link')?.insertions,
        1,
      );
    } finally {
      fs.rmSync(link);
      fs.rmSync(target);
    }
  });

  test('counts and diffs only the first 50 untracked files, unless one is asked for alone', async () => {
    const many = path.join(cwd, 'many');
    fs.mkdirSync(many);
    for (let i = 0; i <= 50; i++) {
      fs.writeFileSync(
        path.join(many, `f${String(i).padStart(2, '0')}.txt`),
        `many${i}\n`,
      );
    }
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const insertions = (file: string) =>
        workingTree.files.find((change) => change.path === file)?.insertions;
      assert.strictEqual(insertions('many/f49.txt'), 1);
      assert.strictEqual(insertions('many/f50.txt'), 0);
      const patch = await workingTreePatch(gitPath, cwd, workingTree);
      assert.ok(patch.includes('+many49'), patch);
      assert.ok(!patch.includes('+many50'), patch);
      const alone = await workingTreePatch(gitPath, cwd, workingTree, {
        path: 'many/f50.txt',
      });
      assert.ok(alone.includes('+many50'), alone);
    } finally {
      fs.rmSync(many, { recursive: true });
    }
  });

  test('diffs the untracked files the list had, not ones found since', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const listed = {
      ...workingTree,
      files: workingTree.files.filter((file) => file.status !== 'U'),
    };
    const patch = await workingTreePatch(gitPath, cwd, listed);
    assert.ok(patch.includes('+two'));
    assert.ok(!patch.includes('+new'));
  });
});

suite('Repository files', function () {
  this.timeout(20_000);
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('files'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('lists the files at a commit and in the working tree', async () => {
    assert.deepStrictEqual(await listTree(gitPath, cwd, 'HEAD'), [
      'src/tracked.txt',
    ]);
    assert.deepStrictEqual(
      (await listTree(gitPath, cwd, undefined)).toSorted(),
      ['src/tracked.txt', 'untracked.txt'],
    );
  });

  test("reads a remote's default branch", async () => {
    assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), []);
    await repository.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    try {
      await repository.git(
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
        'refs/remotes/origin/main',
      );
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'origin/main',
      ]);
      await repository.git('update-ref', 'refs/remotes/up/HEAD', 'HEAD');
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'origin/main',
      ]);
    } finally {
      await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
      await repository.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      await repository.git('update-ref', '-d', 'refs/remotes/up/HEAD');
    }
  });

  test('counts the commits a branch is ahead and behind another', async () => {
    const [tree] = await repository.resolve('HEAD^{tree}');
    const extra = (
      await repository.git('commit-tree', tree, '-p', 'HEAD', '-m', 'extra')
    ).trim();
    await repository.git('update-ref', 'refs/remotes/origin/main', extra);
    try {
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/remotes/origin/main',
          'refs/heads/main',
        ),
        { ahead: 1, behind: 0 },
      );
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/heads/main',
          'refs/remotes/origin/main',
        ),
        { ahead: 0, behind: 1 },
      );
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/heads/nope',
          'refs/remotes/origin/main',
        ),
        { ahead: 0, behind: 0 },
      );
    } finally {
      await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
    }
  });

  test('lists a conflicted file once', async () => {
    const conflicted = await tempRepository(tempFolder('conflict'));
    try {
      await conflicted.commit('initial');
      await conflicted.git('checkout', '-b', 'side');
      await conflicted.commit('side', { 'conflict.txt': 'a\n' });
      await conflicted.git('checkout', 'main');
      await conflicted.commit('main', { 'conflict.txt': 'b\n' });
      await assert.rejects(conflicted.git('merge', 'side'));
      assert.deepStrictEqual(
        await listTree(gitPath, conflicted.root, undefined),
        ['conflict.txt'],
      );
    } finally {
      removeFolder(conflicted.root);
    }
  });

  test('shows a file with a NUL byte as binary, unless it comes late', async () => {
    fs.writeFileSync(
      path.join(cwd, 'bin.dat'),
      Buffer.from([0x89, 0x50, 0, 1]),
    );
    fs.writeFileSync(path.join(cwd, 'late.txt'), `${'x'.repeat(9000)}\0`);
    await repository.git('add', 'bin.dat', 'late.txt');
    await repository.git('commit', '-m', 'binary');
    try {
      const binary = { content: '', binary: true };
      for (const hash of ['HEAD', undefined]) {
        assert.deepStrictEqual(
          await readFile(gitPath, cwd, hash, 'bin.dat'),
          binary,
        );
        assert.strictEqual(
          (await readFile(gitPath, cwd, hash, 'late.txt')).binary,
          false,
        );
      }
    } finally {
      await repository.git('reset', 'HEAD~1');
      fs.rmSync(path.join(cwd, 'bin.dat'));
      fs.rmSync(path.join(cwd, 'late.txt'));
    }
  });

  test('reads a file at a commit and in the working tree', async () => {
    const committed = await readFile(gitPath, cwd, 'HEAD', 'src/tracked.txt');
    assert.deepStrictEqual(committed, { content: 'one\n', binary: false });
    const current = await readFile(gitPath, cwd, undefined, 'src/tracked.txt');
    assert.strictEqual(current.content, 'two\n');
    await assert.rejects(
      readFile(gitPath, cwd, 'HEAD', 'missing.txt'),
      /missing.txt is not in HEAD/,
    );
  });

  test('reads a file deleted since it was listed as empty', async () => {
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'gone.txt'),
      {
        content: '',
        binary: false,
      },
    );
  });

  test('reads a file whose folder became a file as empty', async () => {
    const folder = path.join(cwd, 'gone-dir');
    fs.writeFileSync(folder, '');
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'gone-dir/f.txt'),
        { content: '', binary: false },
      );
    } finally {
      fs.rmSync(folder);
    }
  });

  test('reads a symlink in the working tree by its target, as git does', async function () {
    const link = path.join(cwd, 'link');
    try {
      fs.symlinkSync('src/tracked.txt', link);
    } catch {
      // Windows allows symlinks only in developer mode or as an admin
      this.skip();
    }
    try {
      assert.deepStrictEqual(await readFile(gitPath, cwd, undefined, 'link'), {
        content: 'src/tracked.txt',
        binary: false,
      });
    } finally {
      fs.rmSync(link);
    }
  });
});

suite('Large files and submodules', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let inner: string;
  let repository: TempRepository;
  let sub: TempRepository;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('large'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    sub = await tempRepository(path.join(cwd, 'sub'));
    await sub.commit('inner');
    [inner] = await sub.resolve('HEAD');
    fs.writeFileSync(path.join(cwd, 'large.txt'), 'x'.repeat(3 * 1024 * 1024));
    await repository.git('add', '.');
    await repository.git('commit', '-m', 'initial');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('shows a file too large to show as binary', async () => {
    const binary = { content: '', binary: true };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'large.txt'),
      binary,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'large.txt'),
      binary,
    );
  });

  test('shows a submodule by its commit', async () => {
    const submodule = {
      content: `Subproject commit ${inner}\n`,
      binary: false,
    };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'sub'),
      submodule,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'sub'),
      submodule,
    );
  });

  test('shows a submodule that is not checked out as empty', async () => {
    fs.mkdirSync(path.join(cwd, 'unchecked'));
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'unchecked'),
        { content: '', binary: false },
      );
    } finally {
      fs.rmSync(path.join(cwd, 'unchecked'), { recursive: true });
    }
  });

  test('diffs a submodule by its commits, whatever the config says', async () => {
    await sub.commit('moved');
    await repository.git('add', 'sub');
    await repository.git('commit', '-m', 'move sub');
    await repository.git('config', 'diff.submodule', 'log');
    const patch = await showPatch(gitPath, cwd, 'HEAD', { path: 'sub' });
    assert.ok(patch.includes(`-Subproject commit ${inner}`), patch);
  });
});
