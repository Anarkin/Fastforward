import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import {
  chosenKeys,
  goesInto,
  opens,
  passedKeys,
  pointedKeys,
  rangeKeys,
} from '../../../../../tools/commander/page/rowKeys';
import { defaultSort, entry, folder } from './listingFixtures';

suite('Commander row keys', () => {
  test('opens the parent, folders and files, but goes from the filter only into the parent and folders', () => {
    const [parent, src, file] = rowsOf(
      [folder('src'), entry('a.txt')],
      true,
      true,
      defaultSort,
    );
    assert.deepStrictEqual(
      [opens(parent), opens(src), opens(file), opens(undefined)],
      [true, true, true, false],
    );
    assert.deepStrictEqual(
      [goesInto(parent), goesInto(src), goesInto(file), goesInto(undefined)],
      [true, true, false, false],
    );
  });

  test('takes the rows passed moving from one row to another, the row moved from among them, the one moved to not', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((key) => ({
      key,
      entry: undefined,
      base: key,
      extension: '',
      repository: false,
    }));
    assert.deepStrictEqual(passedKeys(rows, 1, 3), ['b', 'c']);
    assert.deepStrictEqual(passedKeys(rows, 3, 1), ['d', 'c']);
    assert.deepStrictEqual(passedKeys(rows, 4, 4), ['e']);
  });

  test('takes the rows from one row to another, both among them, either way', () => {
    const rows = ['a', 'b', 'c', 'd'].map((key) => ({
      key,
      entry: undefined,
      base: key,
      extension: '',
      repository: false,
    }));
    assert.deepStrictEqual(rangeKeys(rows, 1, 3), ['b', 'c', 'd']);
    assert.deepStrictEqual(rangeKeys(rows, 2, 0), ['a', 'b', 'c']);
  });

  test('points at every file marked when one marked is clicked or dragged, in the order listed, for its menu of the system or to drag them, at the one alone otherwise, and at none for ..', () => {
    const rows = [
      {
        key: '..',
        entry: undefined,
        base: '..',
        extension: '',
        repository: false,
      },
      ...['a', 'b', 'c', 'd'].map((key) => ({
        key,
        entry: entry(key),
        base: key,
        extension: '',
        repository: false,
      })),
    ];
    const marked = new Set(['d', 'b']);

    assert.deepStrictEqual(pointedKeys(rows, 'd', marked), ['b', 'd']);
    assert.deepStrictEqual(pointedKeys(rows, 'c', marked), ['c']);
    assert.deepStrictEqual(pointedKeys(rows, 'a', undefined), ['a']);
    assert.deepStrictEqual(pointedKeys(rows, '..', marked), []);
    assert.deepStrictEqual(pointedKeys(rows, 'gone', marked), []);
  });

  test('deletes every file marked, in the order listed, wherever the selection is, and the selected one alone when none is marked, never ..', () => {
    const rows = [
      {
        key: '..',
        entry: undefined,
        base: '..',
        extension: '',
        repository: false,
      },
      ...['a', 'b', 'c', 'd'].map((key) => ({
        key,
        entry: entry(key),
        base: key,
        extension: '',
        repository: false,
      })),
    ];
    const marked = new Set(['d', 'b']);

    assert.deepStrictEqual(chosenKeys(rows, 'c', marked), ['b', 'd']);
    assert.deepStrictEqual(chosenKeys(rows, '..', marked), ['b', 'd']);
    assert.deepStrictEqual(chosenKeys(rows, 'a', new Set()), ['a']);
    assert.deepStrictEqual(chosenKeys(rows, 'a', undefined), ['a']);
    assert.deepStrictEqual(chosenKeys(rows, '..', undefined), []);
    assert.deepStrictEqual(chosenKeys(rows, undefined, undefined), []);
  });

  test('deletes the selected file when every file marked is hidden by the filter, as Delete did nothing then', () => {
    const rows = ['a', 'b'].map((key) => ({
      key,
      entry: entry(key),
      base: key,
      extension: '',
      repository: false,
    }));

    assert.deepStrictEqual(chosenKeys(rows, 'a', new Set(['hidden'])), ['a']);
    assert.deepStrictEqual(chosenKeys(rows, 'a', new Set(['b', 'hidden'])), [
      'b',
    ]);
  });
});
