import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  languageLabel,
  languageMenu,
  shownLanguage,
} from '../../../../tools/commander/page/languageChoice';
import { languages } from '../../../../ui/languages';

const first = languages[0];

const labels = (menu: ReturnType<typeof languageMenu>) =>
  menu.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.label}`,
  );

suite('The language of a file viewed', () => {
  test('colors a file in the language its name tells, in the one chosen, or in none for plain text', () => {
    assert.strictEqual(shownLanguage('auto', 'C:/a/wincmd.ini'), 'ini');
    assert.strictEqual(shownLanguage('auto', 'C:/a/notes'), undefined);
    assert.strictEqual(
      shownLanguage('typescript', 'C:/a/wincmd.ini'),
      'typescript',
    );
    assert.strictEqual(shownLanguage('plain', 'C:/a/code.ts'), undefined);
  });

  test('names a language by its name, and no language as plain text', () => {
    assert.strictEqual(languageLabel('typescript'), 'TypeScript');
    assert.strictEqual(languageLabel(undefined), 'Plain Text');
  });

  test('names in the menu the language Auto chose, then offers plain text and every language, sorted by name', () => {
    const menu = labels(languageMenu('auto', 'C:/a/wincmd.ini', () => {}));

    assert.deepStrictEqual(menu.slice(0, 4), [
      '✓ Auto: INI',
      'Plain Text',
      '-',
      first?.name,
    ]);
    assert.ok(menu.includes('TypeScript'));
    assert.ok(menu.length > 200);
    assert.deepStrictEqual(
      labels(languageMenu('plain', 'C:/a/notes', () => {})).slice(0, 2),
      ['Auto', '✓ Plain Text'],
    );
    assert.ok(
      labels(languageMenu('typescript', 'C:/a/x.ini', () => {})).includes(
        '✓ TypeScript',
      ),
    );
  });

  test('finds a language by its id and aliases too, and Auto by the language it chose', () => {
    const menu = languageMenu('auto', 'C:/a/code.ts', () => {});
    const keywordsOf = (label: string) => {
      const item = menu.find(
        (each) => !('separator' in each) && each.label === label,
      );
      return item && !('separator' in item) ? item.keywords : undefined;
    };

    assert.strictEqual(keywordsOf('TypeScript'), 'typescript ts cts mts');
    assert.strictEqual(keywordsOf('Auto: TypeScript'), 'typescript ts cts mts');
  });

  test('chooses the language of the item clicked', () => {
    const chosen: string[] = [];
    const menu = languageMenu('auto', 'C:/a/code.ts', (choice) =>
      chosen.push(choice),
    );

    for (const item of menu.slice(0, 4)) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }

    assert.deepStrictEqual(chosen, ['auto', 'plain', first?.id]);
  });
});
