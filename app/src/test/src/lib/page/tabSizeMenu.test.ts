import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { drawnSize, tabSizeItems } from '../../../../lib/page/tabSizeMenu';
import type { ContextMenuItem } from '../../../../lib/page/contextMenuItem';

const rowsOf = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '---'
      : `${item.checked === true ? '✓ ' : ''}${item.disabled === true ? '(' : ''}${item.label}${item.disabled === true ? ')' : ''}`,
  );

suite('The tab width menu', () => {
  test('draws tabs as wide as the width chosen for the tab, else as the .editorconfig of the file asks, else as the settings say', () => {
    assert.deepStrictEqual(
      [
        drawnSize({
          chosen: 2,
          file: { size: 8, key: 'tab_width' },
          settings: 4,
        }),
        drawnSize({ file: { size: 8, key: 'tab_width' }, settings: 4 }),
        drawnSize({ settings: 4 }),
      ],
      [2, 8, 4],
    );
  });

  test('lists where the width of a tab may come from, the one used checked and those that set nothing dimmed, then the widths to choose for the tab', () => {
    const opened: string[] = [];
    const chosen: (number | undefined)[] = [];
    const items = tabSizeItems(
      {
        file: { size: 8, key: 'tab_width', file: 'a/.editorconfig' },
        settings: 4,
      },
      {
        file: (file) => opened.push(file),
        settings: () => opened.push('settings'),
        choose: (size) => chosen.push(size),
      },
    );
    assert.deepStrictEqual(rowsOf(items), [
      '(Tabs are drawn as wide as the first of these that applies:)',
      '(No width chosen for this tab)',
      '✓ 8 columns, from "tab_width" in "a/.editorconfig"',
      '4 columns, from "text.tabSize" in the settings',
      '---',
      'Draw tabs 2 columns wide',
      'Draw tabs 4 columns wide',
      'Draw tabs 8 columns wide',
      '✓ Draw tabs as the file and the settings say',
    ]);
    for (const item of items) {
      if (!('separator' in item) && item.disabled !== true) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(
      [opened, chosen],
      [
        ['a/.editorconfig', 'settings'],
        [2, 4, 8, undefined],
      ],
    );
  });

  test('checks the width chosen for the tab, above the file and the settings', () => {
    assert.deepStrictEqual(
      rowsOf(
        tabSizeItems(
          { chosen: 2, settings: 4 },
          {
            file: () => undefined,
            settings: () => undefined,
            choose: () => undefined,
          },
        ),
      ),
      [
        '(Tabs are drawn as wide as the first of these that applies:)',
        '✓ 2 columns, chosen for this tab',
        '(No .editorconfig sets "tab_width" or "indent_size")',
        '4 columns, from "text.tabSize" in the settings',
        '---',
        '✓ Draw tabs 2 columns wide',
        'Draw tabs 4 columns wide',
        'Draw tabs 8 columns wide',
        'Draw tabs as the file and the settings say',
      ],
    );
  });
});
