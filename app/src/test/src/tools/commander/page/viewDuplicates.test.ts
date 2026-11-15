import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  reduceView,
  type ViewAction,
} from '../../../../../tools/commander/page/view';
import {
  entry,
  listing,
  run,
  sortedBy,
  folderEntry,
  sized,
} from './viewFixtures';

const groupsTold = (
  look: number,
  groups: readonly (readonly string[])[],
  stillReading = false,
  folder = '/a',
): ViewAction => ({
  type: 'duplicateGroups',
  tab: '1',
  side: 'left',
  folder,
  look,
  groups,
  reading: stillReading,
});

suite('Commander view of duplicates', () => {
  const files = [entry('a.txt'), entry('b.txt')];

  test('shows the duplicates of a side once its listing says so, reading until told the groups, keeping them while listed again in the same look, and none once listed without', () => {
    const asked = run(
      { type: 'show', tab: '1' },
      listing('/a', files, { duplicates: 3 }),
    );
    const told = reduceView(asked, groupsTold(3, [['a.txt', 'b.txt']]));
    const again = reduceView(told, listing('/a', files, { duplicates: 3 }));
    const other = reduceView(again, listing('/a', files, { duplicates: 4 }));
    const plain = reduceView(other, listing('/a', files));

    assert.deepStrictEqual(asked.panes.left?.duplicates, {
      look: 3,
      groups: [],
      reading: true,
    });
    assert.deepStrictEqual(told.panes.left?.duplicates, {
      look: 3,
      groups: [['a.txt', 'b.txt']],
      reading: false,
    });
    assert.strictEqual(
      again.panes.left?.duplicates,
      told.panes.left?.duplicates,
    );
    assert.deepStrictEqual(other.panes.left?.duplicates?.groups, []);
    assert.strictEqual(plain.panes.left?.duplicates, undefined);
  });

  test('keeps showing the duplicates of a side once the settings sort it again, the sizes of its folders come or its tab is shown again', () => {
    const told = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/a', [...files, folderEntry('src')], { duplicates: 3 }),
      groupsTold(3, [['a.txt', 'b.txt']]),
    );
    const resorted = reduceView(told, sortedBy('size', false));
    const counted = reduceView(
      told,
      sized([entry('src', { folder: true, size: 5 })], { folder: '/a' }),
    );
    const again = run(
      sortedBy('name'),
      { type: 'show', tab: '1' },
      listing('/a', [...files, folderEntry('src')], { duplicates: 3 }),
      groupsTold(3, [['a.txt', 'b.txt']]),
      { type: 'show', tab: '2' },
      { type: 'show', tab: '1' },
    );

    for (const view of [resorted, counted, again]) {
      assert.deepStrictEqual(
        view.panes.left?.duplicates,
        told.panes.left?.duplicates,
      );
    }
  });

  test('takes no groups of another look, another folder or a side not showing duplicates', () => {
    const asked = run(
      { type: 'show', tab: '1' },
      listing('/a', files, { duplicates: 3 }),
    );
    const plain = run({ type: 'show', tab: '1' }, listing('/a', files));

    assert.strictEqual(reduceView(asked, groupsTold(2, [['a.txt']])), asked);
    assert.strictEqual(
      reduceView(asked, groupsTold(3, [['a.txt']], false, '/b')),
      asked,
    );
    assert.strictEqual(reduceView(plain, groupsTold(3, [['a.txt']])), plain);
  });
});
