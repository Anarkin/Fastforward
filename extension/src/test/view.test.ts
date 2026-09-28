import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getGitApi } from '../git/repository';
import { runGit } from '../git/show';
import { workingTreeHash, type ToWebview, type VipRef } from '../protocol';
import { FastforwardView, type Connection } from '../view';

// Storage like the extension's, kept in memory
class FakeMemento implements vscode.Memento {
  readonly values = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  get<T>(key: string, defaultValue?: T): T {
    // Like the real storage, which isn't typed either
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  setKeysForSync(): void {}
}

// The view's messages to the page, by type
class FakePage {
  readonly messages: ToWebview[] = [];

  last<T extends ToWebview['type']>(
    type: T,
  ): Extract<ToWebview, { type: T }> | undefined {
    return this.messages.findLast(
      (message): message is Extract<ToWebview, { type: T }> =>
        message.type === type,
    );
  }

  clear(): void {
    this.messages.length = 0;
  }
}

// main: a, b, merge of feature; feature: f1, f2, kept after the merge; every
// commit a minute after the one before, so their order is fixed
async function createRepository(): Promise<{
  root: string;
  git: (...args: string[]) => Promise<string>;
  hash: (ref: string) => Promise<string>;
  commit: (message: string) => Promise<void>;
}> {
  const gitPath = (await getGitApi()).git.path;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-view-'));
  let minute = 0;
  const git = async (...args: string[]) => {
    const date = new Date(Date.UTC(2026, 0, 1, 0, minute++)).toISOString();
    process.env.GIT_AUTHOR_DATE = date;
    process.env.GIT_COMMITTER_DATE = date;
    try {
      return await runGit(gitPath, root, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    } finally {
      delete process.env.GIT_AUTHOR_DATE;
      delete process.env.GIT_COMMITTER_DATE;
    }
  };
  const commit = (message: string) =>
    git('commit', '--allow-empty', '-m', message).then(() => undefined);
  await git('init', '-b', 'main');
  await commit('a');
  await git('checkout', '-b', 'feature');
  await commit('f1');
  await commit('f2');
  await git('checkout', 'main');
  await commit('b');
  await git('merge', '--no-ff', 'feature', '-m', 'merge feature');
  return {
    root,
    git,
    hash: async (ref) => (await git('rev-parse', ref)).trim(),
    commit,
  };
}

suite('View', function () {
  this.timeout(30_000);

  let repository: Awaited<ReturnType<typeof createRepository>>;
  let globalState: FakeMemento;
  let page: FakePage;
  let connection: Connection;

  const log = vscode.window.createOutputChannel('Fastforward view test', {
    log: true,
  });

  suiteSetup(async () => {
    repository = await createRepository();
  });

  suiteTeardown(() => {
    log.dispose();
    try {
      fs.rmSync(repository.root, { recursive: true, force: true });
    } catch {
      // Left for the OS to clean up
    }
  });

  // A new view with the temp repository as its active tab, opened like the
  // page does when it loads
  setup(async () => {
    const workspaceState = new FakeMemento();
    await workspaceState.update('tabs', [repository.root]);
    await workspaceState.update('activeTab', repository.root);
    globalState = new FakeMemento();
    const view = new FastforwardView(
      log,
      vscode.Uri.file(__dirname),
      workspaceState,
      globalState,
    );
    page = new FakePage();
    connection = view.connect((message) => page.messages.push(message));
    await connection.receive({ type: 'ready' });
  });

  teardown(() => connection.dispose());

  test('starts at the checked-out commit the first time a tab opens', async () => {
    const head = await repository.hash('HEAD');
    assert.strictEqual(page.last('reveal')?.hash, head);
    assert.strictEqual(page.last('files')?.hash, head);

    // Opening it again keeps the place, here nothing selected
    await connection.receive({
      type: 'selectCommit',
      hash: undefined,
      index: undefined,
    });
    page.clear();
    await connection.receive({ type: 'ready' });
    assert.strictEqual(page.last('reveal'), undefined);
  });

  test('shows the last selected commit when answers come out of order', async () => {
    const [a, b] = await Promise.all([
      repository.hash('main~1'),
      repository.hash('main~2'),
    ]);
    // Both run at once, so either can finish first
    await Promise.all([
      connection.receive({ type: 'selectCommit', hash: a, index: 1 }),
      connection.receive({ type: 'selectCommit', hash: b, index: 2 }),
    ]);
    assert.strictEqual(page.last('files')?.hash, b);
    assert.strictEqual(page.last('diff')?.hash, b);
  });

  test('checks out a tag, not a branch of the same name', async () => {
    const a = await repository.hash('main~2');
    await repository.git('tag', 'same', a);
    await repository.git('branch', 'same', 'main');
    try {
      await connection.receive({
        type: 'checkout',
        target: { kind: 'tag', name: 'same' },
      });
      const info = page.last('repository');
      assert.strictEqual(info?.head, undefined);
      assert.strictEqual(info?.headCommit, a);
    } finally {
      await repository.git('checkout', 'main');
      await repository.git('tag', '-d', 'same');
      await repository.git('branch', '-D', 'same');
    }
  });

  test('uses a repository cloned inside another, not the outer one', async () => {
    const gitPath = (await getGitApi()).git.path;
    const nested = path.join(repository.root, 'nested');
    fs.mkdirSync(nested);
    const git = (...args: string[]) =>
      runGit(gitPath, nested, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await git('init', '-b', 'inner');
    await git('commit', '--allow-empty', '-m', 'inner');
    const inner = (await git('rev-parse', 'HEAD')).trim();
    const workspaceState = new FakeMemento();
    await workspaceState.update('tabs', [nested]);
    await workspaceState.update('activeTab', nested);
    const nestedPage = new FakePage();
    const nestedConnection = new FastforwardView(
      log,
      vscode.Uri.file(__dirname),
      workspaceState,
      new FakeMemento(),
    ).connect((message) => nestedPage.messages.push(message));
    try {
      await nestedConnection.receive({ type: 'ready' });
      const info = nestedPage.last('repository');
      assert.strictEqual(info?.head, 'inner');
      assert.strictEqual(info?.headCommit, inner);
    } finally {
      nestedConnection.dispose();
    }
  });

  test('opens a repository without commits', async () => {
    const gitPath = (await getGitApi()).git.path;
    // Inside the suite's temp folder, which is removed at the end, as the Git
    // extension keeps reading a repository it opened
    const empty = path.join(repository.root, 'empty');
    fs.mkdirSync(empty);
    await runGit(gitPath, empty, ['init']);
    fs.writeFileSync(path.join(empty, 'new.txt'), 'new\n');
    const workspaceState = new FakeMemento();
    await workspaceState.update('tabs', [empty]);
    await workspaceState.update('activeTab', empty);
    const emptyPage = new FakePage();
    const emptyConnection = new FastforwardView(
      log,
      vscode.Uri.file(__dirname),
      workspaceState,
      new FakeMemento(),
    ).connect((message) => emptyPage.messages.push(message));
    try {
      await emptyConnection.receive({ type: 'ready' });
      assert.strictEqual(emptyPage.last('error'), undefined);
      assert.strictEqual(emptyPage.last('commits')?.total, 0);
      assert.strictEqual(emptyPage.last('workingTree')?.files, 1);
    } finally {
      emptyConnection.dispose();
    }
  });

  test('refreshes once at a time, without sending an unchanged diff', async () => {
    fs.writeFileSync(path.join(repository.root, 'draft.txt'), 'draft\n');
    try {
      await connection.receive({
        type: 'selectCommit',
        hash: workingTreeHash,
        index: -1,
      });
      assert.ok(page.last('diff')?.patch.includes('+draft'));
      page.clear();
      // Overlapping refreshes of an unchanged working tree
      await Promise.all([connection.refresh(), connection.refresh()]);
      assert.ok(page.last('workingTree'));
      assert.strictEqual(page.last('files'), undefined);
      assert.strictEqual(page.last('diff'), undefined);
      assert.strictEqual(page.last('error'), undefined);
    } finally {
      fs.rmSync(path.join(repository.root, 'draft.txt'));
    }
  });

  test('leaves large files out of a commit diff until one is asked for', async () => {
    const gitPath = (await getGitApi()).git.path;
    // A repository of its own, so the other tests' history stays the same
    const root = path.join(repository.root, 'large');
    fs.mkdirSync(root);
    const git = (...args: string[]) =>
      runGit(gitPath, root, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await git('init', '-b', 'main');
    const lines = Array.from({ length: 2000 }, (_, index) => `line ${index}`);
    fs.writeFileSync(path.join(root, 'large.txt'), lines.join('\n'));
    fs.writeFileSync(path.join(root, 'small.txt'), 'small\n');
    await git('add', '.');
    await git('commit', '-m', 'large');
    const hash = (await git('rev-parse', 'HEAD')).trim();
    const workspaceState = new FakeMemento();
    await workspaceState.update('tabs', [root]);
    await workspaceState.update('activeTab', root);
    const largePage = new FakePage();
    const largeConnection = new FastforwardView(
      log,
      vscode.Uri.file(__dirname),
      workspaceState,
      new FakeMemento(),
    ).connect((message) => largePage.messages.push(message));
    try {
      // Opening the tab selects HEAD, the commit
      await largeConnection.receive({ type: 'ready' });
      const patch = largePage.last('diff')?.patch ?? '';
      assert.ok(patch.includes('b/small.txt'), patch);
      assert.ok(!patch.includes('large.txt'), patch);
      await largeConnection.receive({
        type: 'loadFileDiff',
        hash,
        path: 'large.txt',
      });
      const fileDiff = largePage.last('fileDiff');
      assert.strictEqual(fileDiff?.path, 'large.txt');
      assert.ok(fileDiff?.patch.includes('+line 1999'));
    } finally {
      largeConnection.dispose();
    }
  });

  test('shows the history with merges collapsed', async () => {
    const commits = page.last('commits');
    assert.ok(commits);
    // merge, b and a; f1 and f2 are in the merge, although feature points at
    // f2, as it is merged
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

  test('makes the main branch a VIP once, then keeps the saved VIPs', async () => {
    const main: VipRef = { kind: 'branch', name: 'main' };
    assert.deepStrictEqual(page.last('vips')?.vips, [main]);

    await connection.receive({ type: 'setVips', vips: [] });
    const saved = globalState.get<Record<string, VipRef[]>>('vips', {});
    assert.deepStrictEqual(saved[repository.root], []);
  });

  test('expands and collapses a merge', async () => {
    const merge = await repository.hash('main');
    await connection.receive({ type: 'toggleMerge', hash: merge });
    assert.strictEqual(page.last('commits')?.total, 5);
    await connection.receive({ type: 'toggleMerge', hash: merge });
    assert.strictEqual(page.last('commits')?.total, 3);
  });

  test('expands the merge hiding a commit it jumps to', async () => {
    const tip = await repository.hash('feature');
    page.clear();
    await connection.receive({ type: 'jump', hash: tip });
    assert.strictEqual(page.last('commits')?.total, 5);
    const reveal = page.last('reveal');
    assert.strictEqual(reveal?.hash, tip);
    assert.strictEqual(page.last('files')?.hash, tip);
  });

  test('reloads when a ref moves, keeping the top commit in place', async () => {
    // The Git extension may still be catching up with the new repository, so
    // a first refresh settles what the history was built from
    await connection.refresh();
    const b = await repository.hash('main~1');
    await connection.receive({ type: 'scrolled', hash: b, offset: 7 });

    page.clear();
    await connection.refresh();
    assert.strictEqual(page.last('commits'), undefined, 'reloaded unchanged');

    await repository.commit('c');
    await connection.refresh();
    const commits = page.last('commits');
    assert.strictEqual(commits?.total, 4);
    // b was second, and is third under the new commit
    assert.deepStrictEqual(commits.anchor, { index: 2, offset: 7 });
    assert.ok(page.last('repository'));
  });

  test('shows a detached HEAD as a bubble on its commit', async () => {
    const b = await repository.hash('main~1');
    await repository.git('checkout', '--detach', b);
    try {
      // The Git extension notices the checkout before a real change event
      const git = await getGitApi();
      await git.getRepository(vscode.Uri.file(repository.root))?.status();
      page.clear();
      await connection.refresh();
      const info = page.last('repository');
      assert.strictEqual(info?.head, undefined);
      assert.strictEqual(info?.headCommit, b);
      // b, second in the list, has no refs, so its bubble is HEAD's
      assert.deepStrictEqual(
        page.last('commits')?.decorations.find(([index]) => index === 1),
        [1, 1],
      );
    } finally {
      await repository.git('checkout', 'main');
    }
  });

  test('checks out a branch and a commit', async () => {
    try {
      await connection.receive({
        type: 'checkout',
        target: { kind: 'branch', name: 'feature' },
      });
      assert.strictEqual(page.last('repository')?.head, 'feature');
      // It jumps to what it checked out
      assert.strictEqual(
        page.last('reveal')?.hash,
        await repository.hash('feature'),
      );

      const a = await repository.hash('main~1~1');
      await connection.receive({
        type: 'checkout',
        target: { kind: 'commit', hash: a },
      });
      const info = page.last('repository');
      assert.strictEqual(info?.head, undefined);
      assert.strictEqual(info?.headCommit, a);
    } finally {
      await repository.git('checkout', 'main');
    }
  });

  test('checks out a remote branch as a new branch that tracks it', async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('update-ref', 'refs/remotes/origin/topic', 'main~1');
    try {
      await connection.receive({
        type: 'checkout',
        target: { kind: 'remote', name: 'origin/topic' },
      });
      assert.strictEqual(page.last('repository')?.head, 'topic');
      assert.strictEqual(
        (
          await repository.git('rev-parse', '--abbrev-ref', 'topic@{upstream}')
        ).trim(),
        'origin/topic',
      );
    } finally {
      await repository.git('checkout', 'main');
      await repository.git('branch', '-D', 'topic');
      await repository.git('remote', 'remove', 'origin');
    }
  });

  test('fast-forwards the local branch of a remote branch that is ahead', async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    try {
      await connection.receive({
        type: 'checkout',
        target: { kind: 'remote', name: 'origin/behind' },
      });
      assert.strictEqual(page.last('repository')?.head, 'behind');
      assert.strictEqual(
        (await repository.git('rev-parse', 'behind')).trim(),
        (await repository.git('rev-parse', 'main')).trim(),
      );
    } finally {
      await repository.git('checkout', 'main');
      await repository.git('branch', '-D', 'behind');
      await repository.git('remote', 'remove', 'origin');
    }
  });

  test('reloads when a branch is created', async () => {
    await connection.refresh();
    page.clear();
    await repository.git('branch', 'created', 'main~1');
    await connection.refresh();
    const refs = page.last('repository')?.refs.map((ref) => ref.name);
    assert.ok(refs?.includes('created'));
    await repository.git('branch', '-D', 'created');
  });
});

suite('Pull and push', function () {
  this.timeout(30_000);

  let repository: Awaited<ReturnType<typeof createRepository>>;
  let remote: string;
  let page: FakePage;
  let connection: Connection;

  const log = vscode.window.createOutputChannel('Fastforward sync test', {
    log: true,
  });

  // The temp repository, with a bare one next to it as origin, which main
  // tracks
  suiteSetup(async () => {
    repository = await createRepository();
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-remote-'));
    const gitPath = (await getGitApi()).git.path;
    await runGit(gitPath, remote, ['init', '--bare', '-b', 'main']);
    await repository.git('remote', 'add', 'origin', remote);
    await repository.git('push', '-u', 'origin', 'main');

    const workspaceState = new FakeMemento();
    await workspaceState.update('tabs', [repository.root]);
    await workspaceState.update('activeTab', repository.root);
    const view = new FastforwardView(
      log,
      vscode.Uri.file(__dirname),
      workspaceState,
      new FakeMemento(),
    );
    page = new FakePage();
    connection = view.connect((message) => page.messages.push(message));
    await connection.receive({ type: 'ready' });
  });

  suiteTeardown(() => {
    connection.dispose();
    log.dispose();
    for (const folder of [repository.root, remote]) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch {
        // Left for the OS to clean up
      }
    }
  });

  // The Git extension reads the counts from git status
  async function refresh(): Promise<void> {
    const git = await getGitApi();
    await git.getRepository(vscode.Uri.file(repository.root))?.status();
    await connection.refresh();
  }

  test("pushes the commits the upstream doesn't have", async () => {
    await repository.commit('local');
    await refresh();
    const before = page.last('repository');
    assert.strictEqual(before?.headUpstream, 'origin/main');
    assert.deepStrictEqual([before.ahead, before.behind], [1, 0]);

    await connection.receive({ type: 'sync', action: 'push' });
    const pushed = (
      await runGit((await getGitApi()).git.path, remote, ['rev-parse', 'main'])
    ).trim();
    assert.strictEqual(pushed, await repository.hash('main'));
    assert.strictEqual(page.last('repository')?.ahead, 0);
    assert.strictEqual(page.last('syncing')?.action, undefined);
  });

  test('pulls the commits the upstream has', async () => {
    const latest = await repository.hash('main');
    await repository.git('reset', '--hard', 'main~1');
    await refresh();
    assert.strictEqual(page.last('repository')?.behind, 1);

    await connection.receive({ type: 'sync', action: 'pull' });
    assert.strictEqual(await repository.hash('main'), latest);
    assert.strictEqual(page.last('repository')?.behind, 0);
  });
});
