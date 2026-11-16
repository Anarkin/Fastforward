import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import { attach, closeViews } from '../../../helpers/harness';
import type { FakePage } from '../../../helpers/fakePage';
import { twoWindows } from './shellFixtures';

const handed = (page: FakePage) =>
  page.sent.flatMap((message) => {
    if (message.type === 'view') {
      return [`view ${message.tab} ${message.view}`];
    }
    return message.type === 'tool' && message.message.type === 'show'
      ? [`show ${message.message.tab}`]
      : [];
  });

const released = (page: FakePage) =>
  page.sent.flatMap((message) =>
    message.type === 'release' ? [message.tab] : [],
  );

suite('Shell keeping the views of tabs', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('hands the view a page kept of a tab to the page of its window once reloaded, right before the tool shows the tab, taking what the old page sent as it went away through the connection of the new', async () => {
    const { first } = await twoWindows(log, noGit);
    await first.connection.receive({
      type: 'keepView',
      tab: '1',
      view: '{"kept":1}',
    });
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    assert.deepStrictEqual(
      handed(first.page).filter((each) => each.startsWith('view')),
      [],
    );

    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({
      type: 'keepView',
      tab: '1',
      view: '{"kept":2}',
    });
    await reloaded.connection.receive({ type: 'ready' });

    assert.deepStrictEqual(handed(reloaded.page), [
      'view 1 {"kept":2}',
      'show 1',
    ]);
  });

  test('refuses the view a page sends of a tab its window does not hold, as the page is not trusted', async () => {
    const { first, second } = await twoWindows(log, noGit);
    await second.connection.receive({
      type: 'keepView',
      tab: '1',
      view: '{"forged":1}',
    });
    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({ type: 'ready' });

    assert.deepStrictEqual(handed(reloaded.page), ['show 1']);
  });

  test('forgets the view of a tab once it closes, its window too, telling every page to let go of it', async () => {
    const { first, second } = await twoWindows(log, noGit);
    await first.connection.receive({
      type: 'keepView',
      tab: '5',
      view: '{"kept":1}',
    });
    await first.connection.receive({ type: 'closeTab', tab: '5' });
    first.shell.closeWindow('2');

    assert.deepStrictEqual(released(first.page), ['5', '2', '3', '4']);
    assert.deepStrictEqual(released(second.page), ['5', '2', '3', '4']);
  });
});
