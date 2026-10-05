import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { aheadBehind, remoteDefaultBranches } from '../git/branches';
import { showPatch } from '../git/diff';
import { listTree, maxFileSize, readBlobs, readFile } from '../git/files';
import { headCommit, listHistory } from '../git/history';
import { runGit } from '../git/run';
import { ignoredPaths } from '../git/watch';
import {
  withoutTouched,
  workingTreeFiles,
  workingTreePatch,
  type UntrackedPatches,
} from '../git/workingTree';
import { isLargeChange } from '../shared/protocol';
import { parsePatch } from '../webview/diff';
import {
  removeFolder,
  symlinkOrSkip,
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

suite('Files touched but not changed', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let index: string;

  suiteSetup(async () => {
    const repository = await tempRepository(tempFolder('touched'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    index = path.join(cwd, '.git', 'index');
    await repository.git('config', 'core.autocrlf', 'true');
    await repository.commit('initial', {
      'text.txt': 'text\n',
      'binary.bin': '\0\x01\x02',
      'crlf.txt': 'one\r\ntwo\r\n',
      'changed.txt': 'old\n',
    });
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'new\n');
    const past = new Date(Date.UTC(2020, 0, 1));
    for (const file of ['text.txt', 'binary.bin', 'crlf.txt', 'changed.txt']) {
      fs.utimesSync(path.join(cwd, file), past, past);
    }
  });

  suiteTeardown(() => removeFolder(cwd));

  test('lists and diffs only the changed file, leaving the index for a commit made meanwhile to lock', async () => {
    const before = fs.readFileSync(index);
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [['M', 'changed.txt']],
    );
    const patch = await workingTreePatch(gitPath, cwd, workingTree);
    assert.deepStrictEqual(
      [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map((match) => match[1]),
      ['changed.txt'],
    );
    assert.ok(fs.readFileSync(index).equals(before));
  });
});

suite('A file system monitor the repository sets', function () {
  this.timeout(20_000);

  test('is never run when it is a command', async () => {
    const folder = tempFolder('monitored');
    try {
      const repository = await tempRepository(path.join(folder, 'repository'));
      const { gitPath, root } = repository;
      await repository.commit('first', { 'a.txt': 'one\n' });
      fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
      fs.writeFileSync(path.join(root, 'b.txt'), 'new\n');
      const ran = path.join(folder, 'ran.txt').replaceAll('\\', '/');
      await repository.git('config', 'core.fsmonitor', `echo >> '${ran}'`);
      const workingTree = await workingTreeFiles(gitPath, root);
      await workingTreePatch(gitPath, root, workingTree);
      await ignoredPaths(gitPath, root, [path.join(root, 'b.txt')]);
      assert.strictEqual(fs.existsSync(ran), false);
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['a.txt', 'b.txt'],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test("is kept on when it is git's own", async () => {
    const repository = await tempRepository(tempFolder('daemon'));
    try {
      await repository.git('config', 'core.fsmonitor', 'true');
      const monitor = await runGit(repository.gitPath, repository.root, [
        'config',
        'core.fsmonitor',
      ]);
      assert.strictEqual(monitor.trim(), 'true');
    } finally {
      removeFolder(repository.root);
    }
  });
});

suite('A file renamed and edited', function () {
  this.timeout(20_000);

  test('counts the bytes of its new text on disk', async () => {
    const repository = await tempRepository(tempFolder('renamed'));
    const cwd = repository.root;
    try {
      const old = Array.from({ length: 20 }, (_, i) => `line ${i}\n`).join('');
      await repository.commit('initial', { 'old.txt': old });
      await repository.git('mv', 'old.txt', 'new.txt');
      fs.appendFileSync(path.join(cwd, 'new.txt'), 'extra\n');
      const { files } = await workingTreeFiles(repository.gitPath, cwd);
      assert.deepStrictEqual(
        files.map((file) => [file.status, file.path, file.bytes]),
        [['R', 'new.txt', old.length * 2 + 'extra\n'.length]],
      );
    } finally {
      removeFolder(cwd);
    }
  });
});

suite('A file removed from the index but kept on disk', function () {
  this.timeout(20_000);

  test('lists it once, as deleted, and diffs its deletion', async () => {
    const repository = await tempRepository(tempFolder('uncached'));
    const cwd = repository.root;
    try {
      await repository.commit('initial', { 'kept.txt': 'committed\n' });
      await repository.git('rm', '--cached', 'kept.txt');
      const workingTree = await workingTreeFiles(repository.gitPath, cwd);
      assert.deepStrictEqual(
        workingTree.files.map((file) => [file.status, file.path]),
        [['D', 'kept.txt']],
      );
      const patch = await workingTreePatch(
        repository.gitPath,
        cwd,
        workingTree,
        { path: 'kept.txt' },
      );
      assert.ok(patch.includes('-committed'), patch);
    } finally {
      removeFolder(cwd);
    }
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

  test('counts the bytes of the old and new text of each changed file', async () => {
    const { files } = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.path, file.bytes]),
      [
        ['tracked.txt', 8],
        ['nested/', undefined],
        ['untracked.txt', 4],
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

  test('counts the lines of untracked files, and patches only the files asked for', async () => {
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
        include: ['untracked.txt'],
      });
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('+two'), patch);
      assert.ok(!patch.includes('+line'), patch);
      assert.strictEqual(
        await workingTreePatch(gitPath, cwd, workingTree, { include: [] }),
        '',
      );
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

  test('counts a last line without a newline, and no lines of binary or empty untracked files', async () => {
    const files: Record<string, string | Buffer> = {
      'partial.txt': 'a\nb',
      'binary.dat': Buffer.from([0, 1, 2]),
      'empty.txt': '',
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
        [2, 0, 0],
      );
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts a huge untracked text file as a large change too large to count, and a huge binary one as no lines', async () => {
    const files: Record<string, string | Buffer> = {
      'huge.txt': 'x\n'.repeat(1024 * 1024 + 1),
      'huge.dat': Buffer.alloc(3 * 1024 * 1024),
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const { files: changes } = await workingTreeFiles(gitPath, cwd);
      const [text, binary] = ['huge.txt', 'huge.dat'].map((file) =>
        changes.find((change) => change.path === file),
      );
      assert.ok(text && isLargeChange(text));
      assert.strictEqual(text.tooLargeToCount, true);
      assert.strictEqual(text.insertions, 0);
      assert.strictEqual(binary?.insertions, 0);
      assert.strictEqual(binary?.tooLargeToCount, undefined);
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts an untracked symlink as the one line git diffs it as, its target', async function () {
    const target = path.join(cwd, 'target.txt');
    const link = path.join(cwd, 'link');
    symlinkOrSkip(this, 'target.txt', link);
    fs.writeFileSync(target, 'a\nb\n');
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

  test('diffs an untracked file again only once it changed on disk', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'first\n');
    try {
      const patches: UntrackedPatches = new Map();
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const first = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(first.includes('+first'), first);
      for (const [file, { stamp }] of patches) {
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
      const listed = {
        ...workingTree,
        files: workingTree.files.filter((file) => file.path !== 'draft.txt'),
        untracked: workingTree.untracked.filter((file) => file !== 'draft.txt'),
      };
      await workingTreePatch(gitPath, cwd, listed, {}, patches);
      assert.ok(!patches.has('draft.txt'));
    } finally {
      fs.rmSync(draft);
    }
  });

  test('keeps no patch of an untracked file too large to show whole', async () => {
    const large = path.join(cwd, 'large.log');
    fs.writeFileSync(
      large,
      `${'x'.repeat(maxFileSize)}
`,
    );
    try {
      const patches: UntrackedPatches = new Map();
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const patch = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        { path: 'large.log' },
        patches,
      );
      assert.ok(patch.includes('+xxx'));
      assert.ok(!patches.has('large.log'));
    } finally {
      fs.rmSync(large);
    }
  });

  test('diffs the untracked files the list had, not ones found since', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const listed = {
      ...workingTree,
      files: workingTree.files.filter((file) => file.status !== 'U'),
      untracked: [],
    };
    const patch = await workingTreePatch(gitPath, cwd, listed);
    assert.ok(patch.includes('+two'));
    assert.ok(!patch.includes('+new'));
  });

  test("diffs an untracked file named '-' by what it holds, not by git's input", async () => {
    const dash = path.join(cwd, '-');
    fs.writeFileSync(dash, 'dashed\n');
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      for (const scope of [{ path: '-' }, {}]) {
        const patch = await workingTreePatch(gitPath, cwd, workingTree, scope);
        const dashed = parsePatch(patch).find((file) => file.path === '-');
        assert.ok(dashed, patch);
        assert.match(patch, /^diff --git a\/- b\/-$/m);
        assert.match(patch, /^\+dashed$/m);
      }
    } finally {
      fs.rmSync(dash);
    }
  });

  test('stops when cancelled', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const controller = new AbortController();
    controller.abort();
    const { signal } = controller;
    await assert.rejects(workingTreeFiles(gitPath, cwd, undefined, signal));
    for (const scope of [
      {},
      { path: 'tracked.txt' },
      { path: 'untracked.txt' },
    ]) {
      const patches: UntrackedPatches = new Map();
      await assert.rejects(
        workingTreePatch(gitPath, cwd, workingTree, scope, patches, signal),
      );
      assert.deepStrictEqual(patches, new Map());
    }
  });
});

suite('Repository files', function () {
  this.timeout(20_000);
  let parent: string;
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    parent = tempFolder('files');
    repository = await tempRepository(path.join(parent, 'repository'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(parent));

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

  test('reads no file outside the repository', async () => {
    const outside = path.join(parent, 'outside.txt');
    fs.writeFileSync(outside, 'secret\n');
    try {
      await assert.rejects(
        readFile(gitPath, cwd, undefined, '../outside.txt'),
        /outside the repository/,
      );
      await assert.rejects(
        readFile(gitPath, cwd, undefined, outside),
        /outside the repository/,
      );
    } finally {
      fs.rmSync(outside);
    }
    const dots = path.join(cwd, '..dots.txt');
    fs.writeFileSync(dots, 'inside\n');
    try {
      assert.strictEqual(
        (await readFile(gitPath, cwd, undefined, '..dots.txt')).content,
        'inside\n',
      );
    } finally {
      fs.rmSync(dots);
    }
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
    symlinkOrSkip(this, 'src/tracked.txt', link);
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
    try {
      const patch = await showPatch(gitPath, cwd, 'HEAD', { path: 'sub' });
      assert.ok(patch.includes(`-Subproject commit ${inner}`), patch);
    } finally {
      await repository.git('config', '--unset', 'diff.submodule');
      await repository.git('reset', '--hard', 'HEAD~1');
      await sub.git('reset', '--hard', inner);
    }
  });
});

suite('Blobs', function () {
  this.timeout(20_000);

  test('reads both sides of the files a patch changes by their full ids, leaving out what is missing, binary or too large', async () => {
    const folder = tempFolder('blobs');
    try {
      const repository = await tempRepository(folder);
      const { gitPath, root } = repository;
      await repository.commit('first', {
        'a.ts': 'one\n',
        'image.png': Buffer.from([0, 1, 2]).toString('latin1'),
        'large.txt': 'x'.repeat(maxFileSize + 1),
      });
      await repository.commit('second', {
        'a.ts': 'two\n',
        'image.png': Buffer.from([0, 3]).toString('latin1'),
        'large.txt': 'y'.repeat(maxFileSize + 1),
      });
      const files = parsePatch(await showPatch(gitPath, root, 'HEAD'));
      const [a, image, large] = files.map((file) => file.blobs);
      const texts = await readBlobs(gitPath, root, [
        a?.old ?? '',
        a?.new ?? '',
        image?.new ?? '',
        large?.new ?? '',
        'f'.repeat(40),
      ]);
      assert.deepStrictEqual([...texts.values()], ['one\n', 'two\n']);
      assert.strictEqual(texts.get(a?.new ?? ''), 'two\n');
      assert.deepStrictEqual(await readBlobs(gitPath, root, []), new Map());
    } finally {
      removeFolder(folder);
    }
  });
});

suite('Files touched but unchanged', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let blob: string;
  const zero = '0'.repeat(40);
  const modified = (file: string, object: string, newId = zero) => ({
    oldMode: '100644',
    newMode: '100644',
    oldId: object,
    newId,
    file: {
      status: 'M' as const,
      path: file,
      oldPath: undefined,
      insertions: 0,
      deletions: 0,
    },
  });

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('touched'));
    await repository.commit('first', { 'a.txt': 'one\n' });
    [blob] = await repository.resolve('HEAD:a.txt');
  });

  suiteTeardown(() => removeFolder(repository.root));

  test('leaves out files only touched, whatever their names hold', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const names = ['"notes".md', 'Icon\r', 'two\nlines', 'back\\slash'];
    for (const name of names) {
      fs.writeFileSync(path.join(repository.root, name), `${name}\n`);
    }
    await repository.git('add', '--all');
    await repository.git('commit', '-m', 'names');
    const ids = await repository.resolve(
      ...names.map((name) => `HEAD:${name}`),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...names.map((name, index) => modified(name, ids[index])),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(files, []);
  });

  test('keeps every file as modified when one is gone before it is read', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('a.txt', blob),
      modified('gone.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['a.txt', 'gone.txt'],
    );
  });

  test('reads only the files git could not tell changed, not ones whose new text it already has', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('gone.txt', blob, '1'.repeat(40)),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['gone.txt'],
    );
  });

  test('keeps every file as modified when the first of many is gone, which git stops reading at', async () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      modified(`gone/${i}.txt`, blob),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...many,
      modified('a.txt', blob),
    ]);
    assert.strictEqual(files.length, many.length + 1);
  });
});
