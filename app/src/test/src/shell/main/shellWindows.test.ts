import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { plainOf } from '../../../../lib/shared/sentences';
import { strings } from '../../../../lib/shared/strings';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import { attach, closeViews } from '../../../helpers/harness';
import { Pages } from '../../../../shell/main/pages';
import type { ShellAccess } from '../../../../shell/main/toolContract';
import type { GitTool } from '../../../../tools/git/main/tool';
import { tabsKey, windowsKey } from '../../../../shell/main/storage';
import { noticesOf, shownIn, twoWindows } from './shellFixtures';
import { FakeHost } from '../../../helpers/fakeHost';
import type { FakePage } from '../../../helpers/fakePage';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

const savedIds = (saved: unknown) =>
  Array.isArray(saved)
    ? saved.flatMap((tab: unknown) =>
        typeof tab === 'object' && tab !== null && 'id' in tab ? [tab.id] : [],
      )
    : [];

const isAccess = (value: unknown): value is ShellAccess =>
  typeof value === 'object' &&
  value !== null &&
  ['pages', 'active', 'tabsOf'].every((name) => name in value);

const accessOf = (tool: GitTool): ShellAccess => {
  const access: unknown = Reflect.get(tool, 'shell');
  assert.ok(isAccess(access));
  return access;
};

const windowsListed = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'windows' ? [message.windows] : [],
  );

suite('Shell with several windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('tells each window its own tabs and the one active in it', async () => {
    const { first, second } = await twoWindows(log, noGit);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4'], '4']);
  });

  test('tells a tool every tab of the window of a page, not only the one it shows, so a tool can hold a page to the tabs of its own window', async () => {
    const { first } = await twoWindows(log, noGit);
    const access = accessOf(first.view);
    const tabsByActive = new Map(
      access
        .pages()
        .map((page) => [
          access.active(page)?.id,
          access.tabsOf(page).map((tab) => tab.id),
        ]),
    );
    assert.deepStrictEqual(
      tabsByActive,
      new Map([
        ['1', ['1', '5']],
        ['4', ['2', '3', '4']],
      ]),
    );
  });

  test('opens a new tab in the window whose page asked for it', async () => {
    const { first, second } = await twoWindows(log, noGit);
    await second.connection.receive({ type: 'newTab', tool: 'commander' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4', '6'], '6']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('closes a window and its tabs while another window is open', async () => {
    const { first } = await twoWindows(log, noGit);
    first.shell.closeWindow('2');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(savedIds(first.store.get(tabsKey)), ['1', '5']);
  });

  test('closes a window once its last tab closes while another window is open, as it stayed open showing no tab, and no tab could open in it again', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
    for (const tab of ['2', '3', '4']) {
      await second.connection.receive({ type: 'closeTab', tab });
    }
    assert.deepStrictEqual(host.opened, ['close window 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(windowsListed(first.page).at(-1), []);
  });

  test('lets go of the page of a window closed, or of one kept ready for a tab torn off, once it is gone, as every window torn off and closed in a long run was held for good', async () => {
    const { first, second } = await twoWindows(log, noGit);
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    first.shell.closeWindow('2');
    second.connection.dispose();
    spare.connection.dispose();
    first.connection.dispose();
    const shellPages: unknown = Reflect.get(first.shell, 'pages');
    assert.ok(shellPages instanceof Pages);
    const pages: unknown = Reflect.get(shellPages, 'pages');
    assert.ok(pages instanceof Map);
    assert.deepStrictEqual([...pages.keys()], ['1']);
  });

  test('never closes the last window, as quitting keeps its tabs for the next start', async () => {
    const { first } = await twoWindows(log, noGit);
    first.shell.closeWindow('2');
    first.shell.closeWindow('1');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('selects, moves and closes only the tabs of the window whose page asks, as the page is not trusted', async () => {
    const { first } = await twoWindows(log, noGit);
    await first.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'moveTab', tab: '3', index: 0 });
    await first.connection.receive({ type: 'closeTab', tab: '4' });
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
    assert.deepStrictEqual(first.store.get(windowsKey), [
      { id: '1', tabs: ['1', '5'], active: '1' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
    ]);
  });

  test('shows the tab shown before in the same window once its active tab closes, passing over those shown since in another window', async () => {
    const { first, second } = await twoWindows(log, noGit);
    await second.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await second.connection.receive({ type: 'selectTab', tab: '4' });
    await second.connection.receive({ type: 'closeTab', tab: '4' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3'], '2']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('gives a window opened after others closed an id no window had since the app started, as the pages and windows of the app are kept by its id', async () => {
    const { first, second } = await twoWindows(log, noGit);
    const opened = async () => {
      const before = first.shell.windows();
      await second.connection.receive({ type: 'newWindow' });
      const made = first.shell.windows().find((id) => !before.includes(id));
      assert.ok(made !== undefined);
      return made;
    };
    const third = await opened();
    first.shell.closeWindow(third);
    const fourth = await opened();
    first.shell.closeWindow(fourth);
    first.shell.closeWindow('2');
    await first.connection.receive({ type: 'newWindow' });
    const fifth = first.shell.windows().find((id) => id !== '1');
    assert.deepStrictEqual(
      new Set(['1', '2', third, fourth, fifth]).size,
      5,
      JSON.stringify([third, fourth, fifth]),
    );
  });

  test('tells each window the others, named after the tab each shows, again only once they change', async () => {
    const { first, second } = await twoWindows(log, noGit);
    assert.deepStrictEqual(windowsListed(first.page).at(-1), [
      { id: '2', name: strings.tools.commander },
    ]);
    assert.deepStrictEqual(windowsListed(second.page).at(-1), [
      { id: '1', name: strings.tools.commander },
    ]);
    const told = windowsListed(first.page).length;
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    assert.strictEqual(windowsListed(first.page).length, told);
    await second.connection.receive({ type: 'newWindow' });
    assert.deepStrictEqual(windowsListed(first.page).at(-1), [
      { id: '2', name: strings.tools.commander },
      { id: '3', name: strings.tabs.noTabWindow },
    ]);
  });

  test('tells the window kept ready for a tab torn off neither the notices waiting for a window nor the folders asked about, as it shows them only once a tab is torn into it, long after they were answered or gone', async () => {
    const work = tempFolder('work');
    try {
      const host = new FakeHost();
      const { first, second } = await twoWindows(log, noGit, host);
      await first.shell.openFolders([work]);
      assert.ok(second.page.last('chooseTool'));
      first.connection.dispose();
      second.connection.dispose();
      first.shell.notify({ level: 'info', message: 'update ready' });
      host.unsavedState = [strings.state.putAside('state.json.corrupt')];
      const spare = attach(first.view, 's1');
      await spare.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(noticesOf(spare.page), []);
      assert.strictEqual(spare.page.last('chooseTool'), undefined);

      const reloaded = attach(first.view, '1');
      await reloaded.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(
        noticesOf(reloaded.page).map(([, message]) => plainOf(message)),
        [plainOf(strings.state.putAside('state.json.corrupt')), 'update ready'],
      );
      assert.deepStrictEqual(reloaded.page.last('chooseTool')?.folders, [work]);
    } finally {
      removeFolder(work);
    }
  });

  test("tells every window how text is shown once one of them changes it, as that is the app's setting", async () => {
    const { first, second } = await twoWindows(log, noGit);
    const view = {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: false,
      highlightOccurrences: false,
      diffCells: false,
    };
    await first.connection.receive({ type: 'setTextView', view });
    assert.deepStrictEqual(second.page.last('textView')?.view, view);
  });
});
