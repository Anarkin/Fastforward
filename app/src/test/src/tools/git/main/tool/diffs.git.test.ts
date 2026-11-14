import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../../helpers/builtins';
import { tabsKey } from '../../../../../../shell/main/storage';
import { plainOf, strings } from '../../../../../../lib/shared/strings';
import type { ToHost } from '../../../../../../shell/shared/protocol';
import { waitFor } from '../../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import {
  closeViews,
  FakeHost,
  failOnErrorsLogged,
  gate,
  stubMethod,
  withView,
  tabOf,
  shownTabs,
} from '../../../../../helpers/harness';
import { fortyLines } from '../../../../../helpers/gitFixtures';

const forged = (json: string): ToHost => JSON.parse(json);

suite('Git tool showing diffs', () => {
  let folder: string;
  let other: string;
  let long: TempRepository;
  let second: string;
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
    [second] = await long.resolve('HEAD');
    spaced = await tempRepository(path.join(folder, 'spaced'));
    await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
    await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
    [indent] = await spaced.resolve('HEAD');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('stops reading the patch of every file of a commit once a file of it is selected', async () => {
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let reading: ReturnType<typeof spawn> | undefined;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (
          args.includes('--patch') &&
          args.at(-1) === '--' &&
          reading === undefined
        ) {
          reading = spawn(
            process.execPath,
            ['-e', 'setTimeout(() => {}, 30000)'],
            options,
          );
          return reading;
        }
        return spawn(command, args, options);
      },
    );
    try {
      await withView(log, [long.root, other], async (view) => {
        const selected = view.connection.receive({
          type: 'selectCommit',
          root: long.root,
          hash: second,
        });
        await waitFor(() => reading !== undefined, 'the patch to be read');
        await view.connection.receive({
          type: 'selectFile',
          root: long.root,
          hash: second,
          path: 'a.txt',
        });
        await waitFor(
          () => reading?.exitCode !== null || reading.signalCode !== null,
          'the read to stop',
        );
        await selected;
      });
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('opens a file of a diff in a viewer tab of its own, from the working tree where it is and from a commit as a copy of its blob, and says why not for a file it can not open', async () => {
    const blob = (await long.git('rev-parse', 'HEAD~1:a.txt')).trim();
    const viewing = async (file: string, fromBlob?: string) => {
      let seen = { viewers: [] as string[], notices: [] as string[] };
      await withView(log, [long.root, other], async (view) => {
        await view.connection.receive({
          type: 'viewFile',
          root: long.root,
          path: file,
          ...(fromBlob === undefined ? {} : { blob: fromBlob }),
        });
        const tabs = view.store.get(tabsKey);
        seen = {
          viewers: Array.isArray(tabs)
            ? tabs.flatMap((tab: unknown) =>
                typeof tab === 'object' &&
                tab !== null &&
                'view' in tab &&
                tab.view === true &&
                'root' in tab &&
                typeof tab.root === 'string'
                  ? [tab.root]
                  : [],
              )
            : [],
          notices: view.page.messages.flatMap((message) =>
            message.type === 'notice' ? [plainOf(message.message)] : [],
          ),
        };
      });
      return seen;
    };

    assert.deepStrictEqual((await viewing('a.txt')).viewers, [
      path.join(long.root, 'a.txt'),
    ]);
    const copy = path.join(new FakeHost().viewedFiles, blob, 'a.txt');
    assert.deepStrictEqual((await viewing('a.txt', blob)).viewers, [copy]);
    assert.strictEqual(fs.readFileSync(copy, 'utf8'), fortyLines(-1));
    assert.deepStrictEqual(await viewing('../outside.txt'), {
      viewers: [],
      notices: [
        plainOf(
          strings.diff.couldNotView(
            '../outside.txt',
            strings.errors.outsideRepository('../outside.txt'),
          ),
        ),
      ],
    });
    assert.deepStrictEqual(await viewing('gone.txt'), {
      viewers: [],
      notices: [plainOf(strings.diff.viewMissing('gone.txt'))],
    });
  });

  test('shows the file selected entire while the entire file is on, as by default, and in hunks once off, remembering the choice for every file and tab', async () => {
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
      assert.strictEqual(view.page.last('layout')?.showEntireFile, true);
      await view.connection.receive({
        type: 'selectCommit',
        root: long.root,
        hash: second,
      });
      await select('a.txt');
      assert.strictEqual(entire(), true);
      await select('b.txt');
      assert.strictEqual(entire(), true);

      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      assert.strictEqual(entire(), false);
      assert.strictEqual(
        view.settings.settings.tools.git.showEntireFile,
        false,
      );
      await select('a.txt');
      assert.strictEqual(entire(), false);
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, other),
      });
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, long.root),
      });
      assert.strictEqual(entire(), false);
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.showEntireFile, false);

      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      assert.strictEqual(entire(), true);
      assert.strictEqual(view.settings.settings.tools.git.showEntireFile, true);
      await view.connection.receive(
        forged('{ "type": "setShowEntireFile", "show": "yes" }'),
      );
      assert.strictEqual(view.settings.settings.tools.git.showEntireFile, true);
    });
  });

  test('keeps a file entire when another tab is closed', async () => {
    await withView(log, [other, long.root], async (view) => {
      const entire = () =>
        /^ line 1$/m.test(view.page.last('diff')?.patch ?? '');
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, long.root),
      });
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
      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      assert.strictEqual(entire(), true);
      await view.connection.receive({
        type: 'closeTab',
        tab: tabOf(view.page, other),
      });
      assert.strictEqual(shownTabs(view.page)?.active, long.root);
      assert.strictEqual(entire(), true);
    });
  });

  test('keeps a tab as it is when it is clicked while active', async () => {
    await withView(log, [long.root, other], async (view) => {
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
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
      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      view.page.clear();
      await view.connection.receive({
        type: 'selectTab',
        tab: tabOf(view.page, long.root),
      });
      assert.strictEqual(view.page.last('commits'), undefined);
      assert.strictEqual(view.page.last('diff'), undefined);
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
      const diff = view.page.last('diff');
      assert.strictEqual(diff?.path, 'a.txt');
      assert.match(diff.patch, /^\+changed$/m);
      assert.doesNotMatch(diff.patch, /^ line 1$/m);
    });
  });

  test('shows the diff of the last entire file choice when an earlier one answers last', async () => {
    await withView(log, [long.root], async (view) => {
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
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
      for (const name of ['patchOf', 'budgetedPatch']) {
        stubMethod(view.view, name, async (original, ...args) => {
          if (
            args.some(
              (scope) =>
                typeof scope === 'object' &&
                scope !== null &&
                'entireFile' in scope &&
                scope.entireFile === true,
            )
          ) {
            waiting = true;
            await held.opened;
          }
          return original(...args);
        });
      }
      const shown = view.connection.receive({
        type: 'setShowEntireFile',
        show: true,
      });
      await waitFor(() => waiting, 'the entire file');
      await view.connection.receive({ type: 'setShowEntireFile', show: false });
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
      assert.strictEqual(
        view.settings.settings.tools.git.ignoreWhitespace,
        false,
      );
      await view.connection.receive({ type: 'ready' });
      assert.strictEqual(view.page.last('layout')?.ignoreWhitespace, false);
    });
  });
});
