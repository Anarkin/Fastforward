import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  encodingOfCodePage,
  encodingOfLocale,
} from '../../../../tools/commander/main/codePages';

suite('The code page of the system', () => {
  test('reads the Windows code page of programs without Unicode', () => {
    const pages = [1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 874];
    for (const page of pages) {
      assert.strictEqual(encodingOfCodePage(page, 'en-US'), `windows-${page}`);
    }
  });

  test('takes the code page from the language of the system when Windows reports one with no encoding of a byte a character, as UTF-8 set for programs without Unicode or an East Asian one', () => {
    assert.strictEqual(encodingOfCodePage(65001, 'hu-HU'), 'windows-1250');
    assert.strictEqual(encodingOfCodePage(65001, 'el-GR'), 'windows-1253');
    assert.strictEqual(encodingOfCodePage(65001, 'en-US'), 'windows-1252');
    assert.strictEqual(encodingOfCodePage(932, 'ja-JP'), 'windows-1252');
  });

  test('takes the code page from the language elsewhere, by the Windows code page of each', () => {
    const expected: Readonly<Record<string, readonly string[]>> = {
      'windows-1250': ['hu-HU', 'pl', 'cs', 'sr-Latn-RS', 'ro', 'sq'],
      'windows-1251': ['ru-RU', 'uk', 'bg', 'sr-Cyrl-RS', 'kk'],
      'windows-1252': ['en-US', 'de', 'fr-CA', 'ja-JP'],
      'windows-1253': ['el-GR'],
      'windows-1254': ['tr-TR', 'az'],
      'windows-1255': ['he-IL', 'yi'],
      'windows-1256': ['ar-EG', 'fa', 'ur'],
      'windows-1257': ['lt', 'lv', 'et-EE'],
      'windows-1258': ['vi-VN'],
      'windows-874': ['th-TH'],
    };
    for (const [encoding, locales] of Object.entries(expected)) {
      for (const locale of locales) {
        assert.strictEqual(encodingOfLocale(locale), encoding, locale);
      }
    }
  });
});
