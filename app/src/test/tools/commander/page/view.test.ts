import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  emptyView,
  reduceView,
  viewerChoices,
  type CommanderView,
  type ViewAction,
} from '../../../../tools/commander/page/view';
import type { Entry } from '../../../../tools/commander/shared/protocol';
import { flatRowOf, parentRow } from '../../../../tools/commander/page/listing';
import {
  defaultLayouts,
  type FileColor,
} from '../../../../tools/commander/shared/settings';

const entry = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
  ...extra,
});

const listing = (
  folder: string,
  entries: readonly Entry[],
  extra: Partial<Extract<ViewAction, { type: 'listing' }>> = {},
): ViewAction => ({
  type: 'listing',
  tab: '1',
  side: 'left',
  folder,
  entries,
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  hidden: [],
  selected: undefined,
  ...extra,
});

const run = (...actions: ViewAction[]): CommanderView =>
  actions.reduce(reduceView, emptyView);

const shown = (view: CommanderView) => ({
  rows: view.panes.left?.rows.map((row) => row.key),
  selected: view.panes.left?.selected,
});

const colors = { light: '#000', dark: '#fff' };

const sortedBy = (
  left: 'name' | 'size',
  showHidden = true,
  {
    groupByColor = false,
    fileColors = [],
    bookmarks = [],
  }: {
    readonly groupByColor?: boolean;
    readonly fileColors?: readonly FileColor[];
    readonly bookmarks?: readonly string[];
  } = {},
): ViewAction => ({
  type: 'settings',
  showHidden,
  sort: {
    left: { column: left, descending: false, groupByColor },
    right: { column: 'extension', descending: false, groupByColor: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors,
  bookmarks,
});

const folderEntry = (name: string) => entry(name, { folder: true });

const repositoriesShown = (view: CommanderView) =>
  view.panes.left?.rows.filter((row) => row.repository).map((row) => row.key);

const inRepository = (view: CommanderView) =>
  view.panes.left?.inRepository ?? false;

const named = (
  names: readonly string[],
  extra: Partial<Extract<ViewAction, { type: 'repositories' }>> = {},
): ViewAction => ({
  type: 'repositories',
  tab: '1',
  side: 'left',
  folder: '/code',
  names,
  ...extra,
});

suite('Commander view', () => {
  test('marks the folders that are repositories without sorting the rows again, and leaves a side alone when they are the ones it marks already', () => {
    const listed = run(
      { type: 'show', tab: '1' },
      listing('/code', [
        folderEntry('app'),
        folderEntry('docs'),
        entry('a.txt'),
      ]),
    );
    const before = listed.panes.left?.rows ?? [];
    const marked = reduceView(listed, named(['app']));
    assert.deepStrictEqual(repositoriesShown(marked), ['app']);
    const after = marked.panes.left?.rows ?? [];
    assert.deepStrictEqual(
      after.map((row, index) => row === before[index]),
      before.map((row) => row.key !== 'app'),
    );
    assert.strictEqual(reduceView(marked, named(['app'])), marked);
    assert.strictEqual(reduceView(listed, named([])), listed);
  });

  test('keeps the rows of a folder listed again unchanged, and those of its files unchanged when others come, go or change, as each listing sorted the whole folder again', () => {
    const files = [
      folderEntry('src'),
      entry('a.txt'),
      entry('b.md'),
      entry('c.txt'),
    ];
    const listed = run({ type: 'show', tab: '1' }, listing('/work', files));
    const before = listed.panes.left?.rows ?? [];

    const again = reduceView(
      listed,
      listing(
        '/work',
        files.map((each) => ({ ...each })),
      ),
    );
    const changed = reduceView(
      listed,
      listing('/work', [
        entry('c.txt'),
        entry('a.txt', { size: 9 }),
        folderEntry('src'),
        entry('0.md'),
      ]),
    );

    assert.strictEqual(again.panes.left?.rows, before);
    const after = changed.panes.left?.rows ?? [];
    assert.deepStrictEqual(
      after.map((row) => row.key),
      ['..', 'src', '0.md', 'a.txt', 'c.txt'],
    );
    assert.deepStrictEqual(
      after.map((row) => before.includes(row)),
      [true, true, false, false, true],
    );
    assert.strictEqual(after[3]?.entry?.size, 9);
  });

  test('selects the first row of a folder listed, and keeps it selected when the folder is listed again', () => {
    const files = [entry('a.txt'), entry('b.txt')];
    const view = run(
      { type: 'show', tab: '1' },
      listing('/work', files),
      { type: 'select', side: 'left', key: 'b.txt' },
      listing('/work', [entry('new.txt'), ...files]),
    );

    assert.deepStrictEqual(shown(view), {
      rows: ['..', 'a.txt', 'b.txt', 'new.txt'],
      selected: 'b.txt',
    });
  });

  test('takes listings for the tab shown only, starting over for another tab', () => {
    const view = run(
      { type: 'show', tab: '1' },
      listing('/work', [entry('a.txt')]),
      listing('/other', [entry('b.txt')], { tab: '2' }),
    );
    assert.deepStrictEqual(shown(view).rows, ['..', 'a.txt']);
    assert.strictEqual(
      reduceView(view, { type: 'show', tab: '2' }).panes.left,
      undefined,
    );
    assert.strictEqual(reduceView(view, { type: 'show', tab: '1' }), view);
  });

  test('hides and shows the hidden files, selecting the row in place of a selected one hidden', () => {
    const view = run(
      { type: 'show', tab: '1' },
      listing('/work', [
        entry('a.txt'),
        entry('cache.tmp', { hidden: true }),
        entry('z.txt'),
      ]),
      { type: 'select', side: 'left', key: 'cache.tmp' },
      {
        type: 'settings',
        showHidden: false,
        sort: {
          left: { column: 'extension', descending: false, groupByColor: false },
          right: {
            column: 'extension',
            descending: false,
            groupByColor: false,
          },
        },
        columns: { extension: 4, size: 15, date: 10 },
        defaultColumns: { extension: 10, size: 15, date: 16 },
        canElevate: false,
        platform: 'win32',
        thumbnailSize: 144,
        fileColors: [],
        bookmarks: [],
      },
    );

    assert.deepStrictEqual(shown(view), {
      rows: ['..', 'a.txt', 'z.txt'],
      selected: 'a.txt',
    });
  });

  test('sorts a side by a column, keeping the row selected', () => {
    const view = run(
      { type: 'show', tab: '1' },
      listing('/work', [
        entry('b.txt', { size: 1 }),
        entry('a.zip', { size: 2 }),
      ]),
      { type: 'select', side: 'left', key: 'a.zip' },
      {
        type: 'sort',
        side: 'left',
        sort: { column: 'size', descending: false, groupByColor: false },
      },
      {
        type: 'sort',
        side: 'left',
        sort: { column: 'size', descending: true, groupByColor: false },
      },
    );

    assert.deepStrictEqual(shown(view), {
      rows: ['..', 'a.zip', 'b.txt'],
      selected: 'a.zip',
    });
    assert.deepStrictEqual(view.panes.left?.sort, {
      column: 'size',
      descending: true,
      groupByColor: false,
    });
  });

  test('keeps the bookmarks the settings give, the same list while they give the same folders again, so the menus built from it are not built again for every change of the settings', () => {
    const bookmarks = ['C:\\Code', 'D:\\Work'];
    const view = run(sortedBy('name', true, { bookmarks }));
    assert.strictEqual(view.bookmarks, bookmarks);
    assert.strictEqual(
      reduceView(view, sortedBy('size', true, { bookmarks: [...bookmarks] }))
        .bookmarks,
      bookmarks,
    );
    assert.deepStrictEqual(
      reduceView(view, sortedBy('name', true, { bookmarks: ['C:\\Code'] }))
        .bookmarks,
      ['C:\\Code'],
    );
  });

  test('lists a side in the order the settings give it, and sorts it again when they change it', () => {
    const files = [entry('b.txt', { size: 1 }), entry('a.zip', { size: 2 })];
    const view = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/work', files),
    );
    assert.deepStrictEqual(shown(view).rows, ['..', 'a.zip', 'b.txt']);
    assert.deepStrictEqual(shown(reduceView(view, sortedBy('size'))).rows, [
      '..',
      'b.txt',
      'a.zip',
    ]);
  });

  test('shows a tab kept away in the order and with the hidden files the settings give once it is shown again, as the settings changed while it was away', () => {
    const files = [
      entry('b.txt', { size: 1 }),
      entry('a.zip', { size: 2 }),
      entry('cache.tmp', { hidden: true, size: 3 }),
    ];
    const view = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/work', files),
      { type: 'show', tab: '2' },
      sortedBy('size', false),
      { type: 'show', tab: '1' },
    );

    assert.deepStrictEqual(shown(view).rows, ['..', 'b.txt', 'a.zip']);
    assert.deepStrictEqual(view.panes.left?.sort, {
      column: 'size',
      descending: false,
      groupByColor: false,
    });
  });

  test('groups the files of a side by their colors once its sort asks to, and again in the new order of the groups once the settings change them', () => {
    const files = [entry('a.txt'), entry('b.exe'), entry('c.md')];
    const exeFirst = [
      { extensions: ['exe'], colors },
      { extensions: ['txt'], colors },
    ];
    const view = run(
      sortedBy('name', true, { fileColors: exeFirst }),
      { type: 'show', tab: '1' },
      listing('/work', files),
    );
    assert.deepStrictEqual(shown(view).rows, ['..', 'a.txt', 'b.exe', 'c.md']);

    const grouped = reduceView(
      view,
      sortedBy('name', true, { groupByColor: true, fileColors: exeFirst }),
    );
    assert.deepStrictEqual(shown(grouped).rows, [
      '..',
      'b.exe',
      'a.txt',
      'c.md',
    ]);
    assert.deepStrictEqual(
      shown(
        reduceView(
          grouped,
          sortedBy('name', true, {
            groupByColor: true,
            fileColors: exeFirst.toReversed(),
          }),
        ),
      ).rows,
      ['..', 'a.txt', 'b.exe', 'c.md'],
    );
  });

  test('views the file of a viewing tab instead of the sides, and stops once another tab or none is shown', () => {
    const viewing = run({ type: 'show', tab: '3', file: '/work/notes.txt' });
    assert.strictEqual(viewing.viewing, '/work/notes.txt');
    assert.strictEqual(
      reduceView(viewing, { type: 'show', tab: '1' }).viewing,
      undefined,
    );
    assert.strictEqual(
      reduceView(viewing, { type: 'hide' }).viewing,
      undefined,
    );
  });

  test('keeps the selected rows and the active side of a tab while another tab is shown, for when it is shown again', () => {
    const files = [entry('a.txt'), entry('b.txt')];
    let view = run(
      { type: 'show', tab: '1' },
      listing('/work', files),
      { type: 'select', side: 'left', key: 'b.txt' },
      { type: 'activate', side: 'left' },
      { type: 'show', tab: '2' },
    );
    assert.strictEqual(view.panes.left, undefined);
    assert.strictEqual(view.active, 'right');

    view = reduceView(view, { type: 'show', tab: '3', file: '/work/a.txt' });
    view = reduceView(view, { type: 'hide' });
    view = reduceView(view, { type: 'show', tab: '1' });
    assert.strictEqual(view.active, 'left');
    assert.deepStrictEqual(shown(view).selected, 'b.txt');

    view = reduceView(view, listing('/work', files));
    assert.deepStrictEqual(shown(view).selected, 'b.txt');
  });

  test('shows the sides of each tab as details until that tab shows one as thumbnails, keeping the layouts of a tab while another is shown', () => {
    let view = run(
      { type: 'show', tab: '1' },
      { type: 'layout', side: 'right', layout: 'thumbnails' },
    );
    assert.deepStrictEqual(view.layouts, {
      left: 'details',
      right: 'thumbnails',
    });

    view = reduceView(view, { type: 'show', tab: '2' });
    assert.deepStrictEqual(view.layouts, defaultLayouts);
    view = reduceView(view, {
      type: 'layout',
      side: 'left',
      layout: 'thumbnails',
    });
    view = reduceView(view, { type: 'hide' });
    view = reduceView(view, { type: 'show', tab: '1' });
    assert.deepStrictEqual(view.layouts, {
      left: 'details',
      right: 'thumbnails',
    });
    view = reduceView(view, { type: 'show', tab: '2' });
    assert.deepStrictEqual(view.layouts, {
      left: 'thumbnails',
      right: 'details',
    });
    assert.deepStrictEqual(
      reduceView(view, { type: 'show', tab: '3' }).layouts,
      defaultLayouts,
    );
  });

  test('keeps what a viewing tab was chosen to show a file as, its encoding and its language one by one, each choice keeping the others', () => {
    let view = run({ type: 'show', tab: '3', file: '/work/notes.md' });
    view = reduceView(view, { type: 'choose', choices: { mode: 'text' } });
    view = reduceView(view, {
      type: 'choose',
      choices: { language: 'python' },
    });
    assert.deepStrictEqual(viewerChoices(view), {
      mode: 'text',
      language: 'python',
    });
  });

  test('keeps what each viewing tab was chosen to show a file as, its encoding and its language while another tab is shown, for when it is shown again, and forgets them, and the layouts of a tab, once the tab is closed, as a tab opened later can take its id', () => {
    const chosen = {
      mode: 'text',
      encoding: 'windows-1252',
      language: 'python',
    } as const;
    let view = run({ type: 'show', tab: '3', file: '/work/notes.md' });
    assert.deepStrictEqual(viewerChoices(view), {});
    view = reduceView(view, { type: 'choose', choices: chosen });
    assert.deepStrictEqual(viewerChoices(view), chosen);

    view = reduceView(view, { type: 'show', tab: '4', file: '/work/a.md' });
    assert.deepStrictEqual(viewerChoices(view), {});
    view = reduceView(view, { type: 'hide' });
    view = reduceView(view, { type: 'show', tab: '3', file: '/work/notes.md' });
    assert.deepStrictEqual(viewerChoices(view), chosen);

    view = reduceView(view, { type: 'show', tab: '1' });
    view = reduceView(view, {
      type: 'layout',
      side: 'left',
      layout: 'thumbnails',
    });
    view = reduceView(view, { type: 'show', tab: '2' });
    view = reduceView(view, { type: 'closed', tab: '3' });
    view = reduceView(view, { type: 'closed', tab: '1' });
    view = reduceView(view, { type: 'show', tab: '3', file: '/work/b.md' });
    assert.deepStrictEqual(viewerChoices(view), {});
    view = reduceView(view, { type: 'show', tab: '1' });
    assert.deepStrictEqual(view.layouts, defaultLayouts);

    view = reduceView(view, { type: 'show', tab: '5', file: '/work/c.md' });
    view = reduceView(view, { type: 'choose', choices: chosen });
    view = reduceView(view, { type: 'closed', tab: '5' });
    view = reduceView(view, { type: 'show', tab: '1' });
    view = reduceView(view, {
      type: 'layout',
      side: 'right',
      layout: 'thumbnails',
    });
    view = reduceView(view, { type: 'closed', tab: '1' });
    view = reduceView(view, { type: 'hide' });
    view = reduceView(view, { type: 'show', tab: '5', file: '/work/d.md' });
    assert.deepStrictEqual(viewerChoices(view), {});
    view = reduceView(view, { type: 'show', tab: '1' });
    assert.deepStrictEqual(view.layouts, defaultLayouts);
  });

  test('selects only rows there are', () => {
    const view = run(
      { type: 'show', tab: '1' },
      listing('/work', [entry('a.txt')]),
    );
    assert.strictEqual(
      reduceView(view, { type: 'select', side: 'left', key: 'gone.txt' }),
      view,
    );
  });

  test('moves between the sides, starting on the right, also for another tab', () => {
    const view = run({ type: 'show', tab: '1' });
    assert.strictEqual(view.active, 'right');
    assert.strictEqual(reduceView(view, { type: 'switchSide' }).active, 'left');
    const left = reduceView(view, { type: 'activate', side: 'left' });
    assert.strictEqual(left.active, 'left');
    assert.strictEqual(
      reduceView(left, { type: 'show', tab: '2' }).active,
      'right',
    );
  });

  test('marks files and folders, never the row of the parent folder, and unmarks them', () => {
    const markedTwo = run(
      { type: 'show', tab: '1' },
      listing('/a', [
        entry('one.txt'),
        entry('two.txt'),
        entry('sub', { folder: true }),
      ]),
      {
        type: 'mark',
        side: 'left',
        keys: ['..', 'one.txt', 'sub'],
        marked: true,
      },
    );
    assert.deepStrictEqual(
      [...(markedTwo.panes.left?.marked ?? [])].toSorted(),
      ['one.txt', 'sub'],
    );

    const unmarked = reduceView(markedTwo, {
      type: 'mark',
      side: 'left',
      keys: ['sub'],
      marked: false,
    });
    assert.deepStrictEqual(
      [...(unmarked.panes.left?.marked ?? [])],
      ['one.txt'],
    );
  });

  test('keeps the marks of the files still there when the folder is read again, and drops them all in another folder', () => {
    const marked = run(
      { type: 'show', tab: '1' },
      listing('/a', [entry('one.txt'), entry('two.txt')]),
      {
        type: 'mark',
        side: 'left',
        keys: ['one.txt', 'two.txt'],
        marked: true,
      },
    );
    const again = reduceView(marked, listing('/a', [entry('two.txt')]));
    assert.deepStrictEqual([...(again.panes.left?.marked ?? [])], ['two.txt']);

    const elsewhere = reduceView(again, listing('/b', [entry('two.txt')]));
    assert.strictEqual(elsewhere.panes.left?.marked.size, 0);
  });

  test('marks the repositories named for the folder of a side, keeping its order and selection, and none named for another folder or tab', () => {
    const listed = run(
      { type: 'show', tab: '1' },
      listing('/code', [folderEntry('app'), folderEntry('docs')], {
        selected: 'docs',
      }),
    );

    const found = reduceView(listed, named(['app']));
    assert.deepStrictEqual(shown(found), {
      rows: ['..', 'app', 'docs'],
      selected: 'docs',
    });
    assert.deepStrictEqual(repositoriesShown(found), ['app']);

    assert.strictEqual(
      reduceView(listed, named(['app'], { folder: '/other' })),
      listed,
    );
    assert.strictEqual(
      reduceView(listed, named(['app'], { tab: '2' })),
      listed,
    );
  });

  test('keeps the repositories still listed when the folder is read again, until they are named again, and none in another folder', () => {
    const found = run(
      { type: 'show', tab: '1' },
      listing('/code', [folderEntry('app'), folderEntry('docs')]),
      {
        type: 'repositories',
        tab: '1',
        side: 'left',
        folder: '/code',
        names: ['app', 'docs'],
      },
    );

    const again = reduceView(found, listing('/code', [folderEntry('app')]));
    assert.deepStrictEqual(repositoriesShown(again), ['app']);

    const elsewhere = reduceView(
      again,
      listing('/other', [folderEntry('app')]),
    );
    assert.deepStrictEqual(repositoriesShown(elsewhere), []);
  });

  test('knows the folder of a side is in a repository once told, while it is read again, until told otherwise or it shows another folder', () => {
    const listed = run(
      { type: 'show', tab: '1' },
      listing('/code', [folderEntry('src')]),
    );
    assert.strictEqual(inRepository(listed), false);

    const inside = reduceView(listed, named([], { inRepository: true }));
    assert.strictEqual(inRepository(inside), true);
    assert.strictEqual(
      reduceView(inside, named([], { inRepository: true })),
      inside,
    );
    assert.strictEqual(
      reduceView(listed, named([], { inRepository: true, folder: '/other' })),
      listed,
    );

    const again = reduceView(
      inside,
      listing('/code', [folderEntry('src'), folderEntry('lib')]),
    );
    assert.strictEqual(inRepository(again), true);
    assert.strictEqual(inRepository(reduceView(again, named([]))), false);
    assert.strictEqual(
      inRepository(reduceView(inside, listing('/other', []))),
      false,
    );
  });
});

const reading = { reading: true, stopped: false, folders: 0, failed: 0 };

const flatRows = (
  keys: readonly string[],
  extra: Partial<Extract<ViewAction, { type: 'flatRows' }>> = {},
): ViewAction => ({
  type: 'flatRows',
  tab: '1',
  side: 'left',
  walk: 1,
  rows: [parentRow, ...keys.map(rowNamed)],
  shown: undefined,
  complete: true,
  ...extra,
});

const rowNamed = (key: string) => {
  const at = key.lastIndexOf('/') + 1;
  return flatRowOf(entry(key.slice(at)), key.slice(0, at));
};

const flat = (...actions: ViewAction[]) =>
  run({ type: 'show', tab: '1' }, listing('/a', [], { flat: 1 }), ...actions);

const binOffAfter = (...actions: ViewAction[]) =>
  run({ type: 'show', tab: '1' }, ...actions).panes.left?.binOff;

suite('The view of a flat side', () => {
  test('starts with the row of the parent alone, reading, until the rows of its files come', () => {
    const view = flat();

    assert.deepStrictEqual(shown(view), { rows: ['..'], selected: '..' });
    assert.deepStrictEqual(view.panes.left?.flat, {
      walk: 1,
      progress: reading,
      shown: undefined,
    });
  });

  test('keeps whether the Recycle Bin of its folder is turned off, as a side not flat does, so Delete in it says it deletes permanently', () => {
    const off = listing('D:\\', [], { binOff: true });
    const flatOff = listing('D:\\', [], { binOff: true, flat: 1 });

    assert.strictEqual(binOffAfter(off), true);
    assert.strictEqual(binOffAfter(off, listing('C:\\', [])), undefined);
    assert.strictEqual(binOffAfter(flatOff), true);
    assert.strictEqual(binOffAfter(flatOff, flatOff), true);
    assert.strictEqual(flat().panes.left?.binOff, undefined);
  });

  test('takes the rows of its files, keeping the row selected', () => {
    const view = flat(
      flatRows(['b.txt', 'sub/a.txt']),
      { type: 'select', side: 'left', key: 'sub/a.txt' },
      flatRows(['a.txt', 'b.txt', 'sub/a.txt']),
    );

    assert.deepStrictEqual(shown(view), {
      rows: ['..', 'a.txt', 'b.txt', 'sub/a.txt'],
      selected: 'sub/a.txt',
    });
  });

  test('keeps the marks of the files still there once their rows come again', () => {
    const view = flat(flatRows(['a.txt', 'sub/b.txt', 'sub/c.txt']), {
      type: 'mark',
      side: 'left',
      keys: ['sub/b.txt', 'sub/c.txt'],
      marked: true,
    });

    const again = reduceView(view, flatRows(['a.txt', 'sub/c.txt']));

    assert.deepStrictEqual(
      [...(again.panes.left?.marked ?? [])],
      ['sub/c.txt'],
    );
  });

  test('selects the first file the filter shows once the one selected is not among them', () => {
    const view = flat(flatRows(['a.txt', 'cat.jpg', 'sub/cat.png']), {
      type: 'select',
      side: 'left',
      key: 'a.txt',
    });

    const filtered = reduceView(
      view,
      flatRows(['a.txt', 'cat.jpg', 'sub/cat.png'], {
        shown: {
          query: 'cat',
          rows: [parentRow, rowNamed('cat.jpg'), rowNamed('sub/cat.png')],
        },
      }),
    );

    assert.strictEqual(filtered.panes.left?.selected, 'cat.jpg');
    assert.deepStrictEqual(
      filtered.panes.left?.flat?.shown?.rows.map((row) => row.key),
      ['..', 'cat.jpg', 'sub/cat.png'],
    );
  });

  test('keeps its rows when its folder is listed again in the same walk, and starts over for another walk or a listing that is not flat', () => {
    const view = flat(flatRows(['a.txt']));

    const again = reduceView(view, listing('/a', [], { flat: 1 }));
    assert.deepStrictEqual(shown(again).rows, ['..', 'a.txt']);

    const walked = reduceView(again, listing('/a', [], { flat: 2 }));
    assert.deepStrictEqual(shown(walked).rows, ['..']);
    assert.strictEqual(walked.panes.left?.flat?.walk, 2);

    const plain = reduceView(walked, listing('/a', [entry('z.txt')]));
    assert.deepStrictEqual(shown(plain).rows, ['..', 'z.txt']);
    assert.strictEqual(plain.panes.left?.flat, undefined);
  });

  test('keeps the file selected before it selected once its row comes, and selects the parent for a folder selected before', () => {
    const fromFile = run(
      { type: 'show', tab: '1' },
      listing('/a', [entry('sub', { folder: true }), entry('b.txt')]),
      { type: 'select', side: 'left', key: 'b.txt' },
      listing('/a', [], { flat: 1 }),
    );
    assert.strictEqual(fromFile.panes.left?.selected, 'b.txt');
    const came = reduceView(fromFile, flatRows(['b.txt', 'sub/a.txt']));
    assert.strictEqual(came.panes.left?.selected, 'b.txt');

    const fromFolder = run(
      { type: 'show', tab: '1' },
      listing('/a', [entry('sub', { folder: true }), entry('b.txt')]),
      { type: 'select', side: 'left', key: 'sub' },
      listing('/a', [], { flat: 1 }),
      flatRows(['b.txt', 'sub/a.txt']),
    );
    assert.strictEqual(fromFolder.panes.left?.selected, '..');
  });

  test('keeps the file selected before it selected while the rows that came lack it but not yet every file told, even once the reading ended, and the first row once they hold every file told and it is gone', () => {
    const done = { reading: false, stopped: false, folders: 2, failed: 0 };
    const behind = run(
      { type: 'show', tab: '1' },
      listing('/a', [entry('sub', { folder: true }), entry('b.txt')]),
      { type: 'select', side: 'left', key: 'b.txt' },
      listing('/a', [], { flat: 1 }),
      { type: 'flatProgress', tab: '1', side: 'left', walk: 1, progress: done },
      flatRows(['sub/a.txt'], { complete: false }),
    );
    assert.strictEqual(behind.panes.left?.selected, 'b.txt');
    assert.strictEqual(
      reduceView(behind, flatRows(['b.txt', 'sub/a.txt'])).panes.left?.selected,
      'b.txt',
    );
    assert.strictEqual(
      reduceView(behind, flatRows(['sub/a.txt'])).panes.left?.selected,
      '..',
    );
  });

  test('selects the folder under its own that the file selected is in once it is listed alone again', () => {
    const view = flat(flatRows(['b.txt', 'sub/deeper/a.txt']), {
      type: 'select',
      side: 'left',
      key: 'sub/deeper/a.txt',
    });

    const plain = reduceView(
      view,
      listing('/a', [entry('sub', { folder: true }), entry('b.txt')]),
    );

    assert.strictEqual(plain.panes.left?.selected, 'sub');
  });

  test('takes the progress of its walk, and nothing of another walk, side or tab', () => {
    const progress = { reading: false, stopped: true, folders: 3, failed: 1 };
    const view = flat(
      { type: 'flatProgress', tab: '1', side: 'left', walk: 1, progress },
      {
        type: 'flatProgress',
        tab: '1',
        side: 'left',
        walk: 2,
        progress: reading,
      },
      flatRows(['late.txt'], { walk: 2 }),
      flatRows(['other.txt'], { side: 'right' }),
      flatRows(['away.txt'], { tab: '2' }),
    );

    assert.deepStrictEqual(view.panes.left?.flat?.progress, progress);
    assert.deepStrictEqual(shown(view).rows, ['..']);
  });

  test('leaves its rows to the worker when the sort, the hidden files or the colors change, keeping the sort the worker is to use', () => {
    const view = flat(flatRows(['b.txt', 'a.txt']));

    const sorted = reduceView(view, {
      type: 'sort',
      side: 'left',
      sort: { column: 'size', descending: true, groupByColor: false },
    });
    const settled = reduceView(sorted, sortedBy('name', false));
    const away = reduceView(reduceView(settled, { type: 'show', tab: '2' }), {
      type: 'show',
      tab: '1',
    });

    assert.deepStrictEqual(shown(sorted).rows, ['..', 'b.txt', 'a.txt']);
    assert.strictEqual(sorted.panes.left?.sort.column, 'size');
    assert.deepStrictEqual(shown(settled).rows, ['..', 'b.txt', 'a.txt']);
    assert.strictEqual(settled.panes.left?.sort.column, 'name');
    assert.deepStrictEqual(shown(away).rows, ['..', 'b.txt', 'a.txt']);
  });
});
