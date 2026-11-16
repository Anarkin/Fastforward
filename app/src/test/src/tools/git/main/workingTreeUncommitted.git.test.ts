import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { workingTreeFiles } from '../../../../../tools/git/main/workingTree';
import {
  UntrackedPatches,
  workingTreePatch,
} from '../../../../../tools/git/main/workingTreePatch';
import {
  isLargeChange,
  leftOutChanges,
} from '../../../../../components/diff/shared/patchBudget';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { tempRepository } from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { symlinkOrSkip } from '../../../../helpers/links';

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

  test('lists modified and untracked files, counting the bytes of the old and new text of each changed file', async () => {
    const { files } = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['M', 'tracked.txt'],
        ['U', 'nested/'],
        ['U', 'untracked.txt'],
      ],
    );
    assert.deepStrictEqual(
      files.map((file) => [file.path, file.bytes]),
      [
        ['tracked.txt', 8],
        ['nested/', undefined],
        ['untracked.txt', 4],
      ],
    );
  });

  test('lists the untracked files git lists as untracked and not ignored, in its order', async () => {
    const repository = await tempRepository(tempFolder('untracked'));
    const { root } = repository;
    try {
      await repository.commit('initial', {
        '.gitignore': '*.log\n!keep.log\nignored/\n',
        'removed.txt': 'kept on disk\n',
      });
      await repository.git('rm', '-q', '--cached', 'removed.txt');
      const files = {
        'a b ü.txt': 'spaces and more\n',
        'deep/er/new.txt': 'new\n',
        'x.log': 'ignored\n',
        'keep.log': 'kept\n',
        'ignored/f.txt': 'ignored\n',
        '-dash.txt': 'dash\n',
      };
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      }
      fs.mkdirSync(path.join(root, 'empty'));
      await tempRepository(path.join(root, 'nested'));
      const listed = (
        await repository.git('ls-files', '--others', '--exclude-standard', '-z')
      )
        .split('\0')
        .filter(Boolean);
      assert.deepStrictEqual(
        (await workingTreeFiles(gitPath, root)).untracked,
        listed,
      );
      assert.deepStrictEqual(listed.toSorted(), [
        '-dash.txt',
        'a b ü.txt',
        'deep/er/new.txt',
        'keep.log',
        'nested/',
        'removed.txt',
      ]);
    } finally {
      removeFolder(root);
    }
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

  test('counts an untracked text file over 2 MB as a large change too large to count, rather than reading it whole to count its lines, and a huge binary one as no lines', async () => {
    const files: Record<string, string | Buffer> = {
      'huge.txt': 'x\n'.repeat(1024 * 1024) + 'x',
      'exact.txt': 'x\n'.repeat(1024 * 1024),
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
      assert.strictEqual(text.uncounted, true);
      assert.strictEqual(text.insertions, 0);
      assert.strictEqual(binary?.insertions, 0);
      assert.strictEqual(binary?.uncounted, undefined);
      const exact = changes.find((change) => change.path === 'exact.txt');
      assert.strictEqual(exact?.insertions, 1024 * 1024);
      assert.strictEqual(exact?.uncounted, undefined);
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts an untracked symlink as the one line git diffs it as, its target, and marks it as a link, and no file beside it', async (context) => {
    const target = path.join(cwd, 'target.txt');
    const link = path.join(cwd, 'link');
    symlinkOrSkip(context, 'target.txt', link);
    fs.writeFileSync(target, 'a\nb\n');
    try {
      const { files } = await workingTreeFiles(gitPath, cwd);
      assert.strictEqual(
        files.find((change) => change.path === 'link')?.insertions,
        1,
      );
      const linkOf = (file: string) =>
        files.find((change) => change.path === file)?.link;
      assert.strictEqual(linkOf('link'), true);
      assert.strictEqual(linkOf('target.txt'), undefined);
      assert.ok(files.some((change) => change.path === 'target.txt'));
    } finally {
      fs.rmSync(link);
      fs.rmSync(target);
    }
  });

  test('marks a symbolic link changed in the working tree or the index as a link, though checked out as a plain file where git makes no links', async () => {
    const links = await tempRepository(tempFolder('plain-links'));
    try {
      await links.git('config', 'core.symlinks', 'false');
      const content = path.join(links.root, 'content');
      fs.writeFileSync(content, 'README');
      const [blob] = (await links.git('hash-object', '-w', 'content')).split(
        '\n',
      );
      fs.rmSync(content);
      await links.git(
        'update-index',
        '--add',
        '--cacheinfo',
        `120000,${blob},AGENTS.md`,
        '--cacheinfo',
        `120000,${blob},staged`,
      );
      await links.git('commit', '-q', '-m', 'links');
      await links.git('checkout', '--', 'AGENTS.md', 'staged');
      fs.writeFileSync(path.join(links.root, 'AGENTS.md'), 'docs/README');
      fs.writeFileSync(path.join(links.root, 'staged'), 'docs/README');
      await links.git('add', 'staged');
      const { files, staged = [] } = await workingTreeFiles(
        links.gitPath,
        links.root,
      );
      assert.deepStrictEqual(
        [...files, ...staged].map((change) => [change.path, change.link]),
        [
          ['AGENTS.md', true],
          ['staged', true],
        ],
      );
    } finally {
      removeFolder(links.root);
    }
  });

  test('counts and diffs only the first 50 untracked files, against the index or a commit either way, leaving the rest out of the patch to load when opened, as each one is read on its own to count its lines and diffed by a git of its own', async () => {
    const many = path.join(cwd, 'many');
    fs.mkdirSync(many);
    for (let i = 0; i <= 50; i++) {
      fs.writeFileSync(
        path.join(many, `f${String(i).padStart(2, '0')}.txt`),
        `many${i}\n`,
      );
    }
    try {
      for (const diff of [
        undefined,
        { base: 'HEAD', reverse: false },
        { base: 'HEAD', reverse: true },
      ]) {
        const workingTree = await workingTreeFiles(gitPath, cwd, diff);
        const lines = (file: string) => {
          const change = workingTree.files.find((one) => one.path === file);
          return change && change.insertions + change.deletions;
        };
        assert.strictEqual(lines('many/f49.txt'), 1);
        assert.strictEqual(lines('many/f50.txt'), 0);
        assert.deepStrictEqual(
          leftOutChanges(workingTree.files).filter((file) =>
            file.path.startsWith('many/'),
          ),
          [{ path: 'many/f50.txt', lines: undefined }],
        );
        const patch = await workingTreePatch(gitPath, cwd, workingTree, {
          include: ['many/f49.txt', 'many/f50.txt'],
        });
        assert.ok(patch.includes('many49'), patch);
        assert.ok(!patch.includes('many50'), patch);
        const alone = await workingTreePatch(gitPath, cwd, workingTree, {
          path: 'many/f50.txt',
        });
        assert.ok(alone.includes('many50'), alone);
      }
    } finally {
      fs.rmSync(many, { recursive: true });
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
      const patches = new UntrackedPatches(Infinity);
      await assert.rejects(
        workingTreePatch(gitPath, cwd, workingTree, scope, patches, signal),
      );
      assert.strictEqual(patches.size, 0);
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
