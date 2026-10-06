import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  fetchAllRemotes,
  readHead,
  readRefs,
  repositoryRoot,
  switchToBranch,
} from '../git/repository';
import { readUpstream } from '../git/branches';
import { showFiles, showPatch } from '../git/diff';
import { gitErrorText } from '../git/errorText';
import {
  commitsStartingWith,
  findCommit,
  findCommits,
  searchCommits,
  listHistory,
  logCommits,
} from '../git/history';
import {
  asIfOwnedByAnother,
  commitText,
  objectId,
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

  test('reads the upstream of the checked-out branch, or why it has none', async () => {
    await temp.git('remote', 'add', 'origin', 'https://example.com/x.git');
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD~1');
    const [behind] = await temp.resolve('HEAD~1');
    try {
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'none',
        branch: 'main',
      });
      await temp.git('branch', '--set-upstream-to=origin/main');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'found',
        branch: 'main',
        name: 'origin/main',
        commit: behind,
      });
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'gone',
        branch: 'main',
        name: 'origin/main',
      });
      await temp.git('switch', '-q', '--detach');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'detached',
      });
    } finally {
      await temp.git('switch', '-q', 'main');
      await temp.git('remote', 'remove', 'origin');
    }
  });

  test('leaves out the tags that point at a tree or a blob', async () => {
    await temp.git('tag', 'tree', 'HEAD^{tree}');
    await temp.git('tag', '-a', '-m', 'blob', 'blob', blob);
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.map(({ kind, name }) => `${kind} ${name}`),
        ['branch main'],
      );
    } finally {
      await temp.git('tag', '-d', 'tree', 'blob');
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

  test('tells which remote a remote branch is of, even one with a slash in its name', async () => {
    await temp.git('remote', 'add', 'team/fork', cwd);
    await temp.git('update-ref', 'refs/remotes/team/fork/main', 'HEAD');
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.filter((ref) => ref.kind === 'remote'),
        [
          {
            kind: 'remote',
            name: 'team/fork/main',
            remote: 'team/fork',
            commit: rename,
          },
        ],
      );
    } finally {
      await temp.git('remote', 'remove', 'team/fork');
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

  test('finds the root of the repository a folder is in through a link to it', async () => {
    fs.mkdirSync(path.join(cwd, 'sub', 'deep'), { recursive: true });
    const outside = tempFolder('link');
    try {
      const link = path.join(outside, 'link');
      fs.symlinkSync(path.join(cwd, 'sub', 'deep'), link, 'junction');
      const root = await repositoryRoot(gitPath, link);
      assert.ok(root !== undefined);
      assert.strictEqual(
        fs.realpathSync.native(root),
        fs.realpathSync.native(cwd),
      );
    } finally {
      removeFolder(outside);
    }
  });

  test('finds no root in a folder that is gone', async () => {
    const gone = tempFolder('gone');
    removeFolder(gone);
    assert.strictEqual(await repositoryRoot(gitPath, gone), undefined);
  });

  test('says what git said when it refuses a repository, not that there is none', async () => {
    await asIfOwnedByAnother(() =>
      assert.rejects(repositoryRoot(gitPath, cwd), (error) => {
        assert.match(gitErrorText(error), /^fatal: detected dubious ownership/);
        return true;
      }),
    );
  });

  test('finds no root in a bare repository or a git folder, which have no working tree', async () => {
    const bare = await tempRepository(tempFolder('bare'), { bare: true });
    try {
      assert.strictEqual(await repositoryRoot(gitPath, bare.root), undefined);
      assert.strictEqual(
        await repositoryRoot(gitPath, path.join(cwd, '.git')),
        undefined,
      );
    } finally {
      removeFolder(bare.root);
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
    });
    assert.deepStrictEqual(
      await findCommit(gitPath, cwd, rename.slice(0, 7).toUpperCase()),
      { kind: 'found', hash: rename },
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

  test('reads the subject of a commit found by its hash in its own encoding', async () => {
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
      const { commits } = await findCommits(gitPath, cwd, hash.slice(0, 12));
      assert.deepStrictEqual(
        commits.map((commit) => [commit.hash, commit.subject]),
        [[hash, 'café']],
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
        if (objectId(type, text).startsWith(prefix)) {
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
      });
      const [tree] = await temp.resolve('HEAD^{tree}');
      await write(
        'commit',
        withPrefix('commit', (i) => commitText(tree, `${i}`)),
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

  test('lists at most 20 commits sharing a prefix, counting the rest', async () => {
    const prefix = '0000';
    const [tree] = await temp.resolve('HEAD^{tree}');
    const folder = tempFolder('prefixed');
    try {
      const files: string[] = [];
      for (let i = 0; files.length < 21; i++) {
        const text = commitText(tree, `${i}`);
        if (objectId('commit', text).startsWith(prefix)) {
          const file = path.join(folder, `${files.length}`);
          fs.writeFileSync(file, text);
          files.push(file);
        }
      }
      await temp.git('hash-object', '-t', 'commit', '-w', ...files);
      const found = await findCommits(gitPath, cwd, prefix);
      assert.strictEqual(found.commits.length, 20);
      assert.strictEqual(found.more, 1);
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
      const included = await showPatch(gitPath, cwd, head, {
        include: ['[ab].md'],
      });
      assert.ok(included.includes('b/[ab].md'), included);
      assert.ok(!included.includes('b/a.md'), included);
    } finally {
      await temp.git('reset', '--hard', rename);
    }
  });

  test("runs hooks without the settings it reads git's output with", async () => {
    const folder = tempFolder('hooked');
    const seen = path.join(folder, 'seen.txt').replaceAll('\\', '/');
    const hooks = path.join(cwd, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\necho "[$GIT_LITERAL_PATHSPECS][$GIT_OPTIONAL_LOCKS][$GIT_CONFIG_PARAMETERS]" > '${seen}'\n`,
      { mode: 0o755 },
    );
    await temp.git('branch', 'hooked');
    try {
      await switchToBranch(gitPath, cwd, 'hooked');
      const [, literal, locks, config = ''] =
        /^\[(.*)\]\[(.*)\]\[(.*)\]$/.exec(
          fs.readFileSync(seen, 'utf8').trim(),
        ) ?? [];
      assert.strictEqual(literal, '');
      assert.strictEqual(locks, '');
      assert.doesNotMatch(config, /autoRefreshIndex|quotePath/);
    } finally {
      fs.rmSync(path.join(hooks, 'post-checkout'));
      await temp.git('checkout', '-q', 'main');
      await temp.git('branch', '-D', 'hooked');
      removeFolder(folder);
    }
  });

  test('says only what git said when it fails, keeping the command for the log', async () => {
    await assert.rejects(
      switchToBranch(gitPath, cwd, 'no-such-branch'),
      (error) => {
        assert.strictEqual(
          gitErrorText(error),
          'fatal: invalid reference: no-such-branch',
        );
        assert.match(String(error), /git switch .*no-such-branch failed/);
        return true;
      },
    );
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

  test('keeps a line as it is when blank lines around it are added and removed', async () => {
    const spaced = await tempRepository(tempFolder('spaced'));
    try {
      await spaced.commit('old', {
        'a.md': [
          '# A',
          '',
          '## B',
          '',
          '- one',
          '- two',
          '- three',
          '- four',
          '',
          '## C',
          '',
          '- five',
          '- six',
          '',
        ].join('\n'),
      });
      await spaced.commit('new', {
        'a.md': [
          '# A',
          '',
          '- one',
          '',
          '- two',
          '',
          '- three',
          '',
          '- four',
          '',
          '- five',
          '',
          '- six',
          '',
        ].join('\n'),
      });
      const [hash] = await spaced.resolve('HEAD');
      const patch = await showPatch(gitPath, spaced.root, hash);
      const changed = patch
        .slice(patch.indexOf('@@'))
        .split('\n')
        .filter((line) => /^[+-]./.test(line));
      assert.deepStrictEqual(changed, ['-## B', '-## C'], patch);
    } finally {
      removeFolder(spaced.root);
    }
  });

  test('counts the bytes of the old and new text of each file whose lines changed', async () => {
    const sized = await tempRepository(tempFolder('sized'));
    try {
      await sized.commit('old', { 'a.txt': 'one\n', 'b.txt': 'gone\n' });
      await sized.git('mv', 'b.txt', 'moved.txt');
      await sized.commit('new', { 'a.txt': 'three\n', 'c.txt': 'added\n' });
      const [hash] = await sized.resolve('HEAD');
      assert.deepStrictEqual(
        (await showFiles(gitPath, sized.root, hash)).map((file) => [
          file.path,
          file.bytes,
        ]),
        [
          ['a.txt', 10],
          ['c.txt', 6],
          ['moved.txt', undefined],
        ],
      );
    } finally {
      removeFolder(sized.root);
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
    await search.git(
      'commit',
      '--allow-empty',
      '-m',
      'Literal (a+b)*[c]\\d? text',
      '-m',
      'Élan in the description',
      '--author',
      'Old Name <old@example.com>',
    );
    await search.commit('unrelated');
    await search.commit('Separated\x1eby a record separator');
    fs.writeFileSync(
      path.join(search.root, '.mailmap'),
      'New Name <old@example.com>\n',
    );
  });

  suiteTeardown(() => removeFolder(search.root));

  const subjectsFound = async (query: string) =>
    (await searchCommits(gitPath, search.root, query, false)).commits.map(
      (commit) => commit.subject,
    );

  test('finds commits by author, committer or message, ignoring case, newest first', async () => {
    const found = await searchCommits(gitPath, search.root, 'ADA', false);
    assert.deepStrictEqual(
      found.commits.map((commit) => commit.subject),
      ['third', 'second', 'first'],
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
      limited.commits.map((commit) => commit.subject),
      ['third', 'second'],
    );
    assert.strictEqual(limited.capped, true);
  });

  test('finds authors by their mailmapped names, and takes special characters and any letters literally, ignoring case', async () => {
    const literal = 'Literal (a+b)*[c]\\d? text';
    assert.deepStrictEqual(await subjectsFound('NEW NAME <old@'), [literal]);
    assert.deepStrictEqual(await subjectsFound('old name'), []);
    assert.deepStrictEqual(await subjectsFound('(A+B)*[C]\\D?'), [literal]);
    assert.deepStrictEqual(await subjectsFound('ÉLAN in'), [literal]);
    assert.deepStrictEqual(await subjectsFound('text\n\nélan'), [literal]);
  });

  test('searches the whole of a commit with a record separator in its message', async () => {
    const subject = 'Separated\x1eby a record separator';
    assert.deepStrictEqual(await subjectsFound('by a record'), [subject]);
    assert.deepStrictEqual(await subjectsFound('fine'), []);
  });

  test('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      searchCommits(gitPath, search.root, 'ada', false, controller.signal),
    );
  });

  test('says only what git said when it fails', async () => {
    const outside = tempFolder('unsearched');
    try {
      await assert.rejects(
        searchCommits(gitPath, outside, 'ada', false),
        (error) => {
          assert.match(gitErrorText(error), /^fatal: not a git repository/);
          assert.match(String(error), /git log failed/);
          return true;
        },
      );
    } finally {
      removeFolder(outside);
    }
  });
});

suite('Test repository', function () {
  this.timeout(20_000);

  test("commits whatever the user's own git config says, which may sign commits", async () => {
    const folder = tempFolder('own-config');
    const own = process.env.GIT_CONFIG_GLOBAL;
    const config = path.join(folder, '.gitconfig');
    fs.writeFileSync(
      config,
      '[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = missing-gpg\n',
    );
    process.env.GIT_CONFIG_GLOBAL = config;
    try {
      const repository = await tempRepository(path.join(folder, 'repository'));
      await repository.commit('unsigned');
    } finally {
      if (own === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = own;
      }
      removeFolder(folder);
    }
  });
});
