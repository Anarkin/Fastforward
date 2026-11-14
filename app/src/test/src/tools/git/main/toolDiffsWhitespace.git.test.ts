import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { waitFor } from '../../../../helpers/fixtures';
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
  gate,
  numberedLines,
  stubMethod,
  withView,
  tabOf,
} from '../../../../helpers/harness';
import { fortyLines } from '../../../../helpers/gitFixtures';

const forged = (json: string): ToHost => JSON.parse(json);

suite('Git tool showing diffs', () => {
  let folder: string;
  let other: string;
  let long: TempRepository;
  let spaced: TempRepository;
  let indent: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('diffs');
    const otherRepository = await tempRepository(path.join(folder, 'other'));
    await otherRepository.commit('other');
    other = otherRepository.root;
    long = await tempRepository(path.join(folder, 'long'));
    await long.commit('first', {
      'a.txt': fortyLines(-1),
      'b.txt': fortyLines(-1),
    });
    await long.commit('second', {
      'a.txt': fortyLines(19),
      'b.txt': fortyLines(19),
    });
    spaced = await tempRepository(path.join(folder, 'spaced'));
    await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
    await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
    [indent] = await spaced.resolve('HEAD');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows the changes to whitespace of a commit once asked, though asked while its files were still being read', async () => {
    await withView(log, [spaced.root], async (view) => {
      const held = gate();
      let reading = false;
      stubMethod(view.view, 'commitFiles', async (original, ...args) => {
        reading = true;
        await held.opened;
        return original(...args);
      });
      const selected = view.connection.receive({
        type: 'selectCommit',
        root: spaced.root,
        hash: indent,
      });
      await waitFor(() => reading, 'the files of the commit to be read');
      await view.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: false,
      });
      held.open();
      await selected;
      assert.match(view.page.last('diff')?.patch ?? '', /^-one\n\+ {2}one$/m);
    });
  });

  test('names the files whose changes ignoring whitespace leaves out of a diff, showing one entire as its new lines unchanged', async () => {
    await withView(log, [spaced.root], async (view) => {
      const diff = () => view.page.last('diff');
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      await view.connection.receive({
        type: 'selectCommit',
        root: spaced.root,
        hash: indent,
      });
      assert.strictEqual(diff()?.patch, '');
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt']);
      await view.connection.receive({
        type: 'selectFile',
        root: spaced.root,
        hash: indent,
        path: 'a.txt',
      });
      assert.strictEqual(diff()?.patch, '');
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt']);

      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      assert.match(
        diff()?.patch ?? '',
        /^diff --git a\/a\.txt b\/a\.txt\n(?:(?!@@).*\n)*@@ -1,2 \+1,2 @@\n {3}one\n two\n$/,
      );
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt']);

      await view.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: false,
      });
      assert.match(diff()?.patch ?? '', /^-one\n\+ {2}one$/m);
      assert.strictEqual(diff()?.whitespaceOnly, undefined);
    });
  });

  test('names the files whose changes are all whitespace among all the changes, and among the staged and unstaged ones apart, also once one becomes so, showing a staged one entire as staged', async () => {
    const edited = await tempRepository(path.join(folder, 'spaced-edited'));
    await edited.commit('first', {
      'a.txt': 'one\n',
      'b.txt': 'one\n',
      'c.txt': 'one\n',
      'd.txt': 'one\n',
    });
    const write = (file: string, text: string) =>
      fs.writeFileSync(path.join(edited.root, file), text);
    write('a.txt', '  one\n');
    write('b.txt', 'two\n');
    write('c.txt', '\tone\n');
    await edited.git('add', 'c.txt');
    write('c.txt', '\tone\nmore\n');
    await withView(log, [edited.root], async (view) => {
      const diff = () => view.page.last('diff');
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      await view.connection.receive({
        type: 'selectCommit',
        root: edited.root,
        hash: workingTreeHash,
      });
      assert.strictEqual(diff()?.area, undefined);
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt']);
      await view.connection.receive({
        type: 'selectFile',
        root: edited.root,
        hash: workingTreeHash,
        path: undefined,
        area: 'staged',
      });
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['c.txt']);
      await view.connection.receive({
        type: 'selectFile',
        root: edited.root,
        hash: workingTreeHash,
        path: undefined,
        area: 'unstaged',
      });
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt']);

      write('d.txt', 'one  \n');
      await view.connection.refresh();
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['a.txt', 'd.txt']);

      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      await view.connection.receive({
        type: 'selectFile',
        root: edited.root,
        hash: workingTreeHash,
        path: 'c.txt',
        area: 'staged',
      });
      assert.match(diff()?.patch ?? '', /^@@ -1 \+1 @@\n \tone\n$/m);
      assert.deepStrictEqual(diff()?.whitespaceOnly, ['c.txt']);
    });
  });

  test('names a file left out of a diff that loads with all its changes whitespace', async () => {
    const large = await tempRepository(path.join(folder, 'spaced-large'));
    await large.commit('first', {
      'large.txt': numberedLines('line'),
      'small.txt': 'one\n',
    });
    fs.writeFileSync(
      path.join(large.root, 'large.txt'),
      numberedLines('line').replaceAll('\n', ' \n'),
    );
    fs.writeFileSync(path.join(large.root, 'small.txt'), 'two\n');
    await withView(log, [large.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: large.root,
        hash: workingTreeHash,
      });
      const diff = view.page.last('diff');
      assert.deepStrictEqual(
        diff?.leftOut?.map((file) => file.path),
        ['large.txt'],
      );
      assert.strictEqual(diff.whitespaceOnly, undefined);
      await view.connection.receive({
        type: 'loadFileDiff',
        root: large.root,
        hash: workingTreeHash,
        path: 'large.txt',
        diff: 1,
      });
      const fileDiff = view.page.last('fileDiff');
      assert.strictEqual(fileDiff?.patch, '');
      assert.strictEqual(fileDiff.whitespaceOnly, true);
    });
  });

  test('shows the diff anew with settings changed by hand once the page loads again', async () => {
    await withView(log, [spaced.root], async (view) => {
      const changed = () =>
        /^[-+] {0,2}one$/m.test(view.page.last('diff')?.patch ?? '');
      await view.connection.receive({
        type: 'selectCommit',
        root: spaced.root,
        hash: indent,
      });
      assert.strictEqual(changed(), false);
      await view.settings.setIn('git', 'ignoreWhitespace', false);
      view.view.reloadSettings();
      view.page.clear();
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
      assert.strictEqual(changed(), true);
    });
  });

  test('wraps long lines, highlights syntax and shows whitespace by default, for the diff and the viewer alike, and remembers what is chosen in either, telling the page', async () => {
    await withView(log, [], async (view) => {
      assert.deepStrictEqual(view.page.last('textView')?.view, {
        wordWrap: true,
        showWhitespace: true,
        highlightSyntax: true,
      });
      const chosen = {
        wordWrap: false,
        showWhitespace: false,
        highlightSyntax: false,
      };
      await view.connection.receive({ type: 'setTextView', view: chosen });
      assert.deepStrictEqual(view.settings.settings.text, chosen);
      assert.deepStrictEqual(view.page.last('textView')?.view, chosen);
      await view.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(view.page.last('textView')?.view, chosen);
      await view.connection.receive(
        forged('{ "type": "setTextView", "view": { "wordWrap": "yes" } }'),
      );
      assert.deepStrictEqual(view.settings.settings.text, chosen);
    });
  });

  test('fits images to the viewer by default, and remembers when they are chosen at their real size, telling the page', async () => {
    await withView(log, [], async (view) => {
      assert.deepStrictEqual(view.page.last('imageView')?.view, {
        realSize: false,
      });
      const chosen = { realSize: true };
      await view.connection.receive({ type: 'setImageView', view: chosen });
      assert.deepStrictEqual(view.settings.settings.images, chosen);
      assert.deepStrictEqual(view.page.last('imageView')?.view, chosen);
      await view.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(view.page.last('imageView')?.view, chosen);
      await view.connection.receive(
        forged('{ "type": "setImageView", "view": { "realSize": "yes" } }'),
      );
      assert.deepStrictEqual(view.settings.settings.images, chosen);
    });
  });

  test('shows the diffs of the other tabs with the whitespace and entire file choices made in another', async () => {
    const tabbed = await tempRepository(path.join(folder, 'spaced-tabs'));
    await tabbed.commit('first', { 'a.txt': fortyLines(-1) });
    await tabbed.commit('indent', { 'a.txt': `  ${fortyLines(19)}` });
    const [tabbedIndent] = await tabbed.resolve('HEAD');
    await withView(log, [tabbed.root, other], async (view) => {
      const patch = () => view.page.last('diff')?.patch ?? '';
      const selectTab = (root: string) =>
        view.connection.receive({
          type: 'selectTab',
          tab: tabOf(view.page, root),
        });
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      await selectTab(tabbed.root);
      await view.connection.receive({
        type: 'selectCommit',
        root: tabbed.root,
        hash: tabbedIndent,
      });
      assert.doesNotMatch(patch(), /^\+ {2}line 1$/m);

      await selectTab(other);
      await view.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: false,
      });
      await selectTab(tabbed.root);
      assert.match(patch(), /^\+ {2}line 1$/m);

      await view.connection.receive({
        type: 'selectFile',
        root: tabbed.root,
        hash: tabbedIndent,
        path: 'a.txt',
      });
      assert.doesNotMatch(patch(), /^ line 40$/m);
      await selectTab(other);
      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      await selectTab(tabbed.root);
      assert.match(patch(), /^ line 40$/m);
    });
  });
});
