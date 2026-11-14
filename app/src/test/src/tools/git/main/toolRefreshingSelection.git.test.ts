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
import { replaceBuiltin } from '../../../../helpers/builtins';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import type { GitTool } from '../../../../../tools/git/main/tool';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  holderOf,
  stubMethod,
} from '../../../../helpers/harness';
import {
  restoreRepository,
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool refreshing one repository', () => {
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

  const restore = () => restoreRepository(repository, fixture.merge);

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

    test('applies Solo and ends a refresh while refreshes keep being asked for', async () => {
      let refilling = true;
      let started = 0;
      let waiting: { from: number; most: number } | undefined;
      const heldBack = Promise.withResolvers<void>();
      const refreshing = holderOf(fastforward, 'refresh');
      const refresh: unknown = Reflect.get(refreshing, 'refresh');
      assert.ok(typeof refresh === 'function');
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        started++;
        if (waiting && started - waiting.from > waiting.most) {
          refilling = false;
          heldBack.resolve();
        }
        await original(...args);
        if (refilling) {
          const queued: unknown = Reflect.apply(refresh, refreshing, [args[0]]);
          void Promise.resolve(queued).catch(() => undefined);
        }
      });
      stubMethod(fastforward, 'queueRefresh', (original, ...args) => {
        const [context, load, ...rest] = args;
        if (typeof load !== 'function') {
          return original(...args);
        }
        waiting = { from: started, most: 0 };
        return original(
          context,
          () => {
            waiting = undefined;
            return Reflect.apply(load, undefined, []);
          },
          ...rest,
        );
      });
      const looping = connection.refresh();
      try {
        page.clear();
        const solo = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await Promise.race([solo, heldBack.promise]);
        assert.ok(refilling, 'Solo waited for refreshes asked for after it');
        await solo;
        assert.strictEqual(page.last('applyingSolo')?.running, false);

        waiting = { from: started, most: 2 };
        await Promise.race([connection.refresh(), heldBack.promise]);
        assert.ok(
          refilling,
          'a refresh waited for refreshes asked for after it',
        );
        waiting = undefined;
      } finally {
        refilling = false;
        await looping;
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
      }
    });

    test('ignores a file picked on a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'selectFile',
        root: repository.root,
        hash: fixture.a,
        path: 'a',
      });
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('fileContent'), undefined);
      assert.strictEqual(page.last('diff')?.path, undefined);
    });

    test('drops the diff of a file of a commit no longer selected', async () => {
      await repository.commit('changes c', { 'c.txt': 'c\n' });
      const [changed] = await repository.resolve('HEAD');
      try {
        await connection.refresh();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: changed,
        });
        const held = gate();
        let calls = 0;
        stubMethod(fastforward, 'patchOf', async (original, ...args) => {
          calls += 1;
          if (calls === 1) {
            await held.opened;
          }
          return original(...args);
        });
        page.clear();
        const loading = connection.receive({
          type: 'loadFileDiff',
          root: repository.root,
          hash: changed,
          path: 'c.txt',
          diff: 1,
        });
        await waitFor(() => calls === 1, 'the file diff');
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        held.open();
        await loading;
        assert.strictEqual(page.last('fileDiff'), undefined);
      } finally {
        await restore();
      }
    });

    test('stops reading the files and diff of a commit selected before another', async () => {
      for (const name of ['commitFiles', 'budgetedPatch']) {
        const held = gate();
        const signals: AbortSignal[] = [];
        stubMethod(fastforward, name, async (original, ...args) => {
          const signal = args.at(-1);
          assert.ok(signal instanceof AbortSignal);
          if (args[1] === fixture.a) {
            signals.push(signal);
            await held.opened;
          }
          return original(...args);
        });
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        const first = connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.a,
        });
        await waitFor(() => signals.length === 1, `the first ${name}`);
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.b,
        });
        assert.ok(signals[0]?.aborted, name);
        held.open();
        await first;
        assert.strictEqual(page.last('error'), undefined, name);
        assert.strictEqual(page.last('files')?.hash, fixture.b, name);
        assert.strictEqual(page.last('diff')?.hash, fixture.b, name);
        assert.ok(
          page.messages.every(
            (message) => message.type !== 'diff' || message.hash !== fixture.a,
          ),
          name,
        );
      }
    });

    test('lists the untracked files once per refresh while a commit is compared with the working tree, showing one made since', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let listings = 0;
      const made = path.join(repository.root, 'made.txt');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: comparisonOf(fixture.a, workingTreeHash),
        });
        fs.writeFileSync(made, 'made\n');
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (
              gitArgs.includes('--untracked-files=all') ||
              gitArgs.includes('--others')
            ) {
              listings++;
            }
            return spawn(...args);
          },
        );
        page.clear();
        await connection.refresh();
        assert.strictEqual(listings, 1);
        assert.ok(
          page.last('files')?.files.some((file) => file.path === 'made.txt'),
        );
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(made, { force: true });
      }
    });

    test('reads neither the sizes of the uncommitted changes nor the untracked files while a commit is selected, as only their count is shown', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      const fileSystem = process.getBuiltinModule('node:fs');
      const { createReadStream } = fileSystem;
      const read: string[] = [];
      const untracked = path.join(repository.root, 'untracked.txt');
      await repository.commit('sized', { 'sized.txt': 'one\n' });
      try {
        await connection.refresh();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.b,
        });
        fs.writeFileSync(path.join(repository.root, 'sized.txt'), 'two\n');
        fs.writeFileSync(untracked, 'new\n');
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (gitArgs.includes('cat-file')) {
              read.push(gitArgs.join(' '));
            }
            return spawn(...args);
          },
        );
        replaceBuiltin(
          fileSystem,
          'createReadStream',
          (...args: Parameters<typeof createReadStream>) => {
            read.push(String(args[0]));
            return createReadStream(...args);
          },
        );
        page.clear();
        await connection.refresh();
        assert.strictEqual(page.last('workingTree')?.files, 2);
        assert.deepStrictEqual(read, []);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        replaceBuiltin(fileSystem, 'createReadStream', createReadStream);
        fs.rmSync(untracked, { force: true });
        await restore();
      }
    });

    test('lists the index again for the tree of the working tree only once the git folder changed, as a change to the files alone leaves it as it was', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let listings = 0;
      let change = { refs: false, workingTree: true };
      const staged = path.join(repository.root, 'staged.txt');
      const made = path.join(repository.root, 'made.txt');
      fs.writeFileSync(staged, 'staged\n');
      await repository.git('add', 'staged.txt');
      fs.rmSync(staged);
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.refresh();
        stubMethod(fastforward, 'refreshOnce', (original, context) =>
          original(context, change),
        );
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (gitArgs.includes('ls-files') && gitArgs.includes('--cached')) {
              listings++;
            }
            return spawn(...args);
          },
        );
        fs.writeFileSync(made, 'made\n');
        await connection.refresh();
        assert.strictEqual(listings, 0);
        assert.deepStrictEqual(page.last('tree')?.paths.toSorted(), [
          'made.txt',
          'staged.txt',
        ]);
        await repository.git('rm', '-q', '--cached', 'staged.txt');
        change = { refs: true, workingTree: true };
        await connection.refresh();
        assert.strictEqual(listings, 1);
        assert.deepStrictEqual(page.last('tree')?.paths, ['made.txt']);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(made, { force: true });
        await restore();
      }
    });

    test('lists the index again for the tree of the working tree once its tab loads afresh, as the index may have changed while nothing watched it', async () => {
      const gone = path.join(repository.root, 'gone.txt');
      const made = path.join(repository.root, 'made.txt');
      const showTree = async () => {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
      };
      fs.writeFileSync(gone, 'gone\n');
      await repository.git('add', 'gone.txt');
      try {
        await showTree();
        await connection.refresh();
        fastforward.reloadSettings();
        await repository.git('rm', '-q', '-f', 'gone.txt');
        await connection.receive({ type: 'ready' });
        await showTree();
        stubMethod(fastforward, 'refreshOnce', (original, context) =>
          original(context, { refs: false, workingTree: true }),
        );
        fs.writeFileSync(made, 'made\n');
        await connection.refresh();
        assert.deepStrictEqual(page.last('tree')?.paths, ['made.txt']);
      } finally {
        fs.rmSync(made, { force: true });
        await restore();
      }
    });

    test('shows a selected uncommitted file deleted since, without failing the refresh', async () => {
      const added = path.join(repository.root, 'added.txt');
      fs.writeFileSync(added, 'added\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'added.txt',
        });
        fs.rmSync(added);
        page.clear();
        await connection.refresh();
        assert.strictEqual(page.last('error'), undefined);
        assert.strictEqual(page.last('fileContent')?.content, '');
      } finally {
        fs.rmSync(added, { force: true });
      }
    });
  });
});
