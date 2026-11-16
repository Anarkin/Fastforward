import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { filterOf } from '../../../../../tools/commander/page/sideFilters';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { noKeptViewer } from '../../../../../tools/commander/page/viewerKept';
import { noKeptEditing } from '../../../../../tools/commander/page/editorKept';
import { noop } from '../../../../helpers/fixtures';
import { withFiles } from './storeFixtures';

const folder = 'C:\\code';

suite('Commander store keeping its tabs', () => {
  test('forgets what it keeps of a tab moved out of its window, as the main process hands it back should the tab come back', () => {
    const store = createCommanderStore(noop);
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt'));
    store.getState().filterSide('left', 'a');
    store.getState().keepScroll(`1 left ${folder} details`, 40);
    receive({ type: 'show', tab: '2', file: `${folder}\\a.txt` });
    store.getState().choose({ mode: 'hex' });
    store.getState().keepViewer('2', { finding: true });
    store.getState().keepPlace('2', 12);
    receive({ type: 'show', tab: '3', file: `${folder}\\a.txt`, edit: true });
    store.getState().keepEditing('3', { finding: true });
    receive({ type: 'show', tab: '4' });

    for (const tab of ['1', '2', '3']) {
      receive({ type: 'left', tab });
    }

    const { view } = store.getState();
    assert.deepStrictEqual([...view.kept.keys()], []);
    assert.deepStrictEqual([...view.viewers.keys()], []);
    assert.strictEqual(
      store.getState().scrollOf(`1 left ${folder} details`),
      0,
    );
    assert.deepStrictEqual(store.getState().keptViewer('2'), noKeptViewer);
    assert.strictEqual(store.getState().placeOf('2'), 0);
    assert.deepStrictEqual(store.getState().keptEditing('3'), noKeptEditing);
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt'));
    assert.strictEqual(filterOf(store.getState(), 'left'), undefined);
  });
});
