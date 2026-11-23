import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  columnsClass,
  showsDiff,
  listError,
  shownSelection,
} from '../../../../../tools/git/page/columnsShown';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';

suite('Columns', () => {
  test('stands the bars of its columns outside their frames, hides the commits on request, and the other columns while no commit is selected', () => {
    assert.strictEqual(columnsClass(true, 'a'), 'columns bars-outside');
    assert.strictEqual(
      columnsClass(false, 'a'),
      'columns bars-outside commits-hidden',
    );
    assert.strictEqual(
      columnsClass(true, undefined),
      'columns bars-outside nothing-selected',
    );
    assert.strictEqual(
      columnsClass(false, undefined),
      'columns bars-outside commits-hidden nothing-selected',
    );
    assert.strictEqual(
      columnsClass(true, 'a', false),
      'columns bars-outside no-changes',
    );
  });

  test('shows the diff unless the files list nothing, or while it has an error to show', () => {
    assert.strictEqual(showsDiff(undefined, false), true);
    assert.strictEqual(showsDiff(undefined, true), false);
    assert.strictEqual(showsDiff('Bad object', true), true);
  });
});

suite('Error placement', () => {
  test('shows an error in the commit list while nothing is selected, as the other columns are hidden then', () => {
    assert.strictEqual(
      listError('Not a repository', undefined),
      'Not a repository',
    );
    assert.strictEqual(listError('Not a repository', 'a'), undefined);
    assert.strictEqual(listError(undefined, undefined), undefined);
  });
});

suite('Shown selection', () => {
  test('lays out a clean working tree, selected, like nothing selected, as there is nothing to show beside it', () => {
    assert.strictEqual(shownSelection(workingTreeHash, 0), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, undefined), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, 2), workingTreeHash);
    assert.strictEqual(shownSelection('a', 0), 'a');
    assert.strictEqual(shownSelection(undefined, 2), undefined);
  });
});
