import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  emptyView,
  reduceView,
  viewerChoices,
} from '../../../../../tools/commander/page/view';
import { defaultLayouts } from '../../../../../tools/commander/shared/settings';
import {
  entry,
  listing,
  run,
  shown,
  sortedBy,
  folderEntry,
  repositoriesShown,
  inRepository,
  named,
  sized,
} from './viewFixtures';

const uncounted = (name: string) =>
  entry(name, { folder: true, size: undefined });

const countingFolder = (name: string) =>
  entry(name, { folder: true, size: 1, counting: true });

suite('Commander view', () => {
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

  test('shows a tab opened under the id of the tab it showed that was closed as a new one, with nothing of the closed tab, as the main process tells no hide once another tool is shown', () => {
    let view = run(
      { type: 'show', tab: '2', file: '/work/logo.png' },
      { type: 'choose', choices: { mode: 'preview' } },
      { type: 'closed', tab: '2' },
      { type: 'show', tab: '2', file: '/work/README.md' },
    );

    assert.deepStrictEqual(
      [view.tab, view.viewing, viewerChoices(view), view.closedTab],
      ['2', '/work/README.md', {}, undefined],
    );

    view = reduceView(view, { type: 'closed', tab: '2' });
    view = reduceView(view, { type: 'show', tab: '2' });

    assert.deepStrictEqual(
      [view.tab, view.viewing, view.panes, view.layouts],
      ['2', undefined, emptyView.panes, defaultLayouts],
    );
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

  test('takes the sizes of the folders of a side as they are counted, sorting them again by size, keeping the selection and the marks, and none told for another folder, tab or a file', () => {
    const listed = run(
      { type: 'show', tab: '1' },
      sortedBy('size'),
      listing(
        '/code',
        [uncounted('app'), uncounted('docs'), entry('a.txt', { size: 5 })],
        { selected: 'docs' },
      ),
      { type: 'mark', side: 'left', keys: ['app'], marked: true },
    );
    const counting = entry('app', { folder: true, size: 900, counting: true });

    const counted = reduceView(listed, sized([counting]));
    assert.deepStrictEqual(shown(counted), {
      rows: ['..', 'docs', 'app', 'a.txt'],
      selected: 'docs',
    });
    assert.deepStrictEqual([...(counted.panes.left?.marked ?? [])], ['app']);
    assert.deepStrictEqual(
      counted.panes.left?.rows.find((row) => row.key === 'app')?.entry,
      counting,
    );

    for (const elsewhere of [
      sized([counting], { folder: '/other' }),
      sized([counting], { tab: '2' }),
      sized([entry('a.txt', { size: 1 })]),
      sized([entry('gone', { folder: true, size: 1 })]),
    ]) {
      assert.strictEqual(reduceView(listed, elsewhere), listed);
    }
  });

  test('counts the folders of a side being counted, as told or listed, and none of a side listed flat', () => {
    const listed = run(
      { type: 'show', tab: '1' },
      listing('/code', [
        countingFolder('app'),
        countingFolder('docs'),
        entry('a.txt'),
      ]),
    );
    assert.strictEqual(listed.panes.left?.counting, 2);

    const told = reduceView(listed, {
      type: 'folderSizes',
      tab: '1',
      side: 'left',
      folder: '/code',
      entries: [entry('app', { folder: true, size: 4 })],
    });
    assert.strictEqual(told.panes.left?.counting, 1);

    const again = reduceView(
      told,
      listing('/code', [entry('app', { folder: true, size: 4 })]),
    );
    assert.strictEqual(again.panes.left?.counting, 0);

    const flatAfter = reduceView(listed, listing('/code', [], { flat: 1 }));
    assert.strictEqual(flatAfter.panes.left?.counting, 0);
  });
});
