import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { defaultTextView } from '../../../../shell/page/textView';
import { defaultSettings } from '../../../helpers/fixtures';

suite('How text is shown until it is chosen', () => {
  test('wraps no long line, shows whitespace and colors code, in the settings the app starts with and in the page before they reach it alike', () => {
    assert.deepStrictEqual(defaultTextView, {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: true,
    });
    assert.deepStrictEqual(defaultSettings().text, defaultTextView);
  });
});
