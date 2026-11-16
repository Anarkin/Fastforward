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

const handed = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'view' ? [`${message.tab} ${message.view}`] : [],
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

suite('Git tool and the views of its tabs', () => {
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
      { id: '2', tool: 'diff', compare },
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

  test('tells the page of each window the tab of the worktree it shows', async () => {
    const { first, second } = await twoWindows();
    assert.strictEqual(first.page.last('worktrees')?.tab, '1');
    assert.strictEqual(second.page.last('worktrees')?.tab, '3');
  });

  test('has the view of a worktree tab and of a tab of the diff handed to the page of its window once reloaded, before what it needs to draw them', async () => {
    const { first } = await twoWindows();
    await first.connection.receive({
      type: 'keepView',
      tab: '1',
      view: '{"worktrees":[]}',
    });
    await first.connection.receive({
      type: 'keepView',
      tab: '2',
      view: '{"compare":{}}',
    });
    const reloaded = attach(first.view, '1');
    await reloaded.connection.receive({ type: 'ready' });
    await first.view.idle();
    assert.deepStrictEqual(handed(reloaded.page), ['1 {"worktrees":[]}']);
    assert.ok(sentBefore(reloaded.page, 'view', 'worktrees'));
    reloaded.page.clear();
    await reloaded.connection.receive({ type: 'selectTab', tab: '2' });
    const diffShown = () =>
      reloaded.page.sent.findIndex(
        (sent) =>
          sent.type === 'tool' &&
          sent.tool === 'diff' &&
          sent.message.type === 'show',
      );
    await waitFor(() => diffShown() !== -1, 'the tab of the diff shown');
    assert.deepStrictEqual(handed(reloaded.page), ['2 {"compare":{}}']);
    assert.ok(
      reloaded.page.sent.findIndex((sent) => sent.type === 'view') <
        diffShown(),
    );
  });
});
