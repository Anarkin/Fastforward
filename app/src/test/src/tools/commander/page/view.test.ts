import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { reduceView } from '../../../../../tools/commander/page/view';
import {
  entry,
  listing,
  run,
  shown,
  colors,
  sortedBy,
  folderEntry,
  repositoriesShown,
  named,
} from './viewFixtures';

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

  test('closes brackets as they are typed in the editor once the settings say so, and stops once they no longer do', () => {
    const settings = sortedBy('name', true);
    assert.ok(settings.type === 'settings');
    const view = run(settings);
    assert.strictEqual(view.closeBrackets, false);
    const closing = reduceView(view, { ...settings, closeBrackets: true });
    assert.strictEqual(closing.closeBrackets, true);
    assert.strictEqual(
      reduceView(closing, sortedBy('name', true)).closeBrackets,
      false,
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
});
