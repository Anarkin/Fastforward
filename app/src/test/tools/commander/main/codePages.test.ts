import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  encodingOfCodePage,
  encodingOfLocale,
} from '../../../../tools/commander/main/codePages';

suite('The code page of the system', () => {
  test('reads the Windows code page of programs without Unicode, Western for those it has no encoding of', () => {
    assert.strictEqual(encodingOfCodePage(1250), 'windows-1250');
    assert.strictEqual(encodingOfCodePage(1251), 'windows-1251');
    assert.strictEqual(encodingOfCodePage(1252), 'windows-1252');
    assert.strictEqual(encodingOfCodePage(932), 'windows-1252');
  });

  test('takes the code page from the language elsewhere, Central European, Cyrillic or Western', () => {
    assert.strictEqual(encodingOfLocale('hu-HU'), 'windows-1250');
    assert.strictEqual(encodingOfLocale('pl'), 'windows-1250');
    assert.strictEqual(encodingOfLocale('sr-Latn-RS'), 'windows-1250');
    assert.strictEqual(encodingOfLocale('ru-RU'), 'windows-1251');
    assert.strictEqual(encodingOfLocale('sr-Cyrl-RS'), 'windows-1251');
    assert.strictEqual(encodingOfLocale('en-US'), 'windows-1252');
    assert.strictEqual(encodingOfLocale('de'), 'windows-1252');
  });
});
