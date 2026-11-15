import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withPopup } from '../../../../shell/page/popups';

suite('Shell store', () => {
  test('shows a popup opened from inside another over it, as it takes the focus and the next Escape, keeping each where it is while it stays open', () => {
    const about = withPopup([], 'about', true);
    const both = withPopup(about, 'shortcuts', true);
    assert.deepStrictEqual(both, ['about', 'shortcuts']);
    assert.strictEqual(withPopup(both, 'about', true), both);
    assert.deepStrictEqual(withPopup(both, 'openWith', true), [
      'about',
      'shortcuts',
      'openWith',
    ]);
    assert.deepStrictEqual(withPopup(both, 'about', false), ['shortcuts']);
    assert.deepStrictEqual(
      withPopup(withPopup(both, 'about', false), 'about', true),
      ['shortcuts', 'about'],
    );
    assert.strictEqual(withPopup(about, 'shortcuts', false), about);
  });
});
