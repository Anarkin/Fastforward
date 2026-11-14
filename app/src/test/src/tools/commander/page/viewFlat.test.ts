import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  reduceView,
  type ViewAction,
} from '../../../../../tools/commander/page/view';
import {
  flatRowOf,
  parentRow,
} from '../../../../../tools/commander/page/listing';
import {
  entry,
  listing,
  run,
  shown,
  sortedBy,
  folderEntry,
  sized,
} from './viewFixtures';

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

const archiveAfter = (...actions: ViewAction[]) =>
  run({ type: 'show', tab: '1' }, ...actions).panes.left?.archive;

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

  test('keeps the archive it is listed inside, as a side not flat does, so Delete in it deletes from the archive', () => {
    const inside = listing('/a.zip/docs', [], { archive: '/a.zip' });
    const flatInside = listing('/a.zip/docs', [], {
      archive: '/a.zip',
      flat: 1,
    });

    assert.strictEqual(archiveAfter(inside), '/a.zip');
    assert.strictEqual(archiveAfter(flatInside), '/a.zip');
    assert.strictEqual(archiveAfter(flatInside, flatInside), '/a.zip');
    assert.strictEqual(archiveAfter(flatInside, listing('/a', [])), undefined);
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

const groupsTold = (
  look: number,
  groups: readonly (readonly string[])[],
  stillReading = false,
  folder = '/a',
): ViewAction => ({
  type: 'duplicateGroups',
  tab: '1',
  side: 'left',
  folder,
  look,
  groups,
  reading: stillReading,
});

suite('Commander view of duplicates', () => {
  const files = [entry('a.txt'), entry('b.txt')];

  test('shows the duplicates of a side once its listing says so, reading until told the groups, keeping them while listed again in the same look, and none once listed without', () => {
    const asked = run(
      { type: 'show', tab: '1' },
      listing('/a', files, { duplicates: 3 }),
    );
    const told = reduceView(asked, groupsTold(3, [['a.txt', 'b.txt']]));
    const again = reduceView(told, listing('/a', files, { duplicates: 3 }));
    const other = reduceView(again, listing('/a', files, { duplicates: 4 }));
    const plain = reduceView(other, listing('/a', files));

    assert.deepStrictEqual(asked.panes.left?.duplicates, {
      look: 3,
      groups: [],
      reading: true,
    });
    assert.deepStrictEqual(told.panes.left?.duplicates, {
      look: 3,
      groups: [['a.txt', 'b.txt']],
      reading: false,
    });
    assert.strictEqual(
      again.panes.left?.duplicates,
      told.panes.left?.duplicates,
    );
    assert.deepStrictEqual(other.panes.left?.duplicates?.groups, []);
    assert.strictEqual(plain.panes.left?.duplicates, undefined);
  });

  test('keeps showing the duplicates of a side once the settings sort it again, the sizes of its folders come or its tab is shown again', () => {
    const told = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/a', [...files, folderEntry('src')], { duplicates: 3 }),
      groupsTold(3, [['a.txt', 'b.txt']]),
    );
    const resorted = reduceView(told, sortedBy('size', false));
    const counted = reduceView(
      told,
      sized([entry('src', { folder: true, size: 5 })], { folder: '/a' }),
    );
    const again = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/a', [...files, folderEntry('src')], { duplicates: 3 }),
      groupsTold(3, [['a.txt', 'b.txt']]),
      { type: 'show', tab: '2' },
      { type: 'show', tab: '1' },
    );

    for (const view of [resorted, counted, again]) {
      assert.deepStrictEqual(
        view.panes.left?.duplicates,
        told.panes.left?.duplicates,
      );
    }
  });

  test('takes no groups of another look, another folder or a side not showing duplicates', () => {
    const asked = run(
      { type: 'show', tab: '1' },
      listing('/a', files, { duplicates: 3 }),
    );
    const plain = run({ type: 'show', tab: '1' }, listing('/a', files));

    assert.strictEqual(reduceView(asked, groupsTold(2, [['a.txt']])), asked);
    assert.strictEqual(
      reduceView(asked, groupsTold(3, [['a.txt']], false, '/b')),
      asked,
    );
    assert.strictEqual(reduceView(plain, groupsTold(3, [['a.txt']])), plain);
  });
});
