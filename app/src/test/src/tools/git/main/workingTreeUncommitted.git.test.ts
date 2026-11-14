import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  UntrackedPatches,
  workingTreeFiles,
  workingTreePatch,
} from '../../../../../tools/git/main/workingTree';
import {
  isLargeChange,
  leftOutChanges,
} from '../../../../../tools/git/shared/protocol';
import { parsePatch } from '../../../../../tools/git/page/diff';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { holdingGit } from './workingTreeFixtures';

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

suite('Comparing a commit with the working tree', () => {
  let repository: TempRepository;
  let first: string;

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('compare-working-tree'));
    await repository.commit('first', { 'kept.txt': 'one\n' });
    await repository.commit('second', {
      'kept.txt': 'two\n',
      'later.txt': 'later\n',
    });
    [first] = await repository.resolve('HEAD~1');
    fs.writeFileSync(path.join(repository.root, 'kept.txt'), 'three\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
  });

  afterAll(() => removeFolder(repository.root));

  test('lists the comparison from the untracked files a listing of the working tree found, without asking git for them again, as listing it anew would', async () => {
    await repository.git('rm', '-q', '--cached', 'kept.txt');
    try {
      const listing = await workingTreeFiles(
        repository.gitPath,
        repository.root,
      );
      for (const reverse of [false, true]) {
        const diff = { base: first, reverse };
        const fresh = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          diff,
        );
        const recording = holdingGit(() => false);
        try {
          const reused = await workingTreeFiles(
            repository.gitPath,
            repository.root,
            diff,
            undefined,
            listing.listedUntracked,
          );
          assert.deepStrictEqual(reused, fresh);
          assert.ok(!recording.started('--untracked-files=all'));
          assert.ok(!recording.started('--others'));
        } finally {
          recording.release();
        }
      }
    } finally {
      await repository.git('reset', '-q', '--', 'kept.txt');
    }
  });

  test('diffs from the commit to the files on disk', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: false },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['A', 'later.txt', 1, 0],
        ['U', 'new.txt', 1, 0],
      ],
    );
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.match(patch, /^-one$/m);
    assert.match(patch, /^\+three$/m);
    assert.match(patch, /^\+new$/m);
  });

  test('diffs from the files on disk to the commit, an untracked file as deleted', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: true },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['D', 'later.txt', 0, 1],
        ['D', 'new.txt', 0, 1],
      ],
    );
    assert.ok(workingTree.files.every((file) => (file.bytes ?? 0) > 0));
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.deepStrictEqual(
      parsePatch(patch).map((file) => file.path),
      ['kept.txt', 'later.txt', 'new.txt'],
    );
    assert.match(patch, /^-three$/m);
    assert.match(patch, /^\+one$/m);
    assert.match(patch, /^-new$/m);
    const alone = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
      { path: 'new.txt' },
    );
    assert.match(alone, /^-new$/m);
  });

  test('diffs an untracked file again when the direction changes, not reusing the patch kept', async () => {
    const patches = new UntrackedPatches(Infinity);
    const patchOf = async (reverse: boolean) =>
      workingTreePatch(
        repository.gitPath,
        repository.root,
        await workingTreeFiles(repository.gitPath, repository.root, {
          base: first,
          reverse,
        }),
        { path: 'new.txt' },
        patches,
      );
    assert.match(await patchOf(false), /^\+new$/m);
    assert.match(await patchOf(true), /^-new$/m);
    assert.match(await patchOf(false), /^\+new$/m);
  });

  test('leaves out a file only touched on disk, in either direction', async () => {
    const file = path.join(repository.root, 'later.txt');
    const past = new Date(Date.UTC(2020, 0, 1));
    fs.utimesSync(file, past, past);
    try {
      for (const reverse of [false, true]) {
        const { files } = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          { base: 'HEAD', reverse },
        );
        assert.deepStrictEqual(
          files.map((change) => change.path),
          ['kept.txt', 'new.txt'],
        );
      }
    } finally {
      const now = new Date();
      fs.utimesSync(file, now, now);
    }
  });
});
