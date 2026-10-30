import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  emptyView,
  reduceView,
  type CommanderView,
  type ViewAction,
} from '../../../../tools/commander/page/view';
import type { Entry } from '../../../../tools/commander/shared/protocol';

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
  selected: undefined,
  ...extra,
});

const run = (...actions: ViewAction[]): CommanderView =>
  actions.reduce(reduceView, emptyView);

const shown = (view: CommanderView) => ({
  rows: view.panes.left?.rows.map((row) => row.key),
  selected: view.panes.left?.selected,
});

suite('Commander view', () => {
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
        sort: { column: 'extension', descending: false },
        columns: { extension: 4, size: 15, date: 10 },
        defaultColumns: { extension: 10, size: 15, date: 16 },
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
      { type: 'sort', side: 'left', column: 'size' },
      { type: 'sort', side: 'left', column: 'size' },
    );

    assert.deepStrictEqual(shown(view), {
      rows: ['..', 'a.zip', 'b.txt'],
      selected: 'a.zip',
    });
    assert.deepStrictEqual(view.panes.left?.sort, {
      column: 'size',
      descending: true,
    });
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
});
