import * as assert from 'node:assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { soloKey } from '../../../../../tools/git/main/storage';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  gitState,
  openView,
  type OpenView,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool checking what the page sends', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];
  let opened: OpenView;
  let root: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
    root = repository.root;
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  beforeEach(async () => {
    opened = await openView(log, [repository.root]);
  });

  afterEach(async () => {
    opened.connection.dispose();
    await opened.view.idle();
  });

  const untrusted = (message: unknown): Promise<void> =>
    Reflect.apply(
      Reflect.get(opened.connection, 'receive'),
      opened.connection,
      [{ type: 'tool', tool: 'git', message }],
    );

  const sentAfter = async (
    send: () => Promise<void>,
  ): Promise<readonly string[]> => {
    await opened.view.idle();
    opened.page.clear();
    await send();
    await opened.view.idle();
    return opened.page.messages.map((message) => message.type);
  };

  const selectMerge = () =>
    opened.connection.receive({
      type: 'selectCommit',
      root,
      hash: fixture.merge,
    });

  test('leaves alone a file asked for with a NUL or a line break in its path, as either would add a request to the git kept reading objects', async () => {
    await selectMerge();
    const sent = await sentAfter(async () => {
      for (const path of ['a\0b', 'a\nb', 5]) {
        await untrusted({
          type: 'selectFile',
          root,
          hash: fixture.merge,
          path,
        });
        await untrusted({
          type: 'loadFileDiff',
          root,
          hash: fixture.merge,
          path,
          diff: 1,
        });
        await untrusted({
          type: 'loadTexts',
          root,
          hash: fixture.merge,
          diff: 1,
          texts: [{ path, side: 'new', blob: '' }],
        });
        await untrusted({ type: 'viewFile', root, path });
      }
      await untrusted({
        type: 'selectFile',
        root,
        hash: fixture.merge,
        path: undefined,
        area: 'elsewhere',
      });
    });
    assert.deepStrictEqual(sent, []);
    assert.deepStrictEqual(
      await sentAfter(() =>
        untrusted({
          type: 'selectFile',
          root,
          hash: fixture.merge,
          path: undefined,
        }),
      ),
      ['diff'],
    );
  });

  test('keeps the place scrolled to only as a hash and two numbers, as a hash of another kind failed each later layout of the history', async () => {
    const bookmark = (bookmarks: readonly string[]) =>
      opened.connection.receive({
        type: 'setBookmarks',
        root,
        bookmarks: bookmarks.map((name) => ({ kind: 'commit', name })),
      });
    await untrusted({ type: 'scrolled', root, hash: 1, offset: 0, report: 0 });
    await bookmark([fixture.a]);
    assert.strictEqual(opened.page.last('error'), undefined);

    await untrusted({
      type: 'scrolled',
      root,
      hash: fixture.b,
      offset: 7,
      report: 3,
    });
    await untrusted({
      type: 'scrolled',
      root,
      hash: fixture.b,
      offset: 'x',
      report: Number.NaN,
    });
    await bookmark([]);
    const target = opened.page.last('commits')?.scrollTarget;
    assert.deepStrictEqual([target?.offset, target?.report], [7, 3]);
  });

  test('reads a page of commits only from a row of the history, at most four pages at once, as any count sent every hash to git', async () => {
    const shown = opened.page.last('commits');
    assert.ok(shown);
    const { generation, total } = shown;
    const sent = await sentAfter(async () => {
      for (const [start, count] of [
        [0, 1e9],
        [0, 401],
        [0, 0],
        [0, 1.5],
        [-1, 1],
        [0.5, 1],
        [total, 1],
        [Number.NaN, 1],
      ]) {
        await untrusted({
          type: 'loadCommits',
          root,
          generation,
          start,
          count,
        });
      }
    });
    assert.deepStrictEqual(sent, []);
    await opened.connection.receive({
      type: 'loadCommits',
      root,
      generation,
      start: total - 1,
      count: 400,
    });
    assert.deepStrictEqual(opened.page.last('commitPage')?.commits.length, 1);
  });

  test('turns solo, collapsed merges, ignored whitespace and fetching in the background on or off only for true or false', async () => {
    await opened.settings.setIn('git', 'autoFetch', true);
    await selectMerge();
    const sent = await sentAfter(async () => {
      await untrusted({ type: 'setSolo', root, solo: 'yes' });
      await untrusted({ type: 'setCollapseMerges', collapse: 'yes' });
      await untrusted({ type: 'setIgnoreWhitespace', ignore: 'yes' });
      await untrusted({ type: 'setAutoFetch', on: 'yes' });
      await untrusted({ type: 'setShowAllFiles', show: 'yes' });
      await untrusted({ type: 'setDiffLayout', layout: 'sideways' });
    });
    assert.deepStrictEqual(sent, []);
    assert.strictEqual(gitState(opened.store).get(soloKey), undefined);
  });

  test('searches the commits and looks up hashes only for text', async () => {
    const sent = await sentAfter(async () => {
      await untrusted({ type: 'searchCommits', root, query: 5 });
      await untrusted({ type: 'lookupHash', root, query: ['a'] });
    });
    assert.deepStrictEqual(sent, []);
  });

  test('steps back or forward only by a whole number of steps up to a hundred, as a step not a number went to the first commit visited and forgot the others', async () => {
    for (const hash of [fixture.a, fixture.b, fixture.merge]) {
      await opened.connection.receive({ type: 'selectCommit', root, hash });
    }
    for (const [direction, steps] of [
      ['back', Number.NaN],
      ['back', 0],
      ['back', 101],
      ['back', 1.5],
      ['sideways', 1],
    ]) {
      await untrusted({ type: 'navigate', root, direction, steps });
    }
    await opened.connection.receive({
      type: 'navigate',
      root,
      direction: 'back',
      steps: 1,
    });
    assert.strictEqual(opened.page.last('files')?.hash, fixture.b);
  });

  test('expands or collapses only a merge of the history, as any other hash was kept and laid the history out again', async () => {
    const toggled = await sentAfter(async () => {
      for (const hash of [fixture.a, 'f'.repeat(40), 'merge', 5]) {
        await untrusted({ type: 'toggleMerge', root, hash });
      }
    });
    assert.deepStrictEqual(toggled, []);
    const merged = await sentAfter(() =>
      opened.connection.receive({
        type: 'toggleMerge',
        root,
        hash: fixture.merge,
      }),
    );
    assert.strictEqual(commitsSent(opened.page.messages), 1, String(merged));
  });

  test('reads the texts asked for only from a list of at most ten thousand, each a path, a side and a blob', async () => {
    await selectMerge();
    const asked = { path: 'x', side: 'new', blob: '' };
    const sent = await sentAfter(async () => {
      for (const texts of [
        'x',
        [asked, { ...asked, side: 'middle' }],
        [{ ...asked, blob: 5 }],
        [null],
        Array.from({ length: 10_001 }, (_, index) => ({
          ...asked,
          path: `x${index}`,
        })),
      ]) {
        await untrusted({
          type: 'loadTexts',
          root,
          hash: fixture.merge,
          diff: 1,
          texts,
        });
      }
      await untrusted({
        type: 'loadTexts',
        root,
        hash: fixture.merge,
        diff: 'x',
        texts: [asked],
      });
    });
    assert.deepStrictEqual(sent, []);
    await untrusted({
      type: 'loadTexts',
      root,
      hash: fixture.merge,
      diff: 1,
      texts: [asked, asked],
    });
    assert.deepStrictEqual(
      opened.page.last('texts')?.texts.map((text) => text.path),
      ['x'],
    );
  });

  test('leaves alone a message of a type it does not know, or with a field of the wrong type', async () => {
    const sent = await sentAfter(async () => {
      for (const message of [
        null,
        'fetch',
        { type: 'nonsense', root },
        { type: 'fetch', root: 5 },
        { type: 'openRepository', root: 5 },
        { type: 'forgetRecent', root: null },
        { type: 'selectWorktree', root: [] },
        { type: 'initInside', folder: 5 },
        { type: 'setColumnWidths', widths: 'x' },
        { type: 'setShowEntireFile', show: 'x' },
        { type: 'loadCompareTexts', requests: 'x' },
        { type: 'selectCommit', root, hash: 5 },
        { type: 'selectCommit', root, hash: fixture.a, selection: 'x' },
        { type: 'selectCommit', root, hash: fixture.a, replace: 'x' },
        { type: 'loadTree', root, hash: 5 },
        { type: 'jump', root, hash: 5 },
        { type: 'checkout', root, target: null },
        { type: 'checkout', root, target: { kind: 'remote-tag', name: 'x' } },
        { type: 'checkout', root, target: { kind: 'commit', hash: 5 } },
        { type: 'pushTag', root, name: 5 },
        { type: 'pullBranch', root, name: 5 },
        { type: 'pushBranch', root, name: 5 },
        { type: 'setBookmarks', root, bookmarks: 'x' },
        { type: 'viewFile', root, path: 'x', blob: 5 },
        { type: 'prefetchDiff', root, hash: 5 },
        { type: 'prefetchTexts', root, hash: fixture.a, texts: 'x' },
        { type: 'prefetchTexts', root, hash: 5, texts: [] },
      ]) {
        await untrusted(message);
      }
    });
    assert.deepStrictEqual(sent, []);
  });
});
