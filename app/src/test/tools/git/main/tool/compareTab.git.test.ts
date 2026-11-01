import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type { CompareView } from '../../../../../tools/git/shared/protocol';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { strings } from '../../../../../shared/strings';
import { tabsKey } from '../../../../../shell/main/storage';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import { waitFor } from '../../../../fixtures';
import {
  closeViews,
  failOnErrorsLogged,
  openView,
  type OpenView,
} from '../../../../harness';

const linesOf = (compare: CompareView | undefined) =>
  parsePatch(compare?.patch ?? '').flatMap((file) =>
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  );

suite('Git tool comparing two files', () => {
  let repository: TempRepository;
  let files: string;
  let opened: OpenView;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  const compares = () =>
    opened.page.messages.flatMap((message) =>
      message.type === 'compare' ? [message.compare] : [],
    );
  const lastCompare = (): CompareView | undefined => compares().at(-1);

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('compare-tab'));
    await repository.commit('root', { 'readme.txt': 'readme\n' });
    files = tempFolder('compare-tab-files');
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
    fs.writeFileSync(path.join(files, 'old.txt'), `${lines.join('\n')}\n`);
    lines[6] = 'changed';
    fs.writeFileSync(path.join(files, 'new.txt'), `${lines.join('\n')}\n`);
    opened = await openView(log, [repository.root], { watched: true });
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(repository.root);
    removeFolder(files);
  });

  test('diffs the two files of a compare tab, the whole file when asked, again when one changes, and leaves the comparison for a repository tab', async () => {
    const compare = {
      old: path.join(files, 'old.txt'),
      new: path.join(files, 'new.txt'),
    };
    const tab = { id: '9', tool: 'git', compare } as const;
    assert.deepStrictEqual(opened.view.names([tab]).get('9'), {
      name: strings.messages.compareTab('old.txt', 'new.txt'),
    });

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      tab,
    ]);
    await opened.connection.receive({ type: 'pinEntireFile', pinned: false });
    await opened.connection.receive({ type: 'selectTab', tab: '9' });
    const shown = lastCompare();
    assert.deepStrictEqual(
      shown && [shown.old, shown.new, shown.entire, shown.error],
      [compare.old, compare.new, false, undefined],
    );
    assert.ok(linesOf(shown).includes('changed'));
    assert.ok(!linesOf(shown).includes('line 0'));

    await opened.connection.receive({ type: 'compareEntire', entire: true });
    assert.strictEqual(lastCompare()?.entire, true);
    assert.ok(linesOf(lastCompare()).includes('line 0'));

    fs.appendFileSync(compare.new, 'added at the end\n');
    await waitFor(
      () => linesOf(lastCompare()).includes('added at the end'),
      'the diff of the file changed',
    );

    await opened.connection.receive({ type: 'selectTab', tab: '1' });
    assert.strictEqual(lastCompare(), undefined);
  });
});
