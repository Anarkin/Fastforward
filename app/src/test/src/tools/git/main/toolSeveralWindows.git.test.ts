import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  sameRoot,
  tabsKey,
  windowsKey,
} from '../../../../../shell/main/storage';
import { recentKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  attach,
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gitState,
  openView,
  type FakePage,
} from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';

const shownIn = (page: FakePage) => [
  page.tabs?.tabs.map((tab) => tab.id),
  page.tabs?.active,
];

const committed = (page: FakePage) =>
  page.last('commits')?.commits.map((commit) => commit.subject) ?? [];

suite('Git tool in several windows', () => {
  let folder: string;
  let repository: TempRepository;
  let other: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, other } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  async function twoWindows(host = new FakeHost(), secondActive = '2') {
    const first = await openView(log, [], false, host);
    await first.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '2', tool: 'git', root: other },
      { id: '3', tool: 'terminal' },
    ]);
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1'], active: '1' },
      { id: '2', tabs: ['2', '3'], active: secondActive },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    await first.view.idle();
    return { first, second };
  }

  test('shows a repository in each window at once, sending each page the history of its own', async () => {
    const { first, second } = await twoWindows();
    await waitFor(
      () => committed(first.page).includes('merge feature'),
      'the history of the first window',
    );
    await waitFor(
      () => committed(second.page).includes('other'),
      'the history of the second window',
    );
    assert.ok(!committed(first.page).includes('other'));
    assert.ok(!committed(second.page).includes('merge feature'));
  });

  test('does nothing a page asks of a repository its window does not show, as the page is not trusted', async () => {
    const { first, second } = await twoWindows();
    await first.view.idle();
    second.page.clear();
    first.page.clear();
    await first.connection.receive({
      type: 'searchCommits',
      root: other,
      query: 'other',
    });
    await first.view.idle();
    assert.strictEqual(first.page.last('commitSearch'), undefined);
    assert.strictEqual(second.page.last('commitSearch'), undefined);
  });

  test('shows a repository opened again in the window that has its tab, leaving the window that asked as it was', async () => {
    const host = new FakeHost();
    host.folders = [other];
    const { first, second } = await twoWindows(host, '3');
    await first.connection.receive({ type: 'browseRepositories' });
    await first.view.idle();
    assert.deepStrictEqual(shownIn(first.page), [['1'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3'], '2']);
    assert.deepStrictEqual(first.store.get(windowsKey), [
      { id: '1', tabs: ['1'], active: '1' },
      { id: '2', tabs: ['2', '3'], active: '2' },
    ]);
  });

  test('forgets a recent repository in every window once one forgets it', async () => {
    const gone = path.join(folder, 'forgotten-everywhere');
    const host = new FakeHost();
    const first = await openView(log, [], false, host);
    await gitState(first.store).update(recentKey, [gone]);
    await first.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '2', tool: 'git', root: other },
    ]);
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1'], active: '1' },
      { id: '2', tabs: ['2'], active: '2' },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    await first.view.idle();
    const listed = (page: FakePage) =>
      (page.last('recent')?.recent ?? []).some((recent) =>
        sameRoot(recent.root, gone),
      );
    assert.ok(listed(second.page));
    await first.connection.receive({ type: 'forgetRecent', root: gone });
    assert.deepStrictEqual(
      [listed(first.page), listed(second.page)],
      [false, false],
    );
  });
});
