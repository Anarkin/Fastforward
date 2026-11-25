import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  indentItems,
  indentLabel,
} from '../../../../../tools/editor/page/indentation';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';

const rowsOf = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '---'
      : `${item.checked === true ? '✓ ' : ''}${item.disabled === true ? '(' : ''}${item.label}${item.disabled === true ? ')' : ''}`,
  );

const tab = String.fromCharCode(9);

const opening = { file: () => undefined, settings: () => undefined };

suite('The indentation of the editor', () => {
  test('names what Tab types and how wide a tab is drawn on its button, as spaces or as a tab size', () => {
    assert.deepStrictEqual(
      [indentLabel('  ', 4), indentLabel(tab, 8)],
      ['Spaces: 2', 'Tab Size: 8'],
    );
  });

  test('lists where the indentation may come from, the .editorconfig, the lines of the file and the settings, the one used checked and those that set nothing dimmed', () => {
    assert.deepStrictEqual(
      rowsOf(
        indentItems(
          {
            indent: '  ',
            lines: '  ',
            rules: { fallbackIndent: tab },
          },
          opening,
        ),
      ),
      [
        '(Indentation rules for typing (first one applies):)',
        '(No .editorconfig sets "indent_style" or "indent_size")',
        '✓ 2 spaces, as the lines of the file are most often indented by',
        'A tab, from "tools.editor.indentStyle" in the settings',
      ],
    );
    assert.deepStrictEqual(
      rowsOf(
        indentItems(
          {
            indent: '    ',
            lines: undefined,
            rules: {
              indent: '    ',
              indentFile: 'a/.editorconfig',
              fallbackIndent: '    ',
            },
          },
          opening,
        ),
      ),
      [
        '(Indentation rules for typing (first one applies):)',
        '✓ 4 spaces, from "indent_size" in "a/.editorconfig"',
        '(The file has no indented lines to go by)',
        '4 spaces, from "tools.editor.indentSize" in the settings',
      ],
    );
  });

  test('names indent_style as where a tab comes from, and opens the .editorconfig or the settings a row comes from once it is clicked', () => {
    const opened: string[] = [];
    const items = indentItems(
      {
        indent: tab,
        lines: '  ',
        rules: {
          indent: tab,
          indentFile: 'a/.editorconfig',
          fallbackIndent: '  ',
        },
      },
      {
        file: (file) => opened.push(file),
        settings: () => opened.push('settings'),
      },
    );
    assert.deepStrictEqual(rowsOf(items).slice(1), [
      '✓ A tab, from "indent_style" in "a/.editorconfig"',
      '2 spaces, as the lines of the file are most often indented by',
      '2 spaces, from "tools.editor.indentSize" in the settings',
    ]);
    for (const item of items) {
      if (!('separator' in item) && item.disabled !== true) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(opened, ['a/.editorconfig', 'settings']);
  });
});
