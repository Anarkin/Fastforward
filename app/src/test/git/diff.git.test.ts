import * as assert from 'node:assert';
import {
  compareFiles,
  comparePatch,
  showFiles,
  showPatch,
} from '../../git/diff';
import { parsePatch } from '../../webview/diff';
import { renamingRepository, submoduleRepository } from '../gitFixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

suite('Git diff', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;

  suiteSetup(async () => {
    ({ temp, rename } = await renamingRepository('diff'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  suiteTeardown(() => removeFolder(cwd));

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
    try {
      await temp.commit('old', {
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
      await temp.commit('new', {
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
      const [hash] = await temp.resolve('HEAD');
      const patch = await showPatch(gitPath, cwd, hash);
      const changed = patch
        .slice(patch.indexOf('@@'))
        .split('\n')
        .filter((line) => /^[+-]./.test(line));
      assert.deepStrictEqual(changed, ['-## B', '-## C'], patch);
    } finally {
      await temp.git('reset', '--hard', rename);
    }
  });

  test('counts the bytes of the old and new text of each file whose lines changed', async () => {
    try {
      await temp.commit('old', { 'a.txt': 'one\n', 'b.txt': 'gone\n' });
      await temp.git('mv', 'b.txt', 'moved.txt');
      await temp.commit('new', { 'a.txt': 'three\n', 'c.txt': 'added\n' });
      const [hash] = await temp.resolve('HEAD');
      assert.deepStrictEqual(
        (await showFiles(gitPath, cwd, hash)).map((file) => [
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
      await temp.git('reset', '--hard', rename);
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

suite('Git diff of a submodule', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let inner: string;
  let repository: TempRepository;
  let sub: TempRepository;

  suiteSetup(async () => {
    ({ repository, sub, inner } = await submoduleRepository('submodule'));
    gitPath = repository.gitPath;
    cwd = repository.root;
  });

  suiteTeardown(() => removeFolder(cwd));

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

suite('Comparing two commits', function () {
  this.timeout(20_000);
  let repository: TempRepository;
  let feature: string;
  let main: string;
  let unrelated: string;

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('compare'));
    await repository.commit('root', { 'shared.txt': 'one\ntwo\n' });
    await repository.git('checkout', '-b', 'feature');
    await repository.commit('feature', {
      'shared.txt': 'one\nfeature\n',
      'feature.txt': 'feature only\n',
    });
    await repository.git('checkout', 'main');
    await repository.commit('main', { 'main.txt': 'main only\n' });
    await repository.git('checkout', '-q', '--orphan', 'unrelated');
    await repository.git('rm', '-q', '-r', '-f', '.');
    await repository.commit('unrelated', { 'other.txt': 'other\n' });
    await repository.git('checkout', '-q', 'main');
    [feature, main, unrelated] = await repository.resolve(
      'feature',
      'main',
      'unrelated',
    );
  });

  suiteTeardown(() => removeFolder(repository.root));

  test('lists every file whose content differs between commits on different branches', async () => {
    const files = await compareFiles(
      repository.gitPath,
      repository.root,
      feature,
      main,
    );
    assert.deepStrictEqual(
      files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['D', 'feature.txt', 0, 1],
        ['A', 'main.txt', 1, 0],
        ['M', 'shared.txt', 1, 1],
      ],
    );
  });

  test('diffs from the first commit to the second', async () => {
    const patch = await comparePatch(
      repository.gitPath,
      repository.root,
      main,
      feature,
      { path: 'shared.txt' },
    );
    assert.match(patch, /^-two$/m);
    assert.match(patch, /^\+feature$/m);
  });

  test('compares commits with no history in common', async () => {
    const files = await compareFiles(
      repository.gitPath,
      repository.root,
      main,
      unrelated,
    );
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['D', 'main.txt'],
        ['A', 'other.txt'],
        ['D', 'shared.txt'],
      ],
    );
    const patch = await comparePatch(
      repository.gitPath,
      repository.root,
      main,
      unrelated,
    );
    assert.deepStrictEqual(
      parsePatch(patch).map((file) => file.path),
      ['main.txt', 'other.txt', 'shared.txt'],
    );
  });
});
