import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import { RowLooks, signOf } from '../../../../../tools/commander/page/rowLooks';

const [row] = rowsOf(
  [
    {
      name: 'notes.txt',
      folder: false,
      link: false,
      hidden: false,
      size: 1,
      modified: 0,
    },
  ],
  false,
  false,
  { column: 'name', descending: false, groupByColor: false },
);

const resting = {
  selected: false,
  marked: false,
  startsGroup: false,
  dropTarget: false,
};

suite('Commander looks of rows', () => {
  test('keeps the look of a row while its state and the settings are as they were, so a frame reads no date or filter of a row anew, and makes it anew once either changed', () => {
    assert.ok(row);
    const kept = new RowLooks<{ readonly made: number }>();
    const settings = {};
    let made = 0;
    const make = () => ({ made: ++made });
    const first = kept.of(row, resting, settings, '', make);
    assert.strictEqual(kept.of(row, resting, settings, '', make), first);
    const selected = kept.of(
      row,
      { ...resting, selected: true },
      settings,
      '',
      make,
    );
    assert.notStrictEqual(selected, first);
    assert.notStrictEqual(
      kept.of(row, { ...resting, selected: true }, {}, '', make),
      selected,
    );
    assert.strictEqual(made, 3);
    assert.notStrictEqual(
      kept.of(row, { ...resting, selected: true }, settings, 'more', make).made,
      3,
    );
  });

  test('signs a look once, the same look giving the same sign', () => {
    const look = { name: 'notes' };
    assert.strictEqual(signOf(look), '{"name":"notes"}');
    assert.strictEqual(signOf(look), signOf(look));
  });
});
