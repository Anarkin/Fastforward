import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { defaultTextView } from '../../../../shell/page/textView';
import { defaultSettings } from '../../../helpers/fixtures';

suite('How text is shown until it is chosen', () => {
  test('wraps no long line, shows whitespace, colors code, marks the occurrences of the word at the cursor or of the text selected and draws text as elements, not as cells on a canvas, in the settings the app starts with and in the page before they reach it alike', () => {
    assert.deepStrictEqual(defaultTextView, {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: true,
      highlightOccurrences: true,
    });
    assert.deepStrictEqual(defaultSettings().text, defaultTextView);
  });
});
