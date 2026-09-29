import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { twistyWidth } from '../webview/tree';

suite('Tree', () => {
  test('draws the twisty as wide as a level of the tree is indented', () => {
    const css = readFileSync(
      path.join(__dirname, '../../src/webview/style.css'),
      'utf8',
    );
    const match = /^\.twisty \{[^}]*?width: (\d+)px/m.exec(css);
    assert.ok(match);
    assert.strictEqual(Number(match[1]), twistyWidth);
  });
});
