import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { twistyWidth } from '../../../../../tools/git/page/treeLayout';
import { stylesheetPx } from '../../../../helpers/pageSources';

suite('Tree', () => {
  test('draws the twisty as wide as a level of the tree is indented', () => {
    assert.strictEqual(
      stylesheetPx(/^\.twisty \{[^}]*?\swidth: (\d+)px/m),
      twistyWidth,
    );
  });
});
