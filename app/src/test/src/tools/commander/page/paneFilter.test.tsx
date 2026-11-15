import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import { inSide } from './paneFixtures';
import { clicked, typed } from '../../../../helpers/mounted';

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { createElement, Fragment } = await import('react');
  return {
    ...(await importOriginal<
      typeof import('../../../../../lib/page/virtualRows')
    >()),
    VirtualRows: ({
      rows,
      renderRow,
    }: {
      rows: { readonly count: number };
      renderRow: (index: number) => React.ReactNode;
    }) =>
      createElement(
        'div',
        { tabIndex: 0 },
        Array.from({ length: rows.count }, (_, index) =>
          createElement(Fragment, { key: index }, renderRow(index)),
        ),
      ),
  };
});

suite('The filter of a side', () => {
  test('filters with the search bar, counting the selected item of those kept, stepping among them around and around, and narrowing by its toggles', async () => {
    await inSide(
      <Pane
        side="left"
        driveTrigger={null}
        bookmarkTrigger={null}
        resizer={null}
      />,
      async ({ main, selected }) => {
        clicked(main.querySelector('[title="Filter the folder"]'));
        const bar = () =>
          main.querySelector('.column-title.searching > .search-bar');
        assert.ok(bar());
        assert.strictEqual(
          bar()?.querySelector('input')?.getAttribute('placeholder'),
          'Filter…',
        );
        typed(bar()?.querySelector('input'), 'o');
        const count = () => bar()?.querySelector('.search-count')?.textContent;
        assert.strictEqual(count(), '2 of 2');
        assert.strictEqual(selected(), 'notes.txt');
        const steps = () => bar()?.querySelectorAll('.search-steps button');
        clicked(steps()?.[1]);
        assert.strictEqual(selected(), 'docs');
        assert.strictEqual(count(), '1 of 2');
        clicked(steps()?.[0]);
        assert.strictEqual(selected(), 'notes.txt');
        const wholeWord = () => bar()?.querySelectorAll('.search-toggle')[1];
        clicked(wholeWord());
        assert.strictEqual(wholeWord()?.getAttribute('aria-pressed'), 'true');
        assert.strictEqual(count(), 'No matches');
        assert.deepStrictEqual(
          Array.from(steps() ?? [], (button) =>
            button.hasAttribute('disabled'),
          ),
          [true, true],
        );
        typed(bar()?.querySelector('input'), 'notes');
        assert.strictEqual(wholeWord()?.getAttribute('aria-pressed'), 'true');
        assert.strictEqual(count(), '1 of 1');
        clicked(bar()?.querySelector('.search-bar > .nav-button'));
        assert.strictEqual(bar(), null);
      },
    );
  });
});
