import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getGitApi } from '../git/repository';
import { runGit } from '../git/show';
import type { ToWebview, VipRef } from '../protocol';
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
