import * as assert from 'node:assert';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { gitErrorText } from '../../../../../tools/git/main/errorText';
import { searchCommits } from '../../../../../tools/git/main/commitMatches';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

type Spawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

async function searchingWith(
  start: (spawn: Spawn, ...git: Parameters<Spawn>) => ChildProcess,
  search: () => Promise<void>,
): Promise<void> {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  const starting: Spawn = (command, args, options) =>
    args.some((arg) => arg.startsWith('--format=%H%x00'))
      ? start(spawn, command, args, options)
      : spawn(command, args, options);
  replaceBuiltin(childProcess, 'spawn', starting);
  try {
    await search();
  } finally {
    replaceBuiltin(childProcess, 'spawn', spawn);
  }
}

suite('Commit search', { timeout: 60000 }, () => {
  let search: TempRepository;
  let gitPath: string;

  beforeAll(async () => {
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
      'Former Writer <old@example.com>',
    );
    await search.commit('unrelated');
    await search.commit('Separated\x1eby a record separator');
    fs.writeFileSync(
      path.join(search.root, '.mailmap'),
      'New Name <old@example.com>\n',
    );
  }, 60000);

  afterAll(() => removeFolder(search.root));

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
      [],
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
    assert.deepStrictEqual(await subjectsFound('former writer'), []);
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
      searchCommits(gitPath, search.root, 'ada', false, [], before.signal),
      (error) => error === before.signal.reason,
    );
    const during = new AbortController();
    const searching = searchCommits(
      gitPath,
      search.root,
      'ada',
      false,
      [],
      during.signal,
    );
    during.abort();
    await assert.rejects(searching, (error) => error === during.signal.reason);
  });

  test('searches the stashes and the commits only they keep, without their index and untracked files, unless solo', async () => {
    const stashed = await tempRepository(tempFolder('stashed'));
    try {
      await stashed.commit('base', { 'a.txt': 'one\n' });
      await stashed.git('switch', '-q', '-c', 'feature');
      await stashed.commit('only on feature', { 'a.txt': 'two\n' });
      fs.writeFileSync(path.join(stashed.root, 'a.txt'), 'three\n');
      fs.writeFileSync(path.join(stashed.root, 'new.txt'), 'new\n');
      await stashed.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
      await stashed.git('switch', '-q', 'main');
      await stashed.git('branch', '-q', '-D', 'feature');
      const stashes = await stashed.resolve('stash@{0}');
      const found = async (solo: boolean) =>
        (
          await searchCommits(
            gitPath,
            stashed.root,
            'on feature',
            solo,
            stashes,
          )
        ).commits.map((commit) => commit.subject);
      assert.deepStrictEqual(await found(false), [
        'On feature: kept aside',
        'only on feature',
      ]);
      assert.deepStrictEqual(await found(true), []);
    } finally {
      removeFolder(stashed.root);
    }
  });

  test('says only what git said when it fails', async () => {
    const outside = tempFolder('unsearched');
    try {
      await assert.rejects(
        searchCommits(gitPath, outside, 'ada', false),
        (error) => {
          assert.match(gitErrorText(error), /^fatal: not a git repository/);
          assert.match(String(error), /git log .+ failed/);
          return true;
        },
      );
    } finally {
      removeFolder(outside);
    }
  });

  test('says why git stopped when it said nothing', async () => {
    await searchingWith(
      (spawn, ...git) => {
        const child = spawn(...git);
        child.kill();
        return child;
      },
      () =>
        assert.rejects(
          searchCommits(gitPath, search.root, 'ada', false),
          (error) => {
            assert.match(gitErrorText(error), /it was stopped by SIGTERM$/);
            return true;
          },
        ),
    );
  });

  test('searches every commit, however much git prints, as it keeps only its matches', async () => {
    const [head] = await search.resolve('HEAD');
    const printing = `
      const skipped = '${'0'.repeat(40)}\\0a\\0b\\0c\\0d\\0' + 'x'.repeat(65536) + '\\0';
      let left = 4200;
      const write = () => {
        while (left-- > 0) {
          if (!process.stdout.write(skipped)) {
            process.stdout.once('drain', write);
            return;
          }
        }
        process.stdout.end('${head}\\0a\\0b\\0c\\0d\\0needle\\0');
      };
      write();
    `;
    await searchingWith(
      (spawn, _command, _args, options) =>
        spawn(process.execPath, ['-e', printing], options),
      async () => {
        const found = await searchCommits(
          gitPath,
          search.root,
          'needle',
          false,
        );
        assert.deepStrictEqual(
          found.commits.map((commit) => commit.hash),
          [head],
        );
      },
    );
  });
});
