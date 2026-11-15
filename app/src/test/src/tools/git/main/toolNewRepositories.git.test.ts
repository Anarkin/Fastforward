import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { sameRoot } from '../../../../../lib/main/paths';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  shownTabs,
  takeErrorsLogged,
  withNotices,
  withView,
  savedBookmarks,
} from '../../../../helpers/harness';

function hostPicking(picked: string | undefined): FakeHost {
  const host = new FakeHost();
  host.folder = picked;
  return host;
}

suite('Git tool making new repositories', () => {
  let folder: string;
  let repository: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('new-repositories');
    repository = await tempRepository(path.join(folder, 'existing'));
    await repository.commit('existing');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  function emptyFolder(name: string): string {
    const made = path.join(folder, name);
    fs.mkdirSync(made, { recursive: true });
    return made;
  }

  test('inits a repository in the folder picked and opens it in a new tab, without commits', async () => {
    const picked = emptyFolder('fresh');
    fs.writeFileSync(path.join(picked, 'kept.txt'), 'kept\n');
    const host = hostPicking(picked);
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'initRepository' });
        assert.deepStrictEqual(host.foldersAsked, [['init', undefined]]);
        assert.ok(fs.statSync(path.join(picked, '.git')).isDirectory());
        assert.ok(fs.existsSync(path.join(picked, 'kept.txt')));
        const shown = shownTabs(view.page);
        assert.ok(shown?.active && sameRoot(shown.active, picked));
        assert.strictEqual(view.page.last('repository')?.headCommit, undefined);
      },
      true,
      host,
    );
  });

  test('inits a repository in the folder the commander names and opens it, asking for no folder', async () => {
    const named = emptyFolder('named');
    const host = hostPicking(undefined);
    await withView(
      log,
      [],
      async (view) => {
        await view.view.initRepositoryIn(named);
        assert.deepStrictEqual(host.foldersAsked, []);
        assert.ok(fs.statSync(path.join(named, '.git')).isDirectory());
        const shown = shownTabs(view.page);
        assert.ok(shown?.active && sameRoot(shown.active, named));
      },
      true,
      host,
    );
  });

  test('opens the folder picked as it is when it is a repository already, saying so', async () => {
    const before = await repository.resolve('HEAD');
    const host = hostPicking(repository.root);
    await withView(
      log,
      [],
      async (view) => {
        await withNotices(view.page, 'info', async (notices) => {
          await view.connection.receive({ type: 'initRepository' });
          assert.deepStrictEqual(notices, [
            `"${repository.root}" is a git repository already, so it was opened`,
          ]);
        });
        const shown = shownTabs(view.page);
        assert.ok(shown?.active && sameRoot(shown.active, repository.root));
        assert.deepStrictEqual(await repository.resolve('HEAD'), before);
        assert.strictEqual(view.page.last('confirmInit'), undefined);
      },
      true,
      host,
    );
  });

  test('asks before initing a repository in a folder inside another, and inits it once confirmed', async () => {
    const inside = path.join(repository.root, 'nested');
    fs.mkdirSync(inside, { recursive: true });
    const host = hostPicking(inside);
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'initRepository' });
        const asked = view.page.last('confirmInit');
        assert.ok(asked && sameRoot(asked.folder, inside));
        assert.ok(sameRoot(asked.repository, repository.root));
        assert.ok(!fs.existsSync(path.join(inside, '.git')));
        assert.strictEqual(shownTabs(view.page)?.tabs.length ?? 0, 0);
        await view.connection.receive({
          type: 'initInside',
          folder: asked.folder,
        });
        assert.ok(fs.statSync(path.join(inside, '.git')).isDirectory());
        const shown = shownTabs(view.page);
        assert.ok(shown?.active && sameRoot(shown.active, inside));
      },
      true,
      host,
    );
  });

  test('inits nothing inside another repository for a folder other than the one asked about, or once confirmed already', async () => {
    const inside = path.join(repository.root, 'asked');
    const other = path.join(repository.root, 'other');
    fs.mkdirSync(inside, { recursive: true });
    fs.mkdirSync(other, { recursive: true });
    const host = hostPicking(inside);
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'initRepository' });
        await view.connection.receive({ type: 'initInside', folder: other });
        assert.ok(!fs.existsSync(path.join(other, '.git')));
        assert.ok(!fs.existsSync(path.join(inside, '.git')));
        await view.connection.receive({ type: 'initRepository' });
        await view.connection.receive({ type: 'initInside', folder: inside });
        fs.rmSync(path.join(inside, '.git'), { recursive: true, force: true });
        await view.connection.receive({ type: 'initInside', folder: inside });
        assert.ok(!fs.existsSync(path.join(inside, '.git')));
      },
      true,
      host,
    );
  });

  test('inits nothing when the folder dialog is cancelled', async () => {
    const host = hostPicking(undefined);
    await withView(
      log,
      [],
      async (view) => {
        view.page.clear();
        await view.connection.receive({ type: 'initRepository' });
        assert.strictEqual(shownTabs(view.page)?.tabs.length ?? 0, 0);
        assert.strictEqual(view.page.last('notice'), undefined);
        assert.strictEqual(view.page.last('confirmInit'), undefined);
      },
      true,
      host,
    );
  });

  test("says why when git can't init the folder picked", async () => {
    const gone = path.join(folder, 'gone');
    const host = hostPicking(gone);
    await withView(
      log,
      [],
      async (view) => {
        await withNotices(view.page, 'error', async (notices) => {
          await view.connection.receive({ type: 'initRepository' });
          assert.deepStrictEqual(notices, [
            `Couldn't init a repository in "${gone}". ${gone} doesn't exist anymore`,
          ]);
        });
        assert.strictEqual(shownTabs(view.page)?.tabs.length ?? 0, 0);
        assert.ok(!fs.existsSync(gone));
        takeErrorsLogged(
          logged,
          /^Initing a repository in .+ failed$/,
          /doesn't exist anymore$/,
        );
      },
      true,
      host,
    );
  });

  test('uses a repository cloned inside another, not the outer one', async () => {
    const outer = await tempRepository(path.join(folder, 'outer'));
    const nested = await tempRepository(path.join(outer.root, 'nested'), {
      branch: 'inner',
    });
    await nested.commit('inner');
    const [inner] = await nested.resolve('HEAD');
    await withView(log, [nested.root], async (view) => {
      const info = view.page.last('repository');
      assert.strictEqual(info?.head, 'inner');
      assert.strictEqual(info?.headCommit, inner);
    });
  });

  test('opens a repository without commits', async () => {
    const empty = await tempRepository(path.join(folder, 'empty'));
    fs.writeFileSync(path.join(empty.root, 'new.txt'), 'new\n');
    await withView(log, [empty.root], async (view) => {
      assert.strictEqual(view.page.last('error'), undefined);
      assert.strictEqual(view.page.last('commits')?.total, 0);
      assert.strictEqual(view.page.last('workingTree')?.files, 1);
    });
  });

  test('makes the main branch a bookmark once a repository opened without commits has one', async () => {
    const empty = await tempRepository(path.join(folder, 'unborn'));
    await withView(log, [empty.root], async (view) => {
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, []);
      await empty.commit('first');
      await view.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, [
        { kind: 'branch', name: 'main' },
      ]);
      assert.deepStrictEqual(savedBookmarks(view.store, empty.root), [
        { kind: 'branch', name: 'main' },
      ]);
    });
  });
});
