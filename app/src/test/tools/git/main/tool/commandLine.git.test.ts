import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../../../../shared/strings';
import { sameRoot, toolState } from '../../../../../shell/main/storage';
import { visitsIn } from '../../../../../tools/terminal/main/folderRanks';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  failOnErrorsLogged,
  openView,
  reopen,
  withView,
  type OpenView,
  shownTabs,
} from '../../../../harness';

function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

function tabNames(view: OpenView): readonly string[] | undefined {
  return shownTabs(view.page)?.tabs.map((tab) => tab.name);
}

function headsShown(view: OpenView): readonly (string | undefined)[] {
  return view.page.messages.flatMap((message) =>
    message.type === 'repository' ? [message.headCommit] : [],
  );
}

suite('Git tool of folders asked for from the command line', () => {
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

  test('asks which tool opens the folders asked for before the page is ready, once it is, then opens them in the tool picked, showing the last', async () => {
    const view = await openView(log, [repository.root], false);
    try {
      const inner = path.join(other, 'inner');
      await view.shell.openFolders([third, inner]);
      await view.connection.receive({ type: 'ready' });
      await view.view.idle();
      assert.deepStrictEqual(view.page.last('chooseTool'), {
        type: 'chooseTool',
        folders: [third, inner],
        choices: [
          { tool: 'git', fits: true },
          { tool: 'files', fits: true },
          { tool: 'terminal', fits: true },
        ],
        picked: 'git',
      });
      assert.deepStrictEqual(tabNames(view), ['main']);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      await view.view.idle();
      assert.deepStrictEqual(tabNames(view), ['main', 'third', 'other']);
      const shown = shownTabs(view.page);
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.strictEqual(headsShown(view).at(-1), otherHead);
    } finally {
      view.connection.dispose();
    }
  });

  test('switches to the tab of a folder asked for while the page is shown, adding none for a repository open already', async () => {
    await withView(log, [repository.root, other], async (view) => {
      await view.shell.openFolders([path.join(other, 'inner')]);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.deepStrictEqual(tabNames(view), ['main', 'other']);
      const shown = shownTabs(view.page);
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.strictEqual(view.page.last('repository')?.headCommit, otherHead);
    });
  });

  test('shows the worktree a folder asked for is in, in the tab of its repository showing another', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([feature]);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.deepStrictEqual(tabNames(view), ['main']);
      assert.ok(sameRealFolder(shownTabs(view.page)?.worktree, feature));
      assert.strictEqual(view.page.last('repository')?.head, 'feature');
    });
  });

  test('turns the git tool off for a folder outside a repository, picking the file manager, and opens a files tab for it', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([plain]);
      assert.deepStrictEqual(view.page.last('chooseTool'), {
        type: 'chooseTool',
        folders: [plain],
        choices: [
          { tool: 'git', fits: false },
          { tool: 'files', fits: true },
          { tool: 'terminal', fits: true },
        ],
        picked: 'files',
      });
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.deepStrictEqual(tabNames(view), ['main']);
      await view.connection.receive({ type: 'openWith', tool: 'files' });
      const tabs = view.page.last('tabs');
      assert.deepStrictEqual(
        tabs?.tabs.map(({ tool, name, root }) => ({ tool, name, root })),
        [
          { tool: 'git', name: 'main', root: repository.root },
          { tool: 'files', name: strings.tools.files, root: plain },
        ],
      );
      assert.strictEqual(tabs?.active, tabs?.tabs.at(-1)?.id);
    });
  });

  test('opens a terminal tab for a folder picked to open in Terminal', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([plain]);
      await view.connection.receive({ type: 'openWith', tool: 'terminal' });
      const tabs = view.page.last('tabs');
      assert.deepStrictEqual(
        tabs?.tabs.map(({ tool, name, root }) => ({ tool, name, root })),
        [
          { tool: 'git', name: 'main', root: repository.root },
          { tool: 'terminal', name: 'plain', root: plain },
        ],
      );
      assert.strictEqual(tabs?.active, tabs?.tabs.at(-1)?.id);
    });
  });

  test('counts a repository opened, and a folder opened in a terminal, as visits the terminal ranks the folders it offers by', async () => {
    await withView(log, [], async (view) => {
      await view.shell.openFolders([third]);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      await view.shell.openFolders([plain]);
      await view.connection.receive({ type: 'openWith', tool: 'terminal' });
      const visited = visitsIn(
        toolState(view.store, 'terminal').get('folders'),
      ).map((entry) => entry.folder);
      assert.ok(
        visited.some((each) => sameRoot(each, third)) &&
          visited.some((each) => sameRoot(each, plain)),
        JSON.stringify(visited),
      );
    });
  });

  test('says no tool opens a folder that is not there, asking nothing', async () => {
    await withView(log, [repository.root], async (view) => {
      const missing = path.join(folder, 'missing');
      const sent = view.page.messages.length;
      await view.shell.openFolders([missing]);
      assert.deepStrictEqual(
        view.page.messages
          .slice(sent)
          .map((message) =>
            message.type === 'notice' ? message.message : message.type,
          ),
        [strings.messages.noToolOpens(missing)],
      );
      await view.connection.receive({ type: 'openWith', tool: 'files' });
      assert.deepStrictEqual(tabNames(view), ['main']);
    });
  });

  test('asks again when the page answers with a tool that cannot open the folders, as the page has closed its question', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([plain]);
      const asked = () =>
        view.page.messages.filter((message) => message.type === 'chooseTool');
      assert.strictEqual(asked().length, 1);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.strictEqual(asked().length, 2);
      assert.deepStrictEqual(asked().at(-1), asked().at(0));
      assert.deepStrictEqual(tabNames(view), ['main']);
    });
  });

  test('asks about a folder asked for twice once, however it is spelled', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([other]);
      await view.shell.openFolders([other, `${other}${path.sep}`]);
      assert.deepStrictEqual(view.page.last('chooseTool')?.folders, [other]);
      await view.connection.receive({ type: 'openWith', tool: 'files' });
      assert.deepStrictEqual(tabNames(view), ['main', strings.tools.files]);
    });
  });

  test('opens nothing when the question is closed', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([other]);
      await view.connection.receive({ type: 'openWith', tool: undefined });
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.deepStrictEqual(tabNames(view), ['main']);
    });
  });

  test('asks again about the folders asked for while the page loads again once it is ready', async () => {
    await withView(log, [repository.root], async (view) => {
      view.connection.dispose();
      await view.shell.openFolders([other]);
      const reloaded = reopen(view.view);
      try {
        await reloaded.ready;
        await view.view.idle();
        assert.deepStrictEqual(reloaded.page.last('chooseTool')?.folders, [
          other,
        ]);
        await reloaded.connection.receive({ type: 'openWith', tool: 'git' });
        const shown = shownTabs(reloaded.page);
        assert.ok(shown?.active && sameRoot(shown.active, other));
      } finally {
        reloaded.connection.dispose();
      }
    });
  });

  test('asks about a folder asked for while the question is open together with those asked for before it', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.shell.openFolders([other]);
      await view.shell.openFolders([third]);
      assert.deepStrictEqual(view.page.last('chooseTool')?.folders, [
        other,
        third,
      ]);
      await view.connection.receive({ type: 'openWith', tool: 'git' });
      assert.deepStrictEqual(tabNames(view), ['main', 'other', 'third']);
      const shown = shownTabs(view.page);
      assert.ok(shown?.active && sameRoot(shown.active, third));
    });
  });
});
