import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { tabsKey, windowsKey } from '../../../../../shell/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import type { TempRepository } from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import { attach, closeViews, openView } from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';
import type { FakePage, PageMessage } from '../../../../helpers/fakePage';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const keptOf = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'keptTab' || message.type === 'keptCompare'
      ? [message]
      : [],
  );

const forgotten = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'forgetTabs' ? [message] : [],
  );

const sentBefore = (
  page: FakePage,
  kept: PageMessage['type'],
  shown: PageMessage['type'],
) => {
  const types = page.messages.map((message) => message.type);
  return (
    types.indexOf(kept) !== -1 && types.indexOf(kept) < types.indexOf(shown)
  );
};

suite('Git tool keeping what its pages keep of their tabs', () => {
  let folder: string;
  let files: string;
  let repository: TempRepository;
  let other: string;
  let compare: { readonly old: string; readonly new: string };

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, other } = await viewRepositories());
    files = tempFolder('kept-compare');
    compare = {
      old: path.join(files, 'old.txt'),
      new: path.join(files, 'new.txt'),
    };
    fs.writeFileSync(compare.old, 'old\n');
    fs.writeFileSync(compare.new, 'new\n');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
    removeFolder(files);
  });

  async function twoWindows() {
    const first = await openView(log, [], false);
    await first.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '2', tool: 'git', compare },
      { id: '3', tool: 'git', root: other },
    ]);
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1', '2'], active: '1' },
      { id: '2', tabs: ['3'], active: '3' },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    await first.view.idle();
    return { first, second };
  }

  test('hands what a page kept of a worktree and of a compare tab back to the page of its window once reloaded, before what it needs to draw them, and never to the page that kept it', async () => {
    const { first } = await twoWindows();
    await first.connection.receive({
      type: 'keepTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'diff' }),
    });
    await first.connection.receive({
      type: 'keepCompare',
      tab: '2',
      kept: JSON.stringify({ find: { finding: true } }),
    });
    await first.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(first.page), []);
    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({ type: 'ready' });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(reloaded.page), [
      {
        type: 'keptTab',
        root: repository.root,
        kept: JSON.stringify({ column: 'diff' }),
      },
    ]);
    assert.ok(sentBefore(reloaded.page, 'keptTab', 'worktrees'));
    await reloaded.connection.receive({ type: 'selectTab', tab: '2' });
    await waitFor(
      () => reloaded.page.last('compare')?.compare !== undefined,
      'the compare tab shown',
    );
    assert.deepStrictEqual(keptOf(reloaded.page).at(-1), {
      type: 'keptCompare',
      tab: '2',
      kept: JSON.stringify({ find: { finding: true } }),
    });
    assert.ok(sentBefore(reloaded.page, 'keptCompare', 'compare'));
  });

  test('takes what the page reloaded sends as its document goes away through the connection of the next, handing it to the next once ready', async () => {
    const { first } = await twoWindows();
    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({
      type: 'keepTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'files' }),
    });
    await reloaded.connection.receive({ type: 'ready' });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(reloaded.page), [
      {
        type: 'keptTab',
        root: repository.root,
        kept: JSON.stringify({ column: 'files' }),
      },
    ]);
  });

  test('refuses what a page sends of a tab of another window, as the page is not trusted, and forgets what a tab kept once it closes', async () => {
    const { first, second } = await twoWindows();
    await second.connection.receive({
      type: 'keepTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'diff' }),
    });
    await second.connection.receive({
      type: 'keepCompare',
      tab: '2',
      kept: JSON.stringify({ find: { finding: true } }),
    });
    await first.connection.receive({
      type: 'keepTab',
      root: other,
      kept: JSON.stringify({ column: 'diff' }),
    });
    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({ type: 'ready' });
    await reloaded.connection.receive({ type: 'selectTab', tab: '2' });
    await first.view.idle();
    const reloadedSecond = attach(first.view, '2');
    await reloadedSecond.connection.receive({ type: 'ready' });
    await first.view.idle();
    assert.deepStrictEqual(
      [keptOf(reloaded.page), keptOf(reloadedSecond.page)],
      [[], []],
    );
    await reloadedSecond.connection.receive({
      type: 'keepTab',
      root: other,
      kept: JSON.stringify({ column: 'diff' }),
    });
    await reloadedSecond.connection.receive({ type: 'closeTab', tab: '3' });
    await reloaded.connection.receive({ type: 'openRepository', root: other });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(reloaded.page), []);
  });

  test('tells the page of the window a tab moved out of to let go of what it keeps of the worktrees or the compare tab it held, handing it back to that page should the tab come back', async () => {
    const { first } = await twoWindows();
    await first.connection.receive({
      type: 'keepTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'diff' }),
    });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    await first.view.idle();
    assert.deepStrictEqual(first.page.last('forgetTabs'), {
      type: 'forgetTabs',
      roots: [repository.root],
      compares: [],
    });
    const moved = attach(first.view, '3');
    await moved.connection.receive({ type: 'ready' });
    await first.view.idle();
    await moved.connection.receive({
      type: 'moveTabToWindow',
      tab: '1',
      window: '1',
    });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(first.page).at(-1), {
      type: 'keptTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'diff' }),
    });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '2' });
    await first.view.idle();
    assert.deepStrictEqual(first.page.last('forgetTabs'), {
      type: 'forgetTabs',
      roots: [],
      compares: ['2'],
    });
  });

  test('tells every page to let go of what it keeps of a tab once it closes, as nothing else would', async () => {
    const { first, second } = await twoWindows();
    await first.connection.receive({ type: 'closeTab', tab: '1' });
    await first.connection.receive({ type: 'closeTab', tab: '2' });
    await first.view.idle();
    assert.deepStrictEqual(forgotten(second.page), [
      { type: 'forgetTabs', roots: [repository.root], compares: [] },
      { type: 'forgetTabs', roots: [], compares: ['2'] },
    ]);
    assert.deepStrictEqual(forgotten(first.page), forgotten(second.page));
  });

  test('takes what the page of the window a tab moved out of sends of it once it shows another tab, and hands it to the window the tab moved to', async () => {
    const { first } = await twoWindows();
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    await first.view.idle();
    await first.connection.receive({
      type: 'keepTab',
      root: repository.root,
      kept: JSON.stringify({ column: 'diff' }),
    });
    const moved = attach(first.view, '3');
    await moved.connection.receive({ type: 'ready' });
    await first.view.idle();
    assert.deepStrictEqual(keptOf(moved.page), [
      {
        type: 'keptTab',
        root: repository.root,
        kept: JSON.stringify({ column: 'diff' }),
      },
    ]);
  });
});
