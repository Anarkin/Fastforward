import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { listMoveOf } from '../../../../../lib/page/listMoves';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import {
  workingTreeHash,
  workingTreeIndex,
} from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { settling } from '../../../../../tools/git/page/outbox';
import { commitInfo, keyPress } from '../../../../helpers/fixtures';
import { loaded } from './commitListFixtures';
import {
  listKeyPosition,
  keySelection,
  pendingSelection,
  mergeToToggle,
} from '../../../../../tools/git/page/commitListKeys';
import { commitMoveOf } from '../../../../../tools/git/page/commitListItems';

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

suite('Commit list keys', () => {
  test('sends a selection made by a held key only once the key settles', async () => {
    const sent: string[] = [];
    const { settle } = settling((hash: string) => sent.push(hash), 0);
    settle('a', false);
    settle('b', true);
    settle('c', true);
    assert.deepStrictEqual(sent, ['a']);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c']);
    settle('d', true);
    settle('e', false);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c', 'e']);
  });

  test('sends a selection made by a held key at once before anything sent after it, and only once', async () => {
    const sent: string[] = [];
    const { settle, send } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    send('switch tab');
    send('load tree');
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
    await settled();
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
  });

  test('sends what does not wait on a selection, such as the pages scrolled to, at once, still holding a selection made by a held key until the key settles', async () => {
    const sent: string[] = [];
    const { settle, pass } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    pass('load page');
    settle('select c', true);
    pass('load next page');
    assert.deepStrictEqual(sent, ['load page', 'load next page']);
    await settled();
    assert.deepStrictEqual(sent, ['load page', 'load next page', 'select c']);
  });

  test('holds what follows a selection made by a held key with it, dropping it when the key moves on', async () => {
    const sent: string[] = [];
    const { settle, follow } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    follow('load tree b');
    settle('select c', true);
    follow('load tree c');
    assert.deepStrictEqual(sent, []);
    await settled();
    assert.deepStrictEqual(sent, ['select c', 'load tree c']);
    settle('select d', false);
    follow('load tree d');
    assert.deepStrictEqual(sent, [
      'select c',
      'load tree c',
      'select d',
      'load tree d',
    ]);
  });

  const visible = { first: 0, last: 0 };
  const press = (
    key: string,
    history: CommitHistory,
    selected: string | undefined,
    workingTree: boolean,
    rows = visible,
    headCommit?: string,
    pending?: number,
  ) => {
    const move = listMoveOf(keyPress(key));
    assert.ok(move, key);
    return listKeyPosition(
      move,
      history,
      selected,
      workingTree,
      rows,
      headCommit,
      pending,
    );
  };

  test('steps with Alt+↑ and Alt+↓ as with the arrows, so holding Alt shows the whole message of each commit stepped to, but takes no step on Ctrl+↓, which selects the parent', () => {
    assert.strictEqual(commitMoveOf(keyPress('ArrowDown')), 'down');
    assert.strictEqual(
      commitMoveOf(keyPress('ArrowDown', { altKey: true })),
      'down',
    );
    assert.strictEqual(
      commitMoveOf(keyPress('ArrowUp', { altKey: true })),
      'up',
    );
    assert.strictEqual(commitMoveOf(keyPress('End')), 'last');
    assert.strictEqual(
      commitMoveOf(keyPress('ArrowDown', { ctrlKey: true })),
      undefined,
    );
  });

  test('steps with the arrows from the selected row, and stops at either end', () => {
    const history = loaded('a', 'b');
    assert.strictEqual(press('ArrowDown', history, 'a', true), 1);
    assert.strictEqual(press('ArrowUp', history, 'a', true), -1);
    assert.strictEqual(press('ArrowDown', history, 'b', true), undefined);
    assert.strictEqual(
      press('ArrowUp', history, workingTreeHash, true),
      undefined,
    );
    assert.strictEqual(press('ArrowUp', history, 'a', false), undefined);
    assert.strictEqual(press('ArrowDown', history, workingTreeHash, true), 0);
  });

  test('starts from the checked-out commit when nothing is selected, or else from the top', () => {
    const history = loaded('a', 'b', 'c');
    assert.strictEqual(
      press('ArrowDown', history, undefined, true, visible, 'b'),
      1,
    );
    assert.strictEqual(
      press('ArrowUp', history, undefined, true, visible, 'b'),
      1,
    );
    assert.strictEqual(press('ArrowDown', history, undefined, true), -1);
    assert.strictEqual(press('ArrowDown', history, undefined, false), 0);
  });

  test('steps with the arrows from the commit compared to', () => {
    const history = loaded('a', 'b', 'c');
    assert.strictEqual(
      press('ArrowDown', history, comparisonOf('c', 'a'), true),
      1,
    );
    assert.strictEqual(
      press('ArrowUp', history, comparisonOf('a', workingTreeHash), true),
      undefined,
    );
    assert.strictEqual(
      press('ArrowDown', history, comparisonOf('a', workingTreeHash), true),
      0,
    );
  });

  test('goes to the first row on Home and the last on End, loaded or not', () => {
    const history = new CommitHistory(1000);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(press('Home', history, 'b', true), -1);
    assert.strictEqual(press('Home', history, 'b', false), 0);
    assert.strictEqual(press('End', history, 'a', true), 999);
    assert.strictEqual(press('End', history, undefined, false), 999);
  });

  test('pages down to the last row in view first, then a screen further, and up likewise', () => {
    const history = new CommitHistory(100);
    history.add(
      0,
      Array.from({ length: 30 }, (_, index) => commitInfo(`c${index}`)),
    );
    const rows = { first: 10, last: 19 };
    assert.strictEqual(press('PageDown', history, 'c12', false, rows), 19);
    assert.strictEqual(press('PageDown', history, 'c19', false, rows), 28);
    assert.strictEqual(press('PageDown', history, undefined, false, rows), 19);
    assert.strictEqual(press('PageUp', history, 'c15', false, rows), 10);
    assert.strictEqual(press('PageUp', history, 'c10', false, rows), 1);
    assert.strictEqual(
      press('PageUp', history, 'c3', false, { first: 3, last: 12 }),
      0,
    );
    assert.strictEqual(
      press('PageDown', history, 'c0', false, { first: 95, last: 99 }),
      99,
    );
  });

  test('pages counting the working tree row as a row in view', () => {
    const history = new CommitHistory(100);
    history.add(
      0,
      Array.from({ length: 30 }, (_, index) => commitInfo(`c${index}`)),
    );
    const rows = { first: workingTreeIndex, last: 8 };
    assert.strictEqual(
      press('PageDown', history, workingTreeHash, true, rows),
      8,
    );
    assert.strictEqual(press('PageDown', history, 'c8', true, rows), 17);
    assert.strictEqual(
      press('PageUp', history, 'c3', true, rows),
      workingTreeIndex,
    );
  });

  test('keeps going from a row still loading, rather than the selected one', () => {
    const history = new CommitHistory(1000);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(
      press('ArrowUp', history, 'a', false, visible, undefined, 999),
      998,
    );
  });

  test('steps from where the extension said the selected commit is, before it loads', () => {
    const history = new CommitHistory(1000, [], undefined, 1, 5);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(press('ArrowDown', history, 'c', true), 6);
    assert.strictEqual(press('ArrowUp', history, 'c', true), 4);
  });

  test("doesn't start over from the top without knowing where the selected commit is", () => {
    const history = new CommitHistory(1000);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(press('ArrowDown', history, 'c', true), undefined);
    const moved = new CommitHistory(1000, [], undefined, 1, 0);
    moved.add(0, [commitInfo('d')]);
    assert.strictEqual(press('End', moved, 'c', true), undefined);
  });

  test('goes on from the merge the selected commit is hidden in', () => {
    const history = new CommitHistory(3, [], undefined, 0, undefined, 0);
    history.add(0, [commitInfo('m'), commitInfo('n'), commitInfo('o')]);
    assert.strictEqual(press('ArrowDown', history, 'hidden', false), 1);
    assert.strictEqual(press('End', history, 'hidden', false), 2);
  });

  test('steps from a revealed commit before its page loads', () => {
    const history = new CommitHistory(1000);
    history.locate('c', 500);
    assert.strictEqual(press('ArrowDown', history, 'c', true), 501);
  });

  test('selects a row a key went to once it loads, held back like the key while it is held down, but not in a history laid out anew meanwhile', () => {
    const history = new CommitHistory(10);
    const pending = { history, position: 9, repeat: true };
    assert.strictEqual(pendingSelection(pending, history, 'a'), null);
    history.add(9, [commitInfo('last')]);
    assert.deepStrictEqual(pendingSelection(pending, history, 'a'), {
      hash: 'last',
      repeat: true,
    });
    assert.deepStrictEqual(
      pendingSelection({ ...pending, repeat: false }, history, 'a'),
      { hash: 'last', repeat: false },
    );
    assert.strictEqual(
      pendingSelection(
        pending,
        loaded(...Array.from({ length: 12 }, (_, i) => `c${i}`)),
        'a',
      ),
      null,
    );
  });

  test('keeps the selected commit selected when a key comes back to it from a row still loading', () => {
    const history = new CommitHistory(10);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(keySelection(history, 2, 'b'), null);
    assert.strictEqual(keySelection(history, 1, 'b'), undefined);
    assert.strictEqual(keySelection(history, 0, 'b'), 'a');
    assert.strictEqual(
      keySelection(history, workingTreeIndex, workingTreeHash),
      undefined,
    );
    assert.strictEqual(
      keySelection(history, workingTreeIndex, 'a'),
      workingTreeHash,
    );
    history.add(9, [commitInfo('last')]);
    assert.strictEqual(
      pendingSelection(
        { history, position: 9, repeat: false },
        history,
        'last',
      ),
      undefined,
    );
  });

  test('toggles the selected merge, collapsed or expanded, and no other row', () => {
    const history = new CommitHistory(4);
    history.add(
      0,
      [commitInfo('m'), commitInfo('n'), commitInfo('a')],
      [
        { lane: 0, color: 0, lines: [], merge: 'collapsed', hidden: 2 },
        { lane: 0, color: 0, lines: [], merge: 'expanded' },
        { lane: 0, color: 0, lines: [] },
      ],
    );
    history.locate('later', 3);
    assert.strictEqual(mergeToToggle(history, 'm'), 'm');
    assert.strictEqual(mergeToToggle(history, 'n'), 'n');
    assert.strictEqual(mergeToToggle(history, 'a'), undefined);
    assert.strictEqual(mergeToToggle(history, 'later'), undefined);
    assert.strictEqual(mergeToToggle(history, workingTreeHash), undefined);
    assert.strictEqual(
      mergeToToggle(history, comparisonOf('m', 'a')),
      undefined,
    );
    assert.strictEqual(mergeToToggle(history, undefined), undefined);
  });
});
