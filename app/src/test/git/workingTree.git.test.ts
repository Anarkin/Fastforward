import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listTree, maxFileSize } from '../../git/files';
import {
  stagedPatch,
  uncommittedCount,
  withoutTouched,
  workingTreeFiles,
  workingTreePatch,
  type UntrackedPatches,
} from '../../git/workingTree';
import { isLargeChange } from '../../shared/protocol';
import { parsePatch } from '../../webview/diff';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

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

  test('lists staged files as added, and untracked ones', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.staged?.map((file) => [file.status, file.path]),
      [['A', 'staged.txt']],
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [['U', 'untracked.txt']],
    );
    const patch = await stagedPatch(gitPath, cwd, { path: 'staged.txt' });
    assert.ok(patch.includes('+one'), patch);
  });
});

suite('Files touched but unchanged', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  let index: string;
  let blob: string;
  const zero = '0'.repeat(40);
  const modified = (file: string, object: string, newId = zero) => ({
    oldMode: '100644',
    newMode: '100644',
    oldId: object,
    newId,
    linesCounted: true,
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
    gitPath = repository.gitPath;
    cwd = repository.root;
    index = path.join(cwd, '.git', 'index');
    await repository.git('config', 'core.autocrlf', 'true');
    await repository.commit('initial', {
      'text.txt': 'text\n',
      'binary.bin': '\0\x01\x02',
      'crlf.txt': 'one\r\ntwo\r\n',
      'changed.txt': 'old\n',
      'a.txt': 'one\n',
    });
    [blob] = await repository.resolve('HEAD:a.txt');
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

  test('leaves out files only touched, whatever their names hold', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const names = ['"notes".md', 'Icon\r', 'two\nlines', 'back\\slash'];
    for (const name of names) {
      fs.writeFileSync(path.join(repository.root, name), `${name}\n`);
    }
    await repository.git('add', '--all', '--', '.', ':!changed.txt');
    await repository.git('commit', '-m', 'names');
    const ids = await repository.resolve(
      ...names.map((name) => `HEAD:${name}`),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...names.map((name, i) => modified(name, ids[i])),
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

suite(
  'Files touched but unchanged, committed with CRLF before autocrlf was on',
  function () {
    this.timeout(20_000);

    test('leaves out the touched file, which git does not count as changed, but keeps a changed binary file, whose lines git does not count', async () => {
      const repository = await tempRepository(tempFolder('touched-crlf'));
      const cwd = repository.root;
      try {
        await repository.git('config', 'core.autocrlf', 'false');
        await repository.commit('initial', {
          'crlf.txt': 'one\r\ntwo\r\n',
          'binary.bin': '\0\x01\x02',
        });
        await repository.git('config', 'core.autocrlf', 'true');
        fs.writeFileSync(path.join(cwd, 'binary.bin'), '\0\x01\x03');
        const past = new Date(Date.UTC(2020, 0, 1));
        for (const file of ['crlf.txt', 'binary.bin']) {
          fs.utimesSync(path.join(cwd, file), past, past);
        }
        const workingTree = await workingTreeFiles(repository.gitPath, cwd);
        assert.deepStrictEqual(
          workingTree.files.map((file) => [file.status, file.path]),
          [['M', 'binary.bin']],
        );
      } finally {
        removeFolder(cwd);
      }
    });
  },
);

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
      const { files } = await workingTreeFiles(repository.gitPath, cwd, {
        base: 'HEAD',
        reverse: false,
      });
      assert.deepStrictEqual(
        files.map((file) => [file.status, file.path, file.bytes]),
        [['R', 'new.txt', old.length * 2 + 'extra\n'.length]],
      );
    } finally {
      removeFolder(cwd);
    }
  });
});

suite('Staged and unstaged changes', function () {
  this.timeout(20_000);
  let repository: TempRepository;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('staged'));
    await repository.commit('initial', {
      'both.txt': 'one\n',
      'staged.txt': 'a\n',
      'unstaged.txt': 'x\n',
      'uncached.txt': 'kept\n',
    });
    const write = (file: string, text: string) =>
      fs.writeFileSync(path.join(repository.root, file), text);
    write('both.txt', 'two\n');
    write('staged.txt', 'b\n');
    await repository.git('add', 'both.txt', 'staged.txt');
    await repository.git('rm', '-q', '--cached', 'uncached.txt');
    write('both.txt', 'three\n');
    write('unstaged.txt', 'y\n');
    write('new.txt', 'new\n');
  });

  suiteTeardown(() => removeFolder(repository.root));

  test('lists the staged changes apart from the unstaged ones, which it diffs against the index', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
    );
    assert.deepStrictEqual(
      workingTree.staged?.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'staged.txt'],
        ['D', 'uncached.txt'],
      ],
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'unstaged.txt'],
        ['U', 'new.txt'],
        ['U', 'uncached.txt'],
      ],
    );
    assert.strictEqual(uncommittedCount(workingTree), 5);
  });

  test('diffs the staged half of a file against HEAD and its unstaged half against the index', async () => {
    const staged = await stagedPatch(repository.gitPath, repository.root, {
      path: 'both.txt',
    });
    assert.match(staged, /^-one$/m);
    assert.match(staged, /^\+two$/m);
    const unstaged = await workingTreePatch(
      repository.gitPath,
      repository.root,
      await workingTreeFiles(repository.gitPath, repository.root),
      { path: 'both.txt' },
    );
    assert.match(unstaged, /^-two$/m);
    assert.match(unstaged, /^\+three$/m);
  });

  test('lists a file removed from the index but kept on disk once against HEAD, as deleted, and diffs its deletion', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: 'HEAD', reverse: false },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'staged.txt'],
        ['D', 'uncached.txt'],
        ['M', 'unstaged.txt'],
        ['U', 'new.txt'],
      ],
    );
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
      { path: 'uncached.txt' },
    );
    assert.match(patch, /^-kept$/m);
  });
});

suite('A conflicted merge', function () {
  this.timeout(20_000);
  let conflicted: TempRepository;

  suiteSetup(async () => {
    conflicted = await tempRepository(tempFolder('conflicted'));
    await conflicted.commit('initial');
    await conflicted.git('checkout', '-q', '-b', 'side');
    await conflicted.commit('side', { 'conflict.txt': 'a\n' });
    await conflicted.git('checkout', '-q', 'main');
    await conflicted.commit('main', { 'conflict.txt': 'b\n' });
    await assert.rejects(conflicted.git('merge', 'side'));
  });

  suiteTeardown(() => removeFolder(conflicted.root));

  test('lists the conflicted file once, with the unstaged changes', async () => {
    const workingTree = await workingTreeFiles(
      conflicted.gitPath,
      conflicted.root,
    );
    assert.deepStrictEqual(workingTree.staged, []);
    assert.deepStrictEqual(
      workingTree.files.map((file) => file.path),
      ['conflict.txt'],
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
      const patch = await workingTreePatch(gitPath, cwd, workingTree, {
        include: ['many/f49.txt', 'many/f50.txt'],
      });
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
    } finally {
      fs.rmSync(draft);
    }
  });

  test('forgets the patch kept of an untracked file the list no longer has', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'draft\n');
    try {
      const patches: UntrackedPatches = new Map();
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

suite('Comparing a commit with the working tree', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let first: string;

  suiteSetup(async () => {
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

  suiteTeardown(() => removeFolder(repository.root));

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
    const patches: UntrackedPatches = new Map();
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
