import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import {
  commitClass,
  isCompareClick,
} from '../../../../../tools/git/page/commitListItems';
import { plainClick } from './commitListFixtures';
import { withMacKeys } from '../../../../helpers/keys';

suite('Commit row', () => {
  test('marks the checked-out commit, whether or not it is selected', () => {
    assert.strictEqual(commitClass('a', undefined, 'a'), 'commit checked-out');
    assert.strictEqual(
      commitClass('a', 'a', 'a'),
      'commit selected checked-out',
    );
    assert.strictEqual(commitClass('b', 'b', 'a'), 'commit selected');
    assert.strictEqual(commitClass('b', undefined, undefined), 'commit');
  });

  test('marks both commits of a comparison selected, and the one compared from', () => {
    const selection = comparisonOf('a', 'b');
    assert.strictEqual(
      commitClass('a', selection, undefined),
      'commit selected compare-from',
    );
    assert.strictEqual(
      commitClass('b', selection, undefined),
      'commit selected',
    );
    assert.strictEqual(commitClass('c', selection, undefined), 'commit');
  });

  test('compares only on a click with Ctrl, or Cmd on macOS, alone', () => {
    assert.ok(isCompareClick({ ...plainClick, ctrlKey: true }));
    assert.ok(
      withMacKeys(() => isCompareClick({ ...plainClick, metaKey: true })),
    );
    assert.ok(!isCompareClick({ ...plainClick, metaKey: true }));
    assert.ok(!isCompareClick(plainClick));
    assert.ok(
      !isCompareClick({ ...plainClick, ctrlKey: true, shiftKey: true }),
    );
    assert.ok(
      !withMacKeys(() =>
        isCompareClick({ ...plainClick, metaKey: true, altKey: true }),
      ),
    );
  });
});
