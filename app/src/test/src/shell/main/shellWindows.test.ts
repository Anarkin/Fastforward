import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { recordingLog } from '../../../helpers/stub';
import {
  attach,
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  openView,
  type FakePage,
} from '../../../helpers/harness';
import { removeFolder, tempFolder } from '../../../helpers/repositories';
import { tabsKey, windowsKey } from '../../../../shell/main/storage';
import { noticesOf } from './shellFixtures';

const commanderTab = (id: string) => ({ id, tool: 'commander' }) as const;

const savedIds = (saved: unknown) =>
  Array.isArray(saved)
    ? saved.flatMap((tab: unknown) =>
        typeof tab === 'object' && tab !== null && 'id' in tab ? [tab.id] : [],
      )
    : [];

const windowsListed = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'windows' ? [message.windows] : [],
  );

const shownIn = (page: FakePage) => [
  page.tabs?.tabs.map((tab) => tab.id),
  page.tabs?.active,
];

suite('Shell with several windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  async function twoWindows(host = new FakeHost()) {
    const first = await openView(log, [], false, host, undefined, noGit);
    await first.store.update(
      tabsKey,
      ['1', '5', '2', '3', '4'].map(commanderTab),
    );
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1', '5'], active: '1' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    return { first, second };
  }

  test('tells each window its own tabs and the one active in it', async () => {
    const { first, second } = await twoWindows();
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4'], '4']);
  });

  test('opens a new tab in the window whose page asked for it', async () => {
    const { first, second } = await twoWindows();
    await second.connection.receive({ type: 'newTab', tool: 'commander' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4', '6'], '6']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('opens a new window with no tab beside the one whose page asks for it, keeping it among the windows', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await second.connection.receive({ type: 'newWindow' });
    assert.deepStrictEqual(host.opened, ['open window 3 near 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2', '3']);
    const third = attach(first.view, '3');
    await third.connection.receive({ type: 'ready' });
    assert.deepStrictEqual(shownIn(third.page), [[], undefined]);
  });

  test('closes a window and its tabs while another window is open', async () => {
    const { first } = await twoWindows();
    first.shell.closeWindow('2');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(savedIds(first.store.get(tabsKey)), ['1', '5']);
  });

  test('closes a window once its last tab closes while another window is open, as it stayed open showing no tab, and no tab could open in it again', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    for (const tab of ['2', '3', '4']) {
      await second.connection.receive({ type: 'closeTab', tab });
    }
    assert.deepStrictEqual(host.opened, ['close window 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(windowsListed(first.page).at(-1), []);
  });

  test('lets go of the page of a window closed, or of one kept ready for a tab torn off, once it is gone, as every window torn off and closed in a long run was held for good', async () => {
    const { first, second } = await twoWindows();
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    first.shell.closeWindow('2');
    second.connection.dispose();
    spare.connection.dispose();
    first.connection.dispose();
    const pages: unknown = Reflect.get(first.shell, 'pages');
    assert.ok(pages instanceof Map);
    assert.deepStrictEqual([...pages.keys()], ['1']);
  });

  test('never closes the last window, as quitting keeps its tabs for the next start', async () => {
    const { first } = await twoWindows();
    first.shell.closeWindow('2');
    first.shell.closeWindow('1');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('asks the page of a window before closing it while it holds a tab of a tool that confirms closing, as closing a Terminal ends its shell, and leaves closing it to the app once the page confirms', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    assert.strictEqual(first.shell.asksBeforeClosing('2'), false);
    await second.connection.receive({ type: 'newTab', tool: 'terminal' });
    assert.strictEqual(first.shell.asksBeforeClosing('2'), true);
    assert.strictEqual(first.shell.asksBeforeClosing('1'), false);

    assert.strictEqual(first.shell.askToCloseWindow('2'), true);
    assert.deepStrictEqual(second.page.last('confirmCloseWindow'), {
      type: 'confirmCloseWindow',
    });
    assert.strictEqual(first.page.last('confirmCloseWindow'), undefined);
    await second.connection.receive({ type: 'closeWindow' });
    assert.deepStrictEqual(host.opened, ['close window 2']);
  });

  test('asks before quitting in a window still open once the window in front closed, as the question went to the page of the window closed, and quitting did nothing', async () => {
    const { first, second } = await twoWindows();
    first.shell.focus('2');
    first.shell.closeWindow('2');
    second.connection.dispose();
    first.shell.askToQuit();
    assert.deepStrictEqual(first.page.last('confirmQuit'), {
      type: 'confirmQuit',
    });
  });

  test('selects, moves and closes only the tabs of the window whose page asks, as the page is not trusted', async () => {
    const { first } = await twoWindows();
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
    const { first, second } = await twoWindows();
    await second.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await second.connection.receive({ type: 'selectTab', tab: '4' });
    await second.connection.receive({ type: 'closeTab', tab: '4' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3'], '2']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('moves a tab to a new window beside the one it leaves, showing it there and in the window it left the tab shown before it', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    assert.deepStrictEqual(host.opened, ['open window 3 near 1']);
    assert.deepStrictEqual(shownIn(first.page), [['5'], '5']);
    assert.deepStrictEqual(first.store.get(windowsKey), [
      { id: '1', tabs: ['5'], active: '5' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
      { id: '3', tabs: ['1'], active: '1' },
    ]);
  });

  test('moves a tab into another window at its end, showing it there and bringing that window to the front', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await second.connection.receive({
      type: 'moveTabToWindow',
      tab: '3',
      window: '1',
    });
    assert.deepStrictEqual(host.opened, ['show window 1']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5', '3'], '3']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '4'], '4']);
  });

  test('closes the window whose only tab moves into another', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '5',
      window: '2',
    });
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '1',
      window: '2',
    });
    assert.deepStrictEqual(host.opened, [
      'show window 2',
      'show window 2',
      'close window 1',
    ]);
    assert.deepStrictEqual(first.shell.windows(), ['2']);
    assert.deepStrictEqual(shownIn(second.page), [
      ['2', '3', '4', '5', '1'],
      '1',
    ]);
  });

  test('moves no tab of another window, nor into a window that is gone or its own, nor the only tab of a window into a new one, as the page is not trusted', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    const layout = first.store.get(windowsKey);
    for (const move of [
      { tab: '2' },
      { tab: '2', window: '1' },
      { tab: '1', window: '9' },
      { tab: '1', window: '1' },
    ]) {
      await first.connection.receive({ type: 'moveTabToWindow', ...move });
    }
    assert.deepStrictEqual(first.store.get(windowsKey), layout);
    await first.connection.receive({ type: 'closeTab', tab: '5' });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    assert.deepStrictEqual(host.opened, []);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2']);
  });

  test('tells each window the others, named after the tab each shows, again only once they change', async () => {
    const { first, second } = await twoWindows();
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

  test('passes on the drag of a tab only from the page of the window that holds it, with numbers for where it was grabbed and where the pointer is, saying whether it is the only tab of its window, as the page is not trusted', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    const strip = {
      left: 8,
      right: 700,
      top: 0,
      bottom: 32,
      firstTabLeft: 8,
      tabTop: 4,
    };
    const grabbed = { grabX: 20, grabY: 10, screenX: 300, screenY: 40 };
    await first.connection.receive({ type: 'tearTab', tab: '2', ...grabbed });
    await first.connection.receive({
      type: 'tearTab',
      tab: '5',
      ...grabbed,
      screenX: Number.NaN,
    });
    await first.connection.receive({ type: 'tearTab', tab: '5', ...grabbed });
    await first.connection.receive({
      type: 'dragTabTo',
      screenX: Infinity,
      screenY: 3,
    });
    await first.connection.receive({
      type: 'dragTabTo',
      screenX: 310,
      screenY: 50,
    });
    await first.connection.receive({ type: 'visitIndex', index: -1 });
    await first.connection.receive({ type: 'visitIndex', index: 1.5 });
    await first.connection.receive({ type: 'visitIndex', index: 2 });
    await first.connection.receive({
      type: 'tabStrip',
      ...strip,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      top: 'top' as unknown as number,
    });
    await first.connection.receive({ type: 'tabStrip', ...strip });
    await first.connection.receive({ type: 'dropTab' });
    await first.connection.receive({ type: 'cancelTabDrag' });
    assert.deepStrictEqual(host.dragged, [
      [
        '1',
        {
          kind: 'start',
          tab: '5',
          index: 1,
          grab: { x: 20, y: 10 },
          at: { x: 300, y: 40 },
          alone: false,
        },
      ],
      ['1', { kind: 'move', at: { x: 310, y: 50 } }],
      ['1', { kind: 'index', index: 2 }],
      ['1', { kind: 'strip', strip }],
      ['1', { kind: 'drop' }],
      ['1', { kind: 'cancel' }],
    ]);
  });

  test('ends the drag of a tab where it is once the page of a window goes away, as a window closed, reloaded or crashed while its tab was dragged never ended the drag, and no tab could be torn off again', async () => {
    const host = new FakeHost();
    const { second } = await twoWindows(host);
    second.connection.dispose();
    assert.deepStrictEqual(host.dragged, [['2', { kind: 'drop' }]]);
  });

  test('tells each page whether a tab can be torn off into a window of its own', async () => {
    const { first } = await twoWindows();
    assert.deepStrictEqual(first.page.last('tearsOff'), {
      type: 'tearsOff',
      allowed: true,
    });
  });

  test('tears a tab off into a window kept ready for it, showing it there and in the window it left the tab shown before it, leaving the window in front as it was while that window loaded', async () => {
    const { first, second } = await twoWindows();
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    first.shell.notify({ level: 'info', message: 'to the window in front' });
    assert.strictEqual(spare.page.last('notice'), undefined);
    assert.ok(second.page.last('notice'));

    assert.strictEqual(await first.shell.tearOff('5', '2'), false);
    assert.strictEqual(await first.shell.tearOff('1', 's1'), true);
    assert.deepStrictEqual(shownIn(spare.page), [['1'], '1']);
    assert.deepStrictEqual(shownIn(first.page), [['5'], '5']);
    assert.strictEqual(await first.shell.tearOff('5', 's2'), false);
  });

  test('tells the window kept ready for a tab torn off neither the notices waiting for a window nor the folders asked about, as it shows them only once a tab is torn into it, long after they were answered or gone', async () => {
    const work = tempFolder('work');
    try {
      const host = new FakeHost();
      const { first, second } = await twoWindows(host);
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

  test('moves a dragged tab into the window whose strip it is over and back out, showing it in the window that holds it, and keeps the window it leaves while the drag lasts though that holds no tab', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    await first.shell.tearOff('1', 's1');
    await first.shell.moveTab('1', '2', 1);
    assert.deepStrictEqual(shownIn(second.page), [['2', '1', '3', '4'], '1']);
    assert.deepStrictEqual(shownIn(spare.page), [[], undefined]);
    assert.deepStrictEqual(host.opened, []);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2', 's1']);

    await first.shell.moveTab('1', '2', 3);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4', '1'], '1']);

    await first.shell.moveTab('1', 's1', 0);
    assert.deepStrictEqual(shownIn(spare.page), [['1'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4'], '4']);
    assert.deepStrictEqual(host.opened, []);
  });

  test('shows the page of a window the tab dragged over it, named as it is, and stops showing it once asked', async () => {
    const { first, second } = await twoWindows();
    first.shell.visit('2', { tab: '1', x: 100, grabX: 20 });
    assert.deepStrictEqual(second.page.last('tabVisit'), {
      type: 'tabVisit',
      visit: {
        tab: { id: '1', tool: 'commander', name: strings.tools.commander },
        x: 100,
        grabX: 20,
      },
    });
    first.shell.visit('2', undefined);
    assert.deepStrictEqual(second.page.last('tabVisit'), { type: 'tabVisit' });
  });

  test("tells every window how text is shown once one of them changes it, as that is the app's setting", async () => {
    const { first, second } = await twoWindows();
    const view = {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: false,
    };
    await first.connection.receive({ type: 'setTextView', view });
    assert.deepStrictEqual(second.page.last('textView')?.view, view);
  });
});
