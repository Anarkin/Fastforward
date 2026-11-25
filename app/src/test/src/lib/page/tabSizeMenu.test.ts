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

const opening = { file: () => undefined, settings: () => undefined };

suite('The tab width menu', () => {
  test('draws tabs as wide as the .editorconfig of the file asks, else as the settings say', () => {
    assert.deepStrictEqual(
      [
        drawnSize({ file: { size: 8, key: 'tab_width' }, settings: 4 }),
        drawnSize({ settings: 4 }),
      ],
      [8, 4],
    );
  });

  test('lists where the width of a tab may come from, the one used checked and those that set nothing dimmed, each set one opening its file', () => {
    const opened: string[] = [];
    const items = tabSizeItems(
      {
        file: { size: 8, key: 'tab_width', file: 'a/.editorconfig' },
        settings: 4,
      },
      {
        file: (file) => opened.push(file),
        settings: () => opened.push('settings'),
      },
    );
    assert.deepStrictEqual(rowsOf(items), [
      '(Tabs are drawn as wide as the first of these that applies:)',
      '✓ 8 columns, from "tab_width" in "a/.editorconfig"',
      '4 columns, from "text.tabSize" in the settings',
    ]);
    for (const item of items) {
      if (!('separator' in item) && item.disabled !== true) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(opened, ['a/.editorconfig', 'settings']);
  });

  test('checks the settings where no .editorconfig sets a width', () => {
    assert.deepStrictEqual(rowsOf(tabSizeItems({ settings: 4 }, opening)), [
      '(Tabs are drawn as wide as the first of these that applies:)',
      '(No .editorconfig sets "tab_width" or "indent_size")',
      '✓ 4 columns, from "text.tabSize" in the settings',
    ]);
  });
});
