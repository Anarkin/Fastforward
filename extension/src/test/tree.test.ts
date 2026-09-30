import * as assert from 'node:assert';
import { twistyWidth } from '../webview/tree';
import { stylesheetPx } from './fixtures';

suite('Tree', () => {
  test('draws the twisty as wide as a level of the tree is indented', () => {
    assert.strictEqual(
      stylesheetPx(/^\.twisty \{[^}]*?width: (\d+)px/m),
      twistyWidth,
    );
  });
});
