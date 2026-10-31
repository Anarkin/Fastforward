import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { TabHistory } from '../../../shell/main/tabHistory';

const tabs = (...ids: string[]) => ids.map((id) => ({ id }));

suite('Tab history', () => {
  test('goes back to the tab shown before the one closed, and on back through those shown before it', () => {
    const history = new TabHistory();
    for (const id of ['1', '2', '3', '4', '5', '6', '2', '4', '6']) {
      history.visit(id);
    }

    assert.strictEqual(
      history.after('6', tabs('1', '2', '3', '4', '5'), 5),
      '4',
    );
    history.forget('6');
    assert.strictEqual(history.after('4', tabs('1', '2', '3', '5'), 3), '2');
    history.forget('4');
    assert.strictEqual(history.after('2', tabs('1', '3', '5'), 1), '5');
  });

  test('opens the tab next to the one closed when no other was shown, or the last tab when it was the last', () => {
    const history = new TabHistory();
    history.visit('2');

    assert.strictEqual(history.after('2', tabs('1', '3'), 1), '3');
    assert.strictEqual(history.after('3', tabs('1', '2'), 2), '2');
    assert.strictEqual(history.after('1', tabs(), 0), undefined);
  });
});
