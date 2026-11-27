import * as assert from 'node:assert';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { tempRepository, type TempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const root = path.join(__dirname, '..', '..', '..', '..');
const script = path.join(root, 'app', 'scripts', 'commitMessage.mts');

suite('Commit messages checked by git', () => {
  let folder: string;
  let repository: TempRepository;
  let start: string;

  beforeEach(async () => {
    folder = tempFolder('commit-message');
    repository = await tempRepository(path.join(folder, 'repository'));
    await repository.commit('chore: start', { a: 'a' });
    [start] = await repository.resolve('HEAD');
    await repository.git(
      'config',
      'core.hooksPath',
      path.join(root, '.githooks'),
    );
  });

  afterEach(() => removeFolder(folder));

  const checking = (range: string) =>
    new Promise<{ code: number; said: string }>((resolve) => {
      execFile(
        process.execPath,
        [script, '--commits', range],
        { cwd: repository.root },
        (error, _stdout, stderr) =>
          resolve({
            code: typeof error?.code === 'number' ? error.code : 0,
            said: stderr,
          }),
      );
    });

  test('keeps the hook executable in the index, as git on macOS and Linux runs no hook that is not', () => {
    assert.match(
      execFileSync(
        'git',
        ['ls-files', '--stage', '--', '.githooks/commit-msg'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ),
      /^100755 /,
    );
  });

  test('refuses a commit whose message breaks the rules, naming each line and how to edit the message it keeps', async () => {
    await assert.rejects(
      repository.commit('Fix: a\n\n- b\n\nCo-authored-by: x', { b: 'b' }),
      (error: Error) => {
        assert.match(
          error.message,
          /The commit message breaks the rules of CONTRIBUTING\.md:\n {2}line 1: not <type>/,
        );
        assert.match(error.message, /\n {2}line 4: a blank line in the body\n/);
        assert.match(error.message, /\n {2}line 5: a footer or trailer\n/);
        assert.match(error.message, /git commit -e -F \S*COMMIT_EDITMSG/);
        return true;
      },
    );
    assert.deepStrictEqual(await repository.resolve('HEAD'), [start]);
  });

  test('takes a commit whose message follows the rules once cleaned up as git cleans it, without its comments, the blanks ending its lines and its runs of blank lines', async () => {
    const message = path.join(folder, 'message');
    fs.writeFileSync(
      message,
      'fix: a  \n\n\n- b\n# Please enter the commit message for your changes.\n#\n',
    );
    await repository.git(
      'commit',
      '--allow-empty',
      '--cleanup=strip',
      '-F',
      message,
    );
    assert.strictEqual(
      await repository.git('log', '-1', '--format=%B'),
      'fix: a\n\n- b\n\n',
    );
  });

  test('names each commit of a range whose message breaks the rules, with its lines, and nothing of the commits that follow them', async () => {
    await repository.git(
      'commit',
      '--allow-empty',
      '--no-verify',
      '-m',
      'fix: kept',
    );
    await repository.git(
      'commit',
      '--allow-empty',
      '--no-verify',
      '-m',
      'broken',
    );
    const [broken] = await repository.resolve('--short', 'HEAD');
    await repository.git(
      'commit',
      '--allow-empty',
      '--no-verify',
      '-m',
      'feat: kept too',
    );
    const { code, said } = await checking(`${start}..HEAD`);
    assert.strictEqual(code, 1);
    assert.strictEqual(
      said,
      `These commits break the rules of CONTRIBUTING.md for a commit message:\n  ${broken} broken\n    line 1: not <type>[(<scope>)][!]: <description>, of the types fix, feat, refactor, test, perf, docs, style, chore, ci, build, revert\n`,
    );
    assert.deepStrictEqual(await checking(`${start}..HEAD~2`), {
      code: 0,
      said: '',
    });
  });
});
