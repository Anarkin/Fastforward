import * as assert from 'node:assert';
import { act } from 'react';
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
      onKeyDown,
    }: {
      rows: { readonly count: number };
      renderRow: (index: number) => React.ReactNode;
      onKeyDown?: (
        event: React.KeyboardEvent,
        visible: { readonly first: number; readonly last: number },
      ) => void;
    }) =>
      createElement(
        'div',
        {
          tabIndex: 0,
          onKeyDown: (event: React.KeyboardEvent) =>
            onKeyDown?.(event, { first: 0, last: rows.count - 1 }),
        },
        Array.from({ length: rows.count }, (_, index) =>
          createElement(Fragment, { key: index }, renderRow(index)),
        ),
      ),
  };
});

suite('The filter of a side', () => {
  test('floats the filter over the list once Alt and a letter start it, filtering with the search bar, counting the selected item of those kept, stepping among them around and around, and narrowing by its toggles', async () => {
    await inSide(
      <Pane
        side="left"
        driveTrigger={null}
        bookmarkTrigger={null}
        resizer={null}
      />,
      async ({ main, selected }) => {
        const list = main.querySelector<HTMLElement>('.column-body [tabindex]');
        assert.ok(list);
        const view = main.ownerDocument.defaultView;
        assert.ok(view);
        await act(async () => {
          list.focus();
          list.dispatchEvent(
            new view.KeyboardEvent('keydown', {
              key: 'o',
              code: 'KeyO',
              altKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
        const bar = () => main.querySelector('.floating-search > .search-bar');
        assert.ok(bar());
        assert.ok(
          bar()?.classList.contains('monospace'),
          'the font of the names',
        );
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
