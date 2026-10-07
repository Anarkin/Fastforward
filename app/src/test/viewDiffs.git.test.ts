import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
  workingTreeHash,
} from '../shared/protocol';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  fortyLines,
  gate,
  numberedLines,
  stubMethod,
  viewRepositories,
  withView,
} from './viewHarness';

suite('View showing diffs', function () {
  this.timeout(30_000);

  let folder: string;
  let other: string;
  let long: TempRepository;
  let second: string;
  let spaced: TempRepository;
  let indent: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteSetup(async () => {
    ({ folder, other } = await viewRepositories());
    long = await tempRepository(path.join(folder, 'long'));
    await long.commit('first', {
      'a.txt': fortyLines(-1),
      'b.txt': fortyLines(-1),
    });
    await long.commit('second', {
      'a.txt': fortyLines(19),
      'b.txt': fortyLines(19),
    });
    [second] = await long.resolve('HEAD');
    spaced = await tempRepository(path.join(folder, 'spaced'));
    await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
    await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
    [indent] = await spaced.resolve('HEAD');
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a file entire until it is left, or always when pinned', async () => {
    await withView(log, [long.root, other], async (view) => {
      const select = (file: string | undefined) =>
        view.connection.receive({
          type: 'selectFile',
          root: long.root,
          hash: second,
          path: file,
        });
      const entire = () =>
        /^ line 1$/m.test(view.page.last('diff')?.patch ?? '');
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
      await view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: second,
      });
      await select('a.txt');
      assert.strictEqual(entire(), false);
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: true,
      });
      assert.strictEqual(entire(), true);
      await select('b.txt');
      assert.strictEqual(entire(), false);
      await select('a.txt');
      assert.strictEqual(entire(), false);

      await view.connection.receive({ type: 'pinEntireFile', pinned: true });
      assert.strictEqual(entire(), true);
      await select('b.txt');
      assert.strictEqual(entire(), true);
      assert.strictEqual(view.settings.settings.entireFilePinned, true);
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.entireFilePinned, true);
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
      assert.strictEqual(entire(), false);

      await select('a.txt');
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: true,
      });
      await view.connection.receive({ type: 'selectTab', root: other });
      await view.connection.receive({ type: 'selectTab', root: long.root });
      assert.strictEqual(entire(), false);
    });
  });

  test('keeps a file entire when another tab is closed', async () => {
    await withView(log, [other, long.root], async (view) => {
      const entire = () =>
        /^ line 1$/m.test(view.page.last('diff')?.patch ?? '');
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
      await view.connection.receive({ type: 'selectTab', root: long.root });
      await view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: second,
      });
      await view.connection.receive({
        type: 'selectFile',
        root: long.root,
        hash: second,
        path: 'a.txt',
      });
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: true,
      });
      assert.strictEqual(entire(), true);
      await view.connection.receive({ type: 'closeTab', root: other });
      assert.strictEqual(view.page.last('tabs')?.active, long.root);
      assert.strictEqual(entire(), true);
    });
  });

  test('keeps a tab as it is when it is clicked while active', async () => {
    await withView(log, [long.root, other], async (view) => {
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
      await view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: second,
      });
      await view.connection.receive({
        type: 'selectFile',
        root: long.root,
        hash: second,
        path: 'a.txt',
      });
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: true,
      });
      view.page.clear();
      await view.connection.receive({ type: 'selectTab', root: long.root });
      assert.strictEqual(view.page.last('commits'), undefined);
      assert.strictEqual(view.page.last('diff'), undefined);
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: false,
      });
      const diff = view.page.last('diff');
      assert.strictEqual(diff?.path, 'a.txt');
      assert.match(diff.patch, /^\+changed$/m);
      assert.doesNotMatch(diff.patch, /^ line 1$/m);
    });
  });

  test('shows the diff of the last entire file choice when an earlier one answers last', async () => {
    await withView(log, [long.root], async (view) => {
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
      await view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: second,
      });
      await view.connection.receive({
        type: 'selectFile',
        root: long.root,
        hash: second,
        path: 'a.txt',
      });
      const held = gate();
      let waiting = false;
      stubMethod(view.view, 'patchOf', async (original, ...args) => {
        const [, , scope] = args;
        if (
          typeof scope === 'object' &&
          scope !== null &&
          'entireFile' in scope &&
          scope.entireFile === true
        ) {
          waiting = true;
          await held.opened;
        }
        return original(...args);
      });
      const shown = view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: true,
      });
      await waitFor(() => waiting, 'the entire file');
      await view.connection.receive({
        type: 'showEntireFile',
        root: long.root,
        entire: false,
      });
      held.open();
      await shown;
      assert.doesNotMatch(view.page.last('diff')?.patch ?? '', /^ line 1$/m);
    });
  });

  test('ignores whitespace by default, and shows changes to it once asked, remembering that', async () => {
    await withView(log, [spaced.root], async (view) => {
      const changed = () =>
        /^[-+] {0,2}one$/m.test(view.page.last('diff')?.patch ?? '');
      assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, true);
      await view.connection.receive({
        type: 'selectCommit',
        root: spaced.root,
        hash: indent,
      });
      assert.strictEqual(changed(), false);
      await view.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: false,
      });
      assert.strictEqual(changed(), true);
      assert.strictEqual(view.settings.settings.ignoreWhitespace, false);
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
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
      await view.settings.set('ignoreWhitespace', false);
      view.view.reloadSettings();
      view.page.clear();
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
      assert.strictEqual(changed(), true);
    });
  });

  test('wraps no long lines by default, and wraps them once asked, remembering that', async () => {
    await withView(log, [], async (view) => {
      assert.strictEqual(view.page.last('layout')?.wordWrap, false);
      await view.connection.receive({ type: 'setWordWrap', wrap: true });
      assert.strictEqual(view.settings.settings.wordWrap, true);
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.wordWrap, true);
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
        view.connection.receive({ type: 'selectTab', root });
      await view.connection.receive({ type: 'pinEntireFile', pinned: false });
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
      await view.connection.receive({ type: 'pinEntireFile', pinned: true });
      await selectTab(tabbed.root);
      assert.match(patch(), /^ line 40$/m);
    });
  });

  test('reads a commit diff while reading its files, only once when no file is left out', async () => {
    const [first] = await long.resolve('HEAD~1');
    await withView(log, [long.root], async (view) => {
      const held = gate();
      stubMethod(view.view, 'commitFiles', async (original, ...args) => {
        await held.opened;
        return original(...args);
      });
      let patches = 0;
      stubMethod(view.view, 'patchOf', (original, ...args) => {
        patches += 1;
        return original(...args);
      });
      const selected = view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: first,
      });
      await waitFor(() => patches > 0, 'the diff to be read');
      held.open();
      await selected;
      assert.ok(view.page.last('diff')?.patch.includes('b/a.txt'));
      assert.strictEqual(patches, 1);
    });
  });

  test('leaves large files out of a commit diff until one is asked for', async () => {
    const large = await tempRepository(path.join(folder, 'large'));
    const lines = Array.from({ length: 2000 }, (_, index) => `line ${index}`);
    await large.commit('large', {
      'large.txt': lines.join('\n'),
      'small.txt': 'small\n',
    });
    const [hash] = await large.resolve('HEAD');
    await withView(log, [large.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: large.root,
        hash,
      });
      const patch = view.page.last('diff')?.patch ?? '';
      assert.ok(patch.includes('b/small.txt'), patch);
      assert.ok(!patch.includes('large.txt'), patch);
      await view.connection.receive({
        type: 'loadFileDiff',
        root: large.root,
        hash,
        path: 'large.txt',
        diff: 1,
      });
      const fileDiff = view.page.last('fileDiff');
      assert.strictEqual(fileDiff?.path, 'large.txt');
      assert.ok(fileDiff?.patch.includes('+line 1999'));
      assert.strictEqual(fileDiff.diff, 1);
    });
  });

  test('sends an opened file left out of the uncommitted diff again once it changed on disk', async () => {
    const large = await tempRepository(path.join(folder, 'large-edited'));
    await large.commit('large', {
      'large.txt': numberedLines('line'),
      'small.txt': 'small\n',
    });
    const file = path.join(large.root, 'large.txt');
    fs.writeFileSync(file, numberedLines('first'));
    fs.writeFileSync(path.join(large.root, 'small.txt'), 'changed\n');
    await withView(
      log,
      [large.root],
      async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash: workingTreeHash,
        });
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash: workingTreeHash,
          path: 'large.txt',
          diff: 1,
        });
        assert.ok(view.page.last('fileDiff')?.patch.includes('+first 1999'));
        view.page.clear();
        await view.connection.refresh();
        assert.strictEqual(view.page.last('fileDiff'), undefined);
        fs.writeFileSync(file, numberedLines('second'));
        await view.connection.refresh();
        assert.strictEqual(view.page.last('diff'), undefined);
        const fileDiff = view.page.last('fileDiff');
        assert.strictEqual(fileDiff?.diff, 1);
        assert.ok(fileDiff.patch.includes('+second 1999'));
      },
      'unwatched',
    );
  });

  test('leaves the files past the budget out of a commit diff', async () => {
    const many = await tempRepository(path.join(folder, 'many'));
    const files = Math.ceil(patchLineBudget / collapseThreshold);
    const text = 'line\n'.repeat(collapseThreshold);
    await many.commit(
      'many',
      Object.fromEntries(
        Array.from({ length: files }, (_, index) => [
          `${String(index).padStart(2, '0')}.txt`,
          text,
        ]),
      ),
    );
    const [hash] = await many.resolve('HEAD');
    await withView(log, [many.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: many.root,
        hash,
      });
      assert.strictEqual(view.page.last('files')?.files.length, files);
      const patch = view.page.last('diff')?.patch ?? '';
      const last = `${String(files - 1).padStart(2, '0')}.txt`;
      assert.ok(patch.includes('b/00.txt'), patch.slice(0, 200));
      assert.ok(!patch.includes(last), last);
    });
  });

  test('leaves a file of one line past the bytes of the budget out of a commit diff', async () => {
    const bundled = await tempRepository(path.join(folder, 'bundled'));
    await bundled.commit('bundled', {
      'a.txt': 'small\n',
      'bundle.min.js': 'x'.repeat(patchByteBudget + 1),
    });
    const [hash] = await bundled.resolve('HEAD');
    await withView(log, [bundled.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: bundled.root,
        hash,
      });
      const patch = view.page.last('diff')?.patch ?? '';
      assert.ok(patch.includes('b/a.txt'), patch.slice(0, 200));
      assert.ok(!patch.includes('bundle.min.js'), patch.slice(0, 200));
    });
  });

  test('shows the diff of one file the commit changed, following a rename', async () => {
    const renamed = await tempRepository(path.join(folder, 'renamed'));
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    await renamed.commit('old', {
      'old.txt': lines.join('\n'),
      'other.txt': 'one\n',
    });
    await renamed.git('mv', 'old.txt', 'new.txt');
    fs.writeFileSync(path.join(renamed.root, 'other.txt'), 'two\n');
    await renamed.git('commit', '-am', 'rename');
    const [hash] = await renamed.resolve('HEAD');
    await withView(log, [renamed.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: renamed.root,
        hash,
      });
      await view.connection.receive({
        type: 'selectFile',
        root: renamed.root,
        hash,
        path: 'new.txt',
      });
      const diff = view.page.last('diff');
      assert.strictEqual(diff?.path, 'new.txt');
      assert.ok(diff.patch.includes('rename from old.txt'), diff.patch);
      assert.ok(!diff.patch.includes('other.txt'), diff.patch);
      await view.connection.receive({
        type: 'loadFileDiff',
        root: renamed.root,
        hash,
        path: 'new.txt',
        diff: 1,
      });
      assert.ok(
        view.page.last('fileDiff')?.patch.includes('rename from old.txt'),
      );
    });
  });

  test('keeps a rename in a commit diff that leaves a large file out', async () => {
    const renamed = await tempRepository(path.join(folder, 'renamed-large'));
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    await renamed.commit('old', { 'old.txt': lines.join('\n') });
    await renamed.git('mv', 'old.txt', 'new.txt');
    fs.writeFileSync(
      path.join(renamed.root, 'large.txt'),
      numberedLines('large'),
    );
    await renamed.git('add', 'large.txt');
    await renamed.git('commit', '-m', 'rename');
    const [hash] = await renamed.resolve('HEAD');
    await withView(log, [renamed.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: renamed.root,
        hash,
      });
      const patch = view.page.last('diff')?.patch ?? '';
      assert.ok(patch.includes('rename from old.txt'), patch);
      assert.ok(!patch.includes('large.txt'), patch);
    });
  });

  suite('with a file no commit changed since', () => {
    let files: TempRepository;
    let kept: string;
    let changed: string;

    suiteSetup(async () => {
      files = await tempRepository(path.join(folder, 'files'));
      await files.commit('kept', { 'kept.txt': 'kept\n' });
      await files.commit('changed', { 'changed.txt': 'changed\n' });
      [kept, changed] = await files.resolve('HEAD~1', 'HEAD');
    });

    test('shows a file the commit did not change whole, until another commit is selected', async () => {
      await withView(log, [files.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: files.root,
          hash: changed,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: files.root,
          hash: changed,
          path: 'kept.txt',
        });
        const content = view.page.last('fileContent');
        assert.strictEqual(content?.path, 'kept.txt');
        assert.strictEqual(content.content, 'kept\n');
        assert.strictEqual(content.binary, false);

        await view.connection.receive({
          type: 'selectCommit',
          root: files.root,
          hash: kept,
        });
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        const shown = view.page.messages.findLast(
          (message) =>
            message.type === 'diff' || message.type === 'fileContent',
        );
        assert.strictEqual(shown?.type, 'diff');
        assert.strictEqual(shown.hash, kept);
      });
    });

    test('sends no unchanged Files tree or whole file on a refresh', async () => {
      const draft = path.join(files.root, 'draft.txt');
      const added = path.join(files.root, 'new.txt');
      fs.writeFileSync(draft, 'draft\n');
      try {
        await withView(
          log,
          [files.root],
          async (view) => {
            await view.connection.receive({
              type: 'selectCommit',
              root: files.root,
              hash: workingTreeHash,
            });
            await view.connection.receive({
              type: 'loadTree',
              root: files.root,
              hash: workingTreeHash,
            });
            await view.connection.receive({
              type: 'selectFile',
              root: files.root,
              hash: workingTreeHash,
              path: 'kept.txt',
              area: 'unstaged',
            });
            assert.strictEqual(
              view.page.last('fileContent')?.content,
              'kept\n',
            );
            view.page.clear();
            await view.connection.refresh();
            assert.ok(view.page.last('workingTree'));
            assert.strictEqual(view.page.last('tree'), undefined);
            assert.strictEqual(view.page.last('fileContent'), undefined);

            fs.writeFileSync(added, 'new\n');
            await view.connection.refresh();
            assert.ok(view.page.last('tree')?.paths.includes('new.txt'));
          },
          'unwatched',
        );
      } finally {
        fs.rmSync(draft, { force: true });
        fs.rmSync(added, { force: true });
      }
    });
  });
});
