import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workingTreeHash } from '../shared/protocol';
import type { Connection, FastforwardView } from '../view';
import { waitFor } from './fixtures';
import {
  commitText,
  objectId,
  removeFolder,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  stubMethod,
  viewRepositories,
  withNotices,
  type ViewRepositories,
} from './viewHarness';

suite('View navigating the history', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteSetup(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
  });

  let fastforward: FastforwardView;
  let page: FakePage;
  let connection: Connection;

  setup(async () => {
    ({
      view: fastforward,
      page,
      connection,
    } = await openView(log, [repository.root], 'unwatched'));
  });

  teardown(() => connection.dispose());

  test('reports a jump to a commit outside the history as a notice', async () => {
    await withNotices(page, 'error', async (messages) => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'f'.repeat(40),
      });
      assert.strictEqual(messages.length, 1);
      assert.match(messages[0], /is not in the history/);
    });
    assert.strictEqual(page.last('error'), undefined);
  });

  test('looks up a hash typed in the address bar', async () => {
    const typed = fixture.b.slice(0, 6);
    await connection.receive({
      type: 'lookupHash',
      root: repository.root,
      query: typed,
    });
    const lookup = page.last('hashLookup');
    assert.strictEqual(lookup?.query, typed);
    assert.deepStrictEqual(
      lookup.result.commits.map((commit) => [commit.hash, commit.subject]),
      [[fixture.b, 'b']],
    );
    assert.strictEqual(lookup.result.more, 0);
    await connection.receive({
      type: 'lookupHash',
      root: repository.root,
      query: 'ffffff0',
    });
    assert.deepStrictEqual(page.last('hashLookup')?.result, {
      commits: [],
      more: 0,
    });
  });

  test('searches commits by text, dropping a search a newer one replaces', async () => {
    page.clear();
    await Promise.all([
      connection.receive({
        type: 'searchCommits',
        root: repository.root,
        query: 'nothing like it',
      }),
      connection.receive({
        type: 'searchCommits',
        root: repository.root,
        query: 'test',
      }),
    ]);
    assert.deepStrictEqual(
      page.messages.flatMap((message) =>
        message.type === 'commitSearch' ? [message.query] : [],
      ),
      ['test'],
    );
    const search = page.last('commitSearch');
    assert.ok(search);
    assert.ok(search.result.commits.length > 0);
    assert.ok(
      search.result.commits.every(({ authorName }) => authorName === 'Test'),
    );
    assert.strictEqual(page.last('error'), undefined);
  });

  test('drops the lookup of a hash a newer one replaced', async () => {
    const held = gate();
    let waiting = false;
    const older = fixture.b.slice(0, 4);
    const newer = fixture.b.slice(0, 5);
    stubMethod(
      fastforward,
      'commitsStartingWith',
      async (original, ...args) => {
        const found = await original(...args);
        if (args[1] === older) {
          waiting = true;
          await held.opened;
        }
        return found;
      },
    );
    const replaced = connection.receive({
      type: 'lookupHash',
      root: repository.root,
      query: older,
    });
    await waitFor(() => waiting, 'the older lookup');
    await connection.receive({
      type: 'lookupHash',
      root: repository.root,
      query: newer,
    });
    held.open();
    await replaced;
    assert.strictEqual(page.last('hashLookup')?.query, newer);
  });

  test('drops the result of a search a newer one replaced once it was found', async () => {
    const held = gate();
    let waiting = false;
    let abortedWhenFound = false;
    stubMethod(fastforward, 'commitsMatching', async (original, ...args) => {
      const [context, query, signal] = args;
      if (query !== 'nothing like it') {
        return original(...args);
      }
      const found = await original(
        context,
        query,
        new AbortController().signal,
      );
      waiting = true;
      await held.opened;
      abortedWhenFound = signal instanceof AbortSignal && signal.aborted;
      return found;
    });
    page.clear();
    const replaced = connection.receive({
      type: 'searchCommits',
      root: repository.root,
      query: 'nothing like it',
    });
    await waitFor(() => waiting, 'the replaced search');
    await connection.receive({
      type: 'searchCommits',
      root: repository.root,
      query: 'test',
    });
    held.open();
    await replaced;
    assert.ok(abortedWhenFound);
    assert.strictEqual(page.last('commitSearch')?.query, 'test');
    assert.strictEqual(page.last('error'), undefined);
  });

  test('jumps to a commit by a short hash', async () => {
    await connection.receive({
      type: 'jump',
      root: repository.root,
      hash: fixture.b.slice(0, 7),
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.b);
    await withNotices(page, 'error', async (messages) => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'abcdef0',
      });
      assert.deepStrictEqual(messages, ['No commit starts with abcdef0']);
    });
    await connection.receive({
      type: 'jump',
      root: repository.root,
      hash: fixture.b.toUpperCase(),
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.b);
  });

  test('tells the page the last of its selections a commit it reveals came after', async () => {
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
      selection: 3,
    });
    await connection.receive({
      type: 'jump',
      root: repository.root,
      hash: fixture.b,
    });
    assert.strictEqual(page.last('reveal')?.selection, 3);
  });

  test('keeps a commit picked while a jump was looking up its hash', async () => {
    const held = gate();
    let reached = false;
    stubMethod(fastforward, 'showCommit', async (original, ...args) => {
      reached = true;
      await held.opened;
      return original(...args);
    });
    const jumping = connection.receive({
      type: 'jump',
      root: repository.root,
      hash: fixture.b.slice(0, 7),
    });
    await waitFor(() => reached, 'the hash to be looked up');
    page.clear();
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
      selection: 4,
    });
    held.open();
    await jumping;
    assert.strictEqual(page.last('reveal'), undefined);
    assert.strictEqual(page.last('files')?.hash, fixture.a);
  });

  test('keeps a commit picked while going back was waiting its turn', async () => {
    for (const [selection, hash] of [fixture.merge, fixture.b].entries()) {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash,
        selection,
      });
    }
    const held = gate();
    let reached = false;
    stubMethod(fastforward, 'navigateNow', async (original, ...args) => {
      reached = true;
      await held.opened;
      return original(...args);
    });
    const navigating = connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    await waitFor(() => reached, 'going back to be on its way');
    page.clear();
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
      selection: 2,
    });
    held.open();
    await navigating;
    assert.strictEqual(page.last('reveal'), undefined);
    assert.strictEqual(page.last('files')?.hash, fixture.a);
  });

  test('does not jump to a branch named like a short hash', async () => {
    await repository.git('branch', 'fade', fixture.a);
    try {
      await withNotices(page, 'error', async (messages) => {
        await connection.receive({
          type: 'jump',
          root: repository.root,
          hash: 'fade',
        });
        assert.deepStrictEqual(messages, ['No commit starts with fade']);
      });
    } finally {
      await repository.git('branch', '-D', 'fade');
    }
  });

  test('says how many commits a short hash it jumps to could be', async () => {
    const [tree] = await repository.resolve('HEAD^{tree}');
    const taken = new Set(
      (
        await repository.git(
          'cat-file',
          '--batch-all-objects',
          '--batch-check=%(objectname)',
        )
      )
        .split('\n')
        .map((hash) => hash.slice(0, 4)),
    );
    const byPrefix = new Map<string, string>();
    let prefix: string | undefined;
    for (let n = 0; prefix === undefined; n++) {
      const content = commitText(tree, `probe ${n}`);
      const start = objectId('commit', content).slice(0, 4);
      if (taken.has(start)) {
        continue;
      }
      const earlier = byPrefix.get(start);
      if (earlier === undefined) {
        byPrefix.set(start, content);
        continue;
      }
      prefix = start;
      for (const [index, probe] of [earlier, content].entries()) {
        const file = path.join(folder, `probe-${index}`);
        fs.writeFileSync(file, probe);
        await repository.git('hash-object', '-t', 'commit', '-w', file);
      }
    }
    await withNotices(page, 'error', async (messages) => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: prefix,
      });
      assert.deepStrictEqual(messages, [`2 commits start with ${prefix}`]);
    });
  });

  test('goes back and forward through the commits shown', async () => {
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.merge,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.b,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
    });
    await waitFor(
      () => page.last('navigation')?.back.length === 2,
      'the history of two steps',
    );
    assert.deepStrictEqual(
      page.last('navigation')?.back.map((entry) => entry.subject),
      ['b', 'merge feature'],
    );

    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.b);
    assert.strictEqual(page.last('files')?.hash, fixture.b);
    assert.deepStrictEqual(
      page.last('navigation')?.forward.map((entry) => entry.hash),
      [fixture.a],
    );

    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'forward',
      steps: 2,
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.a);
    assert.strictEqual(page.last('navigation')?.forward.length, 0);
  });

  test('goes back two steps clicked at once, the first to a commit a collapsed merge hides', async () => {
    for (const hash of [fixture.merge, fixture.b]) {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash,
      });
    }
    await connection.receive({
      type: 'jump',
      root: repository.root,
      hash: fixture.f2,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
    });
    await connection.receive({
      type: 'toggleMerge',
      root: repository.root,
      hash: fixture.merge,
    });
    const back = () =>
      connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
    await Promise.all([back(), back()]);
    assert.strictEqual(page.last('reveal')?.hash, fixture.b);
    const navigation = page.last('navigation');
    assert.deepStrictEqual(
      navigation?.back.map((entry) => entry.hash),
      [fixture.merge],
    );
    assert.deepStrictEqual(
      navigation?.forward.map((entry) => entry.hash).toSorted(),
      [fixture.a, fixture.f2].toSorted(),
    );
  });

  test('goes back to the working tree', async () => {
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.merge,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: workingTreeHash,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.b,
      selection: 3,
    });
    await waitFor(
      () => page.last('navigation')?.back.length === 2,
      'the history of two steps',
    );
    assert.strictEqual(page.last('navigation')?.back[0]?.hash, workingTreeHash);
    page.clear();
    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    assert.deepStrictEqual(page.last('reveal'), {
      type: 'reveal',
      hash: workingTreeHash,
      index: -1,
      selection: 3,
    });
    assert.strictEqual(page.last('files')?.hash, workingTreeHash);
    assert.strictEqual(page.last('error'), undefined);
  });

  test('adds no step for moving through the list with the arrow keys', async () => {
    page.clear();
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.b,
      replace: true,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
      replace: true,
    });
    assert.strictEqual(page.last('navigation'), undefined);
    assert.strictEqual(page.last('files')?.hash, fixture.a);
  });

  test('selects the first parent of the selected commit as a step back can return from', async () => {
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.merge,
      selection: 2,
    });
    page.clear();
    await connection.receive({ type: 'showParent', root: repository.root });
    assert.deepStrictEqual(page.last('reveal'), {
      type: 'reveal',
      hash: fixture.b,
      index: 1,
      selection: 2,
    });
    assert.strictEqual(page.last('files')?.hash, fixture.b);
    await waitFor(
      () => page.last('navigation')?.back.length === 1,
      'the step from the merge',
    );
    assert.strictEqual(page.last('navigation')?.back[0]?.hash, fixture.merge);
  });

  test('leaves steps to commits that are gone out of the history', async () => {
    const gone = (
      await repository.git(
        'commit-tree',
        'main^{tree}',
        '-p',
        'main',
        '-m',
        'gone',
      )
    ).trim();
    await repository.git('update-ref', 'refs/heads/gone', gone);
    try {
      await connection.refresh();
      for (const hash of [fixture.merge, gone, fixture.b]) {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash,
        });
      }
      await waitFor(
        () => page.last('navigation')?.back.length === 2,
        'the history of two steps',
      );
    } finally {
      await repository.git('update-ref', '-d', 'refs/heads/gone');
    }
    await connection.refresh();
    assert.deepStrictEqual(
      page.last('navigation')?.back.map((entry) => entry.hash),
      [fixture.merge],
    );
    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
  });
});
