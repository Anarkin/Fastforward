import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gitErrorText } from '../../git/errorText';
import { showFiles, showPatch } from '../../git/diff';
import {
  commitsStartingWith,
  findCommit,
  findCommits,
  headCommit,
  listHistory,
  logCommits,
  searchCommits,
} from '../../git/history';
import { renamingRepository } from '../gitFixtures';
import {
  commitText,
  objectId,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

suite('Git history', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  suiteSetup(async () => {
    ({ temp, rename, blob } = await renamingRepository('history'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  suiteTeardown(() => removeFolder(cwd));

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
    const blobText = '476\n';
    const [found, other] = ['76', '2116'].map((message) =>
      commitText(emptyTree, message),
    );
    const prefix = objectId('blob', blobText).slice(0, 4);
    for (const text of [found, other]) {
      assert.ok(objectId('commit', text).startsWith(prefix));
    }
    const hash = objectId('commit', found);
    const folder = tempFolder('objects');
    try {
      const write = async (type: string, text: string) => {
        const file = path.join(folder, type);
        fs.writeFileSync(file, text);
        await temp.git('hash-object', '-t', type, '-w', file);
      };
      await write('blob', blobText);
      await write('commit', found);
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'found',
        hash,
      });
      await write('commit', other);
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'ambiguous',
        count: 2,
      });
      const all = await findCommits(gitPath, cwd, prefix);
      assert.strictEqual(all.commits.length, 2);
      assert.ok(all.commits.some((commit) => commit.hash === hash));
      assert.strictEqual(all.more, 0);
      const limited = await findCommits(gitPath, cwd, prefix, 1);
      assert.strictEqual(limited.commits.length, 1);
      assert.strictEqual(limited.more, 1);
    } finally {
      removeFolder(folder);
    }
  });

  test('lists at most 20 commits sharing a prefix, counting the rest', async () => {
    const prefix = '0000';
    const texts = [
      66330, 82218, 163167, 165457, 204413, 272219, 337817, 428796, 449636,
      536741, 729867, 801315, 833667, 884169, 953508, 978456, 1010149, 1011515,
      1275593, 1281590, 1353900,
    ].map((message) => commitText(emptyTree, `${message}`));
    const folder = tempFolder('prefixed');
    try {
      const files = texts.map((text, index) => {
        assert.ok(objectId('commit', text).startsWith(prefix));
        const file = path.join(folder, `${index}`);
        fs.writeFileSync(file, text);
        return file;
      });
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
});

suite('Git history of a repository without commits', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    const repository = await tempRepository(tempFolder('empty'));
    gitPath = repository.gitPath;
    cwd = repository.root;
  });

  suiteTeardown(() => removeFolder(cwd));

  test('has no HEAD and an empty history', async () => {
    assert.strictEqual(await headCommit(gitPath, cwd), undefined);
    assert.deepStrictEqual(await listHistory(gitPath, cwd), []);
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

  test('stops when cancelled, before or while it searches', async () => {
    const before = new AbortController();
    before.abort();
    await assert.rejects(
      searchCommits(gitPath, search.root, 'ada', false, before.signal),
      (error) => error === before.signal.reason,
    );
    const during = new AbortController();
    const searching = searchCommits(
      gitPath,
      search.root,
      'ada',
      false,
      during.signal,
    );
    during.abort();
    await assert.rejects(searching, (error) => error === during.signal.reason);
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
