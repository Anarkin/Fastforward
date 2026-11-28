import * as assert from 'node:assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import type { GitTool } from '../../../../../tools/git/main/tool';
import type { TempRepository } from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  openView,
  stubMethod,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { commitsSent, FakePage } from '../../../../helpers/fakePage';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Git tool listing the history', () => {
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

    test('shows the history with merges collapsed', () => {
      const commits = page.last('commits');
      assert.ok(commits);
      assert.strictEqual(commits.total, 3);
      assert.deepStrictEqual(
        commits.commits.map((commit) => commit.subject),
        ['merge feature', 'b', 'a'],
      );
      assert.strictEqual(commits.graph[0]?.merge, 'collapsed');
      assert.strictEqual(commits.graph[0]?.hidden, 2);

      const refs = page.last('repository')?.refs.map((ref) => ref.name);
      assert.deepStrictEqual(refs?.toSorted(), ['feature', 'main']);
    });

    test('loads as many rows of the history as the list asks for', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation,
        start: 1,
        count: 1,
      });
      const page2 = page.last('commitPage');
      assert.strictEqual(page2?.start, 1);
      assert.strictEqual(page2.count, 1);
      assert.strictEqual(page2.generation, generation);
      assert.deepStrictEqual(
        page2.commits.map((commit) => commit.subject),
        ['b'],
      );
      assert.strictEqual(page2.graph.length, 1);

      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation: generation - 1,
        start: 1,
        count: 1,
      });
      assert.strictEqual(page.last('commitPage'), page2);
    });

    test('answers a page of the history that fails to load with no commits, so the list asks again', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      const elsewhere = tempFolder('not-a-repository');
      try {
        stubMethod(fastforward, 'context', async (original, ...args) => {
          const context = await original(...args);
          assert.ok(typeof context === 'object' && context !== null);
          return { ...context, root: elsewhere };
        });
        page.clear();
        await connection.receive({
          type: 'loadCommits',
          root: repository.root,
          generation,
          start: 1,
          count: 2,
        });
        const failed = page.last('commitPage');
        assert.strictEqual(failed?.start, 1);
        assert.strictEqual(failed.count, 2);
        assert.strictEqual(failed.generation, generation);
        assert.deepStrictEqual(failed.commits, []);
        assert.ok(page.last('error'));
        takeErrorsLogged(
          logged,
          /^Handling loadCommits from the page failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        removeFolder(elsewhere);
      }
    });

    test('lets the keys go on from the merge a collapse hides the selected commit in, leaving it selected', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      const commits = page.last('commits');
      assert.strictEqual(commits?.total, 3);
      assert.strictEqual(commits.selectedIndex, undefined);
      assert.strictEqual(commits.keysFrom, 0);
    });

    test('compares the selected commit a collapse hides with another commit', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      page.clear();
      const hash = comparisonOf(fixture.f2, fixture.b);
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash,
      });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('files')?.hash, hash);
      assert.strictEqual(page.last('diff')?.hash, hash);
      assert.strictEqual(commitsSent(page.messages), 0);
    });

    test('loads the files of a selected commit a collapsed merge hides once the page loads again with settings changed by hand', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      fastforward.reloadSettings();
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('forgets merges toggled by hand when the merge setting changes', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      assert.strictEqual(page.last('commits')?.total, 5);
      await toggle();
      assert.strictEqual(page.last('commits')?.total, 3);
      await toggle();
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
    });

    test('sends only the newest list when the history is worked out twice at once', async () => {
      page.clear();
      await Promise.all([
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
      ]);
      assert.strictEqual(commitsSent(page.messages), 1);
      assert.strictEqual(page.last('commits')?.total, 3);
    });

    test('expands the merge hiding a commit it jumps to', async () => {
      page.clear();
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      assert.strictEqual(page.last('reveal')?.hash, fixture.f2);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('expands the collapsed merge that hides a commit picked, as the filter lists such commits, rather than saying it is not in the history', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('reveal')?.hash, fixture.f2);
    });
  });
});
