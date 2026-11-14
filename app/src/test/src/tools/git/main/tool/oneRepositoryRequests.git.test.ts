import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../../helpers/builtins';
import { workingTreeHash } from '../../../../../../tools/git/shared/protocol';
import { plainOf } from '../../../../../../lib/shared/strings';
import { runGit } from '../../../../../../tools/git/main/cli/run';
import type { GitTool } from '../../../../../../tools/git/main/tool';
import {
  removeFolder,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  failOnErrorsLogged,
  FakePage,
  openView,
  stubMethod,
  takeErrorsLogged,
  withNotices,
} from '../../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../../helpers/gitFixtures';

suite('Git tool of one repository', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  suite('with its tab open', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
      } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('takes only hashes of the history from the page, as it shows repository content, and a hash such as --output=<file> made git write a file', async () => {
      const written = path.join(folder, 'written.txt');
      const hash = `--output=${written}`;
      for (const message of [
        {
          type: 'loadFileDiff',
          root: repository.root,
          hash,
          path: 'a',
          diff: 1,
        },
        { type: 'selectFile', root: repository.root, hash, path: 'a' },
        { type: 'loadTree', root: repository.root, hash },
        { type: 'selectCommit', root: repository.root, hash },
        ...[hash, 'HEAD~1', ':/b', fixture.a.toUpperCase()].map(
          (target) =>
            ({
              type: 'checkout',
              root: repository.root,
              target: { kind: 'commit', hash: target },
            }) as const,
        ),
      ] as const) {
        page.clear();
        await connection.receive(message);
        assert.match(
          plainOf(page.last('error')?.message ?? ''),
          /not in the history/,
        );
      }
      await connection.receive({ type: 'setIgnoreWhitespace', ignore: true });
      assert.strictEqual(page.last('diff'), undefined);
      assert.ok(!fs.existsSync(written));
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/main',
      );
    });

    test('checks out only refs of the repository named by the page, saying a ref it lacks is gone', async () => {
      let switches = 0;
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      replaceBuiltin(
        childProcess,
        'spawn',
        (...args: Parameters<typeof spawn>) => {
          if (args[1]?.includes('switch')) {
            switches += 1;
          }
          return spawn(...args);
        },
      );
      try {
        await withNotices(page, 'error', async (messages) => {
          for (const target of [
            { kind: 'branch', name: 'main~1' },
            { kind: 'branch', name: 'no-such-branch' },
            { kind: 'tag', name: 'no-such-tag' },
            { kind: 'remote', name: 'origin/no-such-branch' },
          ] as const) {
            await connection.receive({
              type: 'checkout',
              root: repository.root,
              target,
            });
          }
          assert.deepStrictEqual(messages, [
            '"main~1" doesn\'t exist, so it wasn\'t checked out',
            '"no-such-branch" doesn\'t exist, so it wasn\'t checked out',
            '"no-such-tag" doesn\'t exist, so it wasn\'t checked out',
            '"origin/no-such-branch" doesn\'t exist, so it wasn\'t checked out',
          ]);
        });
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
      }
      assert.strictEqual(switches, 0);
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/main',
      );
    });

    test('sends the texts a diff asks for, an uncommitted new side read from disk, each side of a file once however often asked for, and none of a side over 2 MB, from git or from disk', async () => {
      const file = path.join(repository.root, 'texts.ts');
      fs.writeFileSync(file, 'old\n');
      try {
        const [blob] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        fs.writeFileSync(file, 'new\n');
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 3,
          texts: [
            { path: 'texts.ts', side: 'old', blob },
            { path: 'texts.ts', side: 'new', blob },
            { path: 'other.ts', side: 'old', blob: '0'.repeat(39) + '1' },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', 'old\n'],
            ['new', 'new\n'],
            ['old', undefined],
          ],
        );
        assert.strictEqual(page.last('texts')?.diff, 3);
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: Array.from({ length: 1000 }, (_, at) => ({
            path: 'texts.ts',
            side: 'new' as const,
            blob: `${at}`,
          })),
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [['new', 'new\n']],
        );
        fs.writeFileSync(file, 'x'.repeat(2 * 1024 * 1024 + 1));
        const [large] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: [
            { path: 'texts.ts', side: 'old', blob: large },
            { path: 'texts.ts', side: 'new', blob: large },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', undefined],
            ['new', undefined],
          ],
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('reads ahead the diff of a commit the page asks for without selecting it, and the texts of its blobs, so the page can color it before it is shown', async () => {
      const file = path.join(repository.root, 'ahead.ts');
      fs.writeFileSync(file, 'ahead\n');
      try {
        const blob = (await repository.git('hash-object', '-w', file)).trim();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        page.clear();
        await connection.receive({
          type: 'prefetchTexts',
          root: repository.root,
          hash: fixture.b,
          texts: [{ path: 'ahead.ts', side: 'new', blob }],
        });
        await connection.receive({
          type: 'prefetchDiff',
          root: repository.root,
          hash: fixture.b,
        });
        await connection.receive({
          type: 'prefetchTexts',
          root: repository.root,
          hash: fixture.b,
          texts: [{ path: 'ahead.ts', side: 'new', blob }],
        });
        assert.deepStrictEqual(
          page.messages
            .map(({ type }) => type)
            .filter((type) =>
              ['files', 'diff', 'prefetchedDiff', 'prefetchedTexts'].includes(
                type,
              ),
            ),
          ['prefetchedDiff', 'prefetchedTexts'],
        );
        assert.strictEqual(page.last('prefetchedDiff')?.hash, fixture.b);
        assert.deepStrictEqual(
          page.last('prefetchedTexts')?.texts.map(({ text }) => text),
          ['ahead\n'],
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('sends the texts of blobs asked for again without reading them from git again', async () => {
      const file = path.join(repository.root, 'kept.ts');
      fs.writeFileSync(file, 'kept\n');
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      try {
        const blob = (await repository.git('hash-object', '-w', file)).trim();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        let gits = 0;
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            gits++;
            return spawn(...args);
          },
        );
        for (const diff of [1, 2]) {
          page.clear();
          await connection.receive({
            type: 'loadTexts',
            root: repository.root,
            hash: fixture.merge,
            diff,
            texts: [{ path: 'kept.ts', side: 'new', blob }],
          });
          assert.deepStrictEqual(
            page.last('texts')?.texts.map(({ text }) => text),
            ['kept\n'],
          );
        }
        assert.strictEqual(gits, 1);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(file, { force: true });
      }
    });

    test('reads from disk only files in the repository, not the git folder nor ignored files, whatever path the page names', async () => {
      const exclude = path.join(repository.root, '.git', 'info', 'exclude');
      const excluded = fs.readFileSync(exclude, 'utf8');
      const secret = path.join(repository.root, 'secret.env');
      fs.appendFileSync(exclude, '\nsecret.env\n');
      fs.writeFileSync(secret, 'API_KEY=hunter2\n');
      const tracked = path.join(repository.root, 'tracked.txt');
      fs.writeFileSync(tracked, 'tracked\n');
      await repository.git('add', 'tracked.txt');
      await connection.refresh();
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        const read = async (file: string) => {
          page.clear();
          await connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: file,
            area: 'unstaged',
          });
          const shown = page.last('fileContent')?.content;
          page.clear();
          await connection.receive({
            type: 'loadTexts',
            root: repository.root,
            hash: workingTreeHash,
            diff: 5,
            texts: [{ path: file, side: 'new', blob: '0'.repeat(40) }],
          });
          return [shown, page.last('texts')?.texts[0]?.text];
        };
        assert.deepStrictEqual(await read('.git/config'), ['', undefined]);
        assert.deepStrictEqual(await read('secret.env'), ['', undefined]);
        assert.deepStrictEqual(await read('tracked.txt'), [
          'tracked\n',
          'tracked\n',
        ]);
      } finally {
        fs.writeFileSync(exclude, excluded);
        fs.rmSync(secret, { force: true });
        await repository.git('rm', '-q', '--cached', 'tracked.txt');
        fs.rmSync(tracked, { force: true });
        await connection.refresh();
      }
    });

    test('asks git for no blob the page names other than by its full object id, as git would take any other name as a revision to look up', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let gits = 0;
      replaceBuiltin(
        childProcess,
        'spawn',
        (...args: Parameters<typeof spawn>) => {
          gits++;
          return spawn(...args);
        },
      );
      try {
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: fixture.merge,
          diff: 6,
          texts: ['HEAD:a.txt', ':/merge', 'HEAD', '-n'].map((blob, at) => ({
            path: `${at}.txt`,
            side: 'new' as const,
            blob,
          })),
        });
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
      }
      assert.strictEqual(gits, 0);
      assert.deepStrictEqual(
        page.last('texts')?.texts.map(({ text }) => text),
        [undefined, undefined, undefined, undefined],
      );
    });

    test('shows what git said when a request fails', async () => {
      stubMethod(fastforward, 'sendTree', () =>
        runGit(repository.gitPath, repository.root, ['ls-tree', 'no-tree']),
      );
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.match(
        plainOf(page.last('error')?.message ?? ''),
        /^fatal: .*no-tree$/,
      );
      takeErrorsLogged(
        logged,
        /^Handling loadTree from the page failed$/,
        /^git ls-tree no-tree failed: /,
      );
    });
  });
});
