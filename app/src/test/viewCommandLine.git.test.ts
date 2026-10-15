import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { sameRoot } from '../storage';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  openView,
  reopen,
  stubMethod,
  withView,
  type OpenView,
} from './viewHarness';

function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

function tabNames(view: OpenView): readonly string[] | undefined {
  return view.page.last('tabs')?.tabs.map((tab) => tab.name);
}

function headsShown(view: OpenView): readonly (string | undefined)[] {
  return view.page.messages.flatMap((message) =>
    message.type === 'repository' ? [message.headCommit] : [],
  );
}

suite('View of folders asked for from the command line', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let other: string;
  let otherHead: string;
  let third: string;
  let feature: string;
  let plain: string;

  beforeAll(async () => {
    folder = tempFolder('command-line-view');
    repository = await tempRepository(path.join(folder, 'main'));
    await repository.commit('a');
    feature = path.join(folder, 'main.worktrees', 'feature');
    await repository.git('worktree', 'add', '-q', '-b', 'feature', feature);
    await repository.git('-C', feature, 'commit', '--allow-empty', '-m', 'f');
    const second = await tempRepository(path.join(folder, 'other'));
    await second.commit('other');
    other = second.root;
    [otherHead] = await second.resolve('HEAD');
    fs.mkdirSync(path.join(other, 'inner'));
    const thirdRepository = await tempRepository(path.join(folder, 'third'));
    await thirdRepository.commit('third');
    third = thirdRepository.root;
    plain = path.join(folder, 'plain');
    fs.mkdirSync(plain);
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('opens the folders asked for before the page is ready once it is, showing the last rather than the tab left active, which it does not open', async () => {
    const view = await openView(log, [repository.root], false);
    try {
      await view.view.openFolders([third, path.join(other, 'inner')]);
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      assert.deepStrictEqual(tabNames(view), ['main', 'third', 'other']);
      const shown = view.page.last('tabs');
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.deepStrictEqual(headsShown(view), [otherHead]);
    } finally {
      view.connection.dispose();
    }
  });

  test('switches to the tab of a folder asked for while the page is shown, adding none for a repository open already', async () => {
    await withView(log, [repository.root, other], async (view) => {
      await view.view.openFolders([path.join(other, 'inner')]);
      assert.deepStrictEqual(tabNames(view), ['main', 'other']);
      const shown = view.page.last('tabs');
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.strictEqual(view.page.last('repository')?.headCommit, otherHead);
    });
  });

  test('shows the worktree a folder asked for is in, in the tab of its repository showing another', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.view.openFolders([feature]);
      assert.deepStrictEqual(tabNames(view), ['main']);
      assert.ok(sameRealFolder(view.page.last('tabs')?.worktree, feature));
      assert.strictEqual(view.page.last('repository')?.head, 'feature');
    });
  });

  test('says a folder asked for is not in a repository, showing the tab left active as it starts', async () => {
    const view = await openView(log, [repository.root], false);
    try {
      await view.view.openFolders([plain]);
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      assert.deepStrictEqual(
        view.page.messages.flatMap((message) =>
          message.type === 'notice' ? [message.message] : [],
        ),
        [strings.messages.notInRepository(plain)],
      );
      assert.deepStrictEqual(tabNames(view), ['main']);
      assert.strictEqual(view.page.last('repository')?.head, 'main');
    } finally {
      view.connection.dispose();
    }
  });

  test('opens the folders asked for while the page loads again once it is ready', async () => {
    await withView(log, [repository.root], async (view) => {
      view.connection.dispose();
      await view.view.openFolders([other]);
      const reloaded = reopen(view.view);
      try {
        await reloaded.ready;
        await view.view.idle();
        const shown = reloaded.page.last('tabs');
        assert.ok(shown?.active && sameRoot(shown.active, other));
      } finally {
        reloaded.connection.dispose();
      }
    });
  });

  test('opens a folder asked for while the page gets ready, after those asked for before it', async () => {
    const view = await openView(log, [repository.root], false);
    let askedMeanwhile = false;
    stubMethod(view.view, 'addRepositories', async (original, ...args) => {
      const added = await original(...args);
      if (!askedMeanwhile) {
        askedMeanwhile = true;
        await view.view.openFolders([third]);
      }
      return added;
    });
    try {
      await view.view.openFolders([other]);
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      assert.deepStrictEqual(tabNames(view), ['main', 'other', 'third']);
      const shown = view.page.last('tabs');
      assert.ok(shown?.active && sameRoot(shown.active, third));
    } finally {
      view.connection.dispose();
    }
  });
});
