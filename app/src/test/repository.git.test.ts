import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  fetchAllRemotes,
  readHead,
  readRefs,
  repositoryRoot,
} from '../git/repository';
import { showFiles, showPatch } from '../git/diff';
import {
  commitsStartingWith,
  findCommit,
  findCommits,
  searchCommits,
  listHistory,
  logCommits,
} from '../git/history';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Git repository', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  suiteSetup(async () => {
    temp = await tempRepository(tempFolder('repository'));
    gitPath = temp.gitPath;
    cwd = temp.root;
    await temp.commit('first', { 'first.txt': 'one\n' });
    await temp.commit('second', { 'second.txt': 'two\n' });
    await temp.git('mv', 'second.txt', 'renamed.txt');
    await temp.git('commit', '-m', 'rename');
    [rename, blob] = await temp.resolve('HEAD', 'HEAD:first.txt');
  });

  suiteTeardown(() => removeFolder(cwd));

  test("lists branches, remote branches and tags, but not a remote's HEAD", async () => {
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    await temp.git(
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/main',
    );
    await temp.git('tag', 'v1');
    await temp.git('tag', '-a', '-m', 'annotated', 'v2');
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.map(({ kind, name }) => `${kind} ${name}`).toSorted(),
        ['branch main', 'remote origin/main', 'tag v1', 'tag v2'],
      );
      assert.deepStrictEqual(
        new Set(refs.map((ref) => ref.commit)),
        new Set([rename]),
      );
    } finally {
      await temp.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      await temp.git('tag', '-d', 'v1', 'v2');
    }
  });

  test('reads the branch HEAD is on, or only its commit when detached', async () => {
    assert.deepStrictEqual(await readHead(gitPath, cwd), {
      name: 'main',
      commit: rename,
    });
    await temp.git('checkout', '-q', '--detach');
    try {
      assert.deepStrictEqual(await readHead(gitPath, cwd), {
        name: undefined,
        commit: rename,
      });
    } finally {
      await temp.git('checkout', '-q', 'main');
    }
  });

  test('reads the branch HEAD is on by its name, even with a tag of that name', async () => {
    await temp.git('tag', 'main');
    try {
      assert.strictEqual((await readHead(gitPath, cwd))?.name, 'main');
    } finally {
      await temp.git('tag', '-d', 'main');
    }
  });

  test('finds the root of the repository a folder is in, or none', async () => {
    fs.mkdirSync(path.join(cwd, 'inner'), { recursive: true });
    assert.strictEqual(
      await repositoryRoot(gitPath, path.join(cwd, 'inner')),
      path.resolve(cwd),
    );
    const outside = tempFolder('outside');
    try {
      assert.strictEqual(await repositoryRoot(gitPath, outside), undefined);
    } finally {
      removeFolder(outside);
    }
  });

  test('lists only the history of HEAD when solo, not a branch off it', async () => {
    const [first, tree] = await temp.resolve('HEAD~2', 'HEAD^{tree}');
    const side = (
      await temp.git('commit-tree', tree, '-p', first, '-m', 'side')
    ).trim();
    await temp.git('branch', 'side', side);
    try {
      const all = await listHistory(gitPath, cwd);
      const solo = await listHistory(gitPath, cwd, true);
      assert.ok(all.some((entry) => entry.hash === side));
      assert.strictEqual(solo.length, 3);
      assert.ok(!solo.some((entry) => entry.hash === side));
    } finally {
      await temp.git('branch', '-D', 'side');
    }
  });

  test('lists the history, its commits, their files and patches', async () => {
    const history = await listHistory(gitPath, cwd);
    assert.strictEqual(history.length, 3);
    assert.ok(history.every((entry) => entry.hash.length === 40));

    const hashes = history.map((entry) => entry.hash);
    const commits = await logCommits(gitPath, cwd, hashes.toReversed());
    assert.deepStrictEqual(
      commits.map((commit) => commit.subject),
      ['first', 'second', 'rename'],
    );

    const root = history.find((entry) => entry.parents.length === 0);
    assert.ok(root);
    const files = await showFiles(gitPath, cwd, root.hash);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [['A', 'first.txt']],
    );

    const patch = await showPatch(gitPath, cwd, root.hash, {
      path: 'first.txt',
    });
    assert.ok(patch.includes('b/first.txt'));
  });

  test('finds the commits a hash starts with', async () => {
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 7)),
      [rename],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, 'ffffff0'),
      [],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 3)),
      [],
    );
    assert.deepStrictEqual(await commitsStartingWith(gitPath, cwd, 'main'), []);
  });

  test('says which commit a typed hash is', async () => {
    assert.deepStrictEqual(await findCommit(gitPath, cwd, rename.slice(0, 7)), {
      kind: 'found',
      hash: rename,
      subject: 'rename',
    });
    assert.deepStrictEqual(
      await findCommit(gitPath, cwd, rename.slice(0, 7).toUpperCase()),
      { kind: 'found', hash: rename, subject: 'rename' },
    );
    assert.deepStrictEqual(await findCommit(gitPath, cwd, 'ffffff0'), {
      kind: 'none',
    });
    assert.deepStrictEqual(await findCommit(gitPath, cwd, blob.slice(0, 7)), {
      kind: 'none',
    });
    await temp.git('branch', 'fade', 'HEAD');
    try {
      assert.deepStrictEqual(await findCommit(gitPath, cwd, 'fade'), {
        kind: 'none',
      });
    } finally {
      await temp.git('branch', '-D', 'fade');
    }
  });

  test('reads the subject of a typed commit in its own encoding', async () => {
    const folder = tempFolder('message');
    try {
      const message = path.join(folder, 'message.txt');
      fs.writeFileSync(message, Buffer.from('caf\xe9\n', 'latin1'));
      const hash = (
        await temp.git(
          '-c',
          'i18n.commitEncoding=ISO-8859-1',
          'commit-tree',
          'HEAD^{tree}',
          '-F',
          message,
        )
      ).trim();
      assert.deepStrictEqual(
        await findCommit(gitPath, cwd, hash.slice(0, 12)),
        { kind: 'found', hash, subject: 'café' },
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('finds the one commit among other objects sharing its prefix, or says how many share it', async () => {
    const prefix = rename.slice(0, 4);
    const withPrefix = (type: string, content: (i: number) => string) => {
      for (let i = 0; ; i++) {
        const text = content(i);
        const header = `${type} ${Buffer.byteLength(text)}\0`;
        const sha1 = createHash('sha1')
          .update(header + text)
          .digest('hex');
        if (sha1.startsWith(prefix)) {
          return text;
        }
      }
    };
    const folder = tempFolder('objects');
    try {
      const write = async (type: string, text: string) => {
        const file = path.join(folder, type);
        fs.writeFileSync(file, text);
        await temp.git('hash-object', '-t', type, '-w', file);
      };
      await write(
        'blob',
        withPrefix('blob', (i) => `${i}\n`),
      );
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'found',
        hash: rename,
        subject: 'rename',
      });
      const [tree] = await temp.resolve('HEAD^{tree}');
      const person = 'Test <test@example.com> 0 +0000';
      await write(
        'commit',
        withPrefix(
          'commit',
          (i) =>
            `tree ${tree}\nauthor ${person}\ncommitter ${person}\n\n${i}\n`,
        ),
      );
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'ambiguous',
        count: 2,
      });
      const all = await findCommits(gitPath, cwd, prefix);
      assert.strictEqual(all.commits.length, 2);
      assert.ok(all.commits.some((commit) => commit.hash === rename));
      assert.strictEqual(all.more, 0);
      const limited = await findCommits(gitPath, cwd, prefix, 1);
      assert.strictEqual(limited.commits.length, 1);
      assert.strictEqual(limited.more, 1);
      assert.deepStrictEqual(await findCommits(gitPath, cwd, 'ffffff0'), {
        commits: [],
        more: 0,
      });
    } finally {
      removeFolder(folder);
    }
  });

  test("reads the same whatever the repository's config says", async () => {
    await temp.git('config', 'log.showRoot', 'false');
    await temp.git('config', 'i18n.logOutputEncoding', 'ISO-8859-1');
    try {
      const [root] = await temp.resolve('HEAD~2');
      assert.deepStrictEqual(
        (await showFiles(gitPath, cwd, root)).map((file) => file.path),
        ['first.txt'],
      );
      await temp.git(
        '-c',
        'user.name=Ádám',
        'commit',
        '--allow-empty',
        '-m',
        'é',
      );
      const [head] = await temp.resolve('HEAD');
      const [accented] = await logCommits(gitPath, cwd, [head]);
      assert.strictEqual(accented.authorName, 'Ádám');
      assert.strictEqual(accented.subject, 'é');
    } finally {
      await temp.git('reset', '--hard', rename);
      await temp.git('config', '--unset', 'log.showRoot');
      await temp.git('config', '--unset', 'i18n.logOutputEncoding');
    }
  });

  test('reads non-ASCII paths and blank context lines the same whatever the config says', async () => {
    await temp.git('config', 'core.quotePath', 'true');
    await temp.git('config', 'diff.suppressBlankEmpty', 'true');
    try {
      await temp.commit('add été', { 'été.txt': 'a\n\nb\n' });
      await temp.commit('change été', { 'été.txt': 'a\n\nc\n' });
      const [head] = await temp.resolve('HEAD');
      const patch = await showPatch(gitPath, cwd, head, { path: 'été.txt' });
      assert.ok(patch.includes('b/été.txt'), patch);
      assert.ok(patch.includes('\n \n'), patch);
    } finally {
      await temp.git('reset', '--hard', rename);
      await temp.git('config', '--unset', 'core.quotePath');
      await temp.git('config', '--unset', 'diff.suppressBlankEmpty');
    }
  });

  test('takes a path like [ab].md literally, not as a pattern', async () => {
    try {
      await temp.commit('add', { 'a.md': '1\n', '[ab].md': '1\n' });
      await temp.commit('change', { 'a.md': '2\n', '[ab].md': '2\n' });
      const [head] = await temp.resolve('HEAD');
      const patch = await showPatch(gitPath, cwd, head, { path: '[ab].md' });
      assert.ok(patch.includes('b/[ab].md'), patch);
      assert.ok(!patch.includes('b/a.md'), patch);
      const excluded = await showPatch(gitPath, cwd, head, {
        exclude: ['[ab].md'],
      });
      assert.ok(excluded.includes('b/a.md'), excluded);
      assert.ok(!excluded.includes('b/[ab].md'), excluded);
    } finally {
      await temp.git('reset', '--hard', rename);
    }
  });

  test('gives up on a fetch that stalls', async () => {
    await temp.git('remote', 'add', 'stalled', 'ssh://stalled.invalid/x');
    await temp.git('config', 'core.sshCommand', "sh -c 'sleep 15' --");
    try {
      const started = performance.now();
      await assert.rejects(
        fetchAllRemotes(gitPath, cwd, { timeout: 500 }),
        /git fetch timed out/,
      );
      assert.ok(performance.now() - started < 5000);
    } finally {
      await temp.git('config', '--unset', 'core.sshCommand');
      await temp.git('remote', 'remove', 'stalled');
    }
  });

  test('diffs a merge against its first parent', async () => {
    try {
      await temp.git('checkout', '-b', 'side');
      await temp.commit('side', { 'x.txt': 'x\n' });
      await temp.git('checkout', 'main');
      await temp.git('merge', '--no-ff', 'side', '-m', 'merge');
      const [merge] = await temp.resolve('HEAD');
      assert.deepStrictEqual(
        (await showFiles(gitPath, cwd, merge)).map((file) => [
          file.status,
          file.path,
        ]),
        [['A', 'x.txt']],
      );
      const patch = await showPatch(gitPath, cwd, merge);
      assert.ok(patch.includes('b/x.txt'), patch);
    } finally {
      await temp.git('checkout', '-f', 'main');
      await temp.git('reset', '--hard', rename);
      await temp.git('branch', '-D', 'side');
    }
  });

  test('diffs a renamed file as a rename', async () => {
    const files = await showFiles(gitPath, cwd, rename);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.oldPath, file.path]),
      [['R', 'second.txt', 'renamed.txt']],
    );
    const patch = await showPatch(gitPath, cwd, rename, {
      path: 'renamed.txt',
      oldPath: 'second.txt',
    });
    assert.ok(patch.includes('rename from second.txt'), patch);
    assert.ok(!patch.includes('new file mode'), patch);
  });
});

suite('Commit search', function () {
  this.timeout(60000);
  let search: TempRepository;
  let gitPath: string;

  suiteSetup(async () => {
    search = await tempRepository(tempFolder('search'));
    gitPath = search.gitPath;
    await search.git(
      'commit',
      '--allow-empty',
      '-m',
      'first',
      '--author',
      'Ada Lovelace <lovelace@example.com>',
    );
    await search.git(
      'commit',
      '--allow-empty',
      '-m',
      'second',
      '-m',
      'Mentions ada in the description',
    );
    await search.git(
      '-c',
      'user.name=Ada Byron',
      '-c',
      'user.email=byron@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'third',
      '--author',
      'Test <test@example.com>',
    );
    await search.commit('unrelated');
  });

  suiteTeardown(() => removeFolder(search.root));

  test('finds commits by author, committer or message, ignoring case, newest first, saying which matched', async () => {
    const found = await searchCommits(gitPath, search.root, 'ADA', false);
    assert.deepStrictEqual(
      found.commits.map(({ commit, fields }) => [commit.subject, fields]),
      [
        ['third', ['committer']],
        ['second', ['message']],
        ['first', ['author']],
      ],
    );
    assert.strictEqual(found.capped, false);
  });

  test('takes the text literally, and stops at the limit, saying there may be more', async () => {
    assert.deepStrictEqual(
      (await searchCommits(gitPath, search.root, 'a.a', false)).commits,
      [],
    );
    const limited = await searchCommits(
      gitPath,
      search.root,
      'ada',
      false,
      undefined,
      2,
    );
    assert.deepStrictEqual(
      limited.commits.map(({ commit }) => commit.subject),
      ['third', 'second'],
    );
    assert.strictEqual(limited.capped, true);
  });

  test('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      searchCommits(gitPath, search.root, 'ada', false, controller.signal),
    );
  });
});
