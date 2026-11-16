import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  commitClass,
  commitListbox,
  commitOption,
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

suite('Commit list for assistive technology', () => {
  test('makes each drawn row an option with an id of its own, picked when it is either side selected, and placed in the whole list', () => {
    assert.deepStrictEqual(
      commitOption('list-', 'a', 2, 10, comparisonOf('b', 'a')),
      {
        id: 'list-a',
        role: 'option',
        'aria-selected': true,
        'aria-setsize': 10,
        'aria-posinset': 3,
      },
    );
    assert.strictEqual(
      commitOption('list-', 'b', 0, 10, comparisonOf('b', 'a'))[
        'aria-selected'
      ],
      true,
    );
    assert.strictEqual(
      commitOption('list-', 'c', 0, 10, 'a')['aria-selected'],
      false,
    );
    assert.strictEqual(
      commitOption('list-', 4, 4, 10, undefined)['aria-selected'],
      false,
    );
  });

  test('makes the list a list box, pointing at the shown side while it is drawn, and taking two picked rows when comparing', () => {
    const drawn = [{ key: workingTreeHash }, { key: 'a' }, { key: 'b' }];
    assert.deepStrictEqual(
      commitListbox('list-', drawn, comparisonOf('a', 'b')),
      {
        role: 'listbox',
        'aria-label': 'Commits',
        'aria-multiselectable': true,
        'aria-activedescendant': 'list-b',
      },
    );
    assert.deepStrictEqual(commitListbox('list-', drawn, workingTreeHash), {
      role: 'listbox',
      'aria-label': 'Commits',
      'aria-multiselectable': false,
      'aria-activedescendant': `list-${workingTreeHash}`,
    });
    assert.strictEqual(
      commitListbox('list-', drawn, 'z')['aria-activedescendant'],
      undefined,
    );
    assert.strictEqual(
      commitListbox('list-', drawn, undefined)['aria-activedescendant'],
      undefined,
    );
  });
});
