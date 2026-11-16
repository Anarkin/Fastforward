import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import { attach, closeViews } from '../../../helpers/harness';
import { windowsKey } from '../../../../shell/main/storage';
import { shownIn, twoWindows } from './shellFixtures';
import { FakeHost } from '../../../helpers/fakeHost';

suite('Moving tabs between windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('opens a new window with no tab beside the one whose page asks for it, keeping it among the windows', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
    await second.connection.receive({ type: 'newWindow' });
    assert.deepStrictEqual(host.opened, ['open window 3 near 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2', '3']);
    const third = attach(first.view, '3');
    await third.connection.receive({ type: 'ready' });
    assert.deepStrictEqual(shownIn(third.page), [[], undefined]);
  });

  test('moves a tab to a new window beside the one it leaves, showing it there and in the window it left the tab shown before it', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(log, noGit, host);
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

  test('tells the tool of a tab moved out of a window that the page of that window may forget what it keeps of the tab, once that page is told to show another', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
    first.page.otherTools.length = 0;
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '1',
      window: '2',
    });
    assert.deepStrictEqual(
      first.page.otherTools.flatMap(({ message }) =>
        message.type === 'show' || message.type === 'left'
          ? [`${message.type} ${message.tab}`]
          : [],
      ),
      ['show 5', 'left 1'],
    );
    assert.ok(
      !second.page.otherTools.some(({ message }) => message.type === 'left'),
    );
  });

  test('moves a tab into another window at its end, showing it there and bringing that window to the front', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
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
    const { first, second } = await twoWindows(log, noGit, host);
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
    const { first } = await twoWindows(log, noGit, host);
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

  test('passes on the drag of a tab only from the page of the window that holds it, with numbers for where it was grabbed and where the pointer is, saying whether it is the only tab of its window, as the page is not trusted', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(log, noGit, host);
    const strip = {
      left: 8,
      right: 700,
      top: 0,
      bottom: 32,
      firstTabLeft: 8,
      tabTop: 4,
      tabs: 2,
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
    await first.connection.receive({ type: 'tabStrip', ...strip, tabs: -1 });
    await first.connection.receive({ type: 'tabStrip', ...strip, tabs: 1.5 });
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
    const { second } = await twoWindows(log, noGit, host);
    second.connection.dispose();
    assert.deepStrictEqual(host.dragged, [['2', { kind: 'drop' }]]);
  });

  test('tells each page whether a tab can be torn off into a window of its own', async () => {
    const { first } = await twoWindows(log, noGit);
    assert.deepStrictEqual(first.page.last('tearsOff'), {
      type: 'tearsOff',
      allowed: true,
    });
  });

  test('tears a tab off into a window kept ready for it, showing it there and in the window it left the tab shown before it, leaving the window in front as it was while that window loaded', async () => {
    const { first, second } = await twoWindows(log, noGit);
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

  test('moves a dragged tab into the window whose strip it is over and back out, showing it in the window that holds it, and keeps the window it leaves while the drag lasts though that holds no tab', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
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
    const { first, second } = await twoWindows(log, noGit);
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
});
