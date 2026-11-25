import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  indentItems,
  indentLabel,
  indentationChanges,
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
            converted: false,
            lines: '  ',
            rules: { fallbackIndent: tab },
          },
          opening,
        ),
      ),
      [
        '(Tab and Enter indent by the first of these that applies:)',
        '(No .editorconfig sets "indent_style" or "indent_size")',
        '✓ 2 spaces, as the lines of the file are most often indented by',
        'A tab, from "tools.editor.indentStyle" in the settings',
      ],
    );
    assert.deepStrictEqual(
      rowsOf(
        indentItems(
          {
            indent: tab,
            converted: true,
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
        '(Tab and Enter indent by the first of these that applies:)',
        '✓ A tab, as the indentation was converted',
        '4 spaces, from "indent_size" in "a/.editorconfig"',
        '(The file has no indented lines to go by)',
        '4 spaces, from "tools.editor.indentSize" in the settings',
      ],
    );
  });

  test('converts the indentation of every line to tabs or to spaces by the tab stops, keeping what is past the indentation and leaving a line already so alone', () => {
    const doc = Text.of(['a', '    b', tab + '  c', '      d', tab + 'e']);
    const apply = (to: 'tabs' | 'spaces') => {
      let text = doc;
      for (const change of indentationChanges(doc, to, 4).toReversed()) {
        text = text.replace(change.from, change.to, Text.of([change.insert]));
      }
      return text.toString();
    };
    assert.deepStrictEqual(
      [apply('tabs'), apply('spaces')],
      [
        ['a', tab + 'b', tab + '  c', tab + '  d', tab + 'e'].join('\n'),
        ['a', '    b', '      c', '      d', '    e'].join('\n'),
      ],
    );
    assert.deepStrictEqual(
      indentationChanges(Text.of(['a', tab + 'b']), 'tabs', 4),
      [],
    );
  });
});
