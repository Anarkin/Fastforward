import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import { noFilter } from '../../../../../lib/shared/filter';
import {
  parentRow,
  rowsOf,
  type Row,
} from '../../../../../tools/commander/page/listing';
import type {
  LineSettings,
  LineState,
} from '../../../../../tools/commander/page/lineLooks';
import { tileLookOf } from '../../../../../tools/commander/page/tileLooks';
import { plainFilter } from '../../../../helpers/filters';

const settings: LineSettings = {
  fileColors: fileColorsOf([
    { extensions: ['png'], colors: { light: 'red', dark: 'red' } },
  ]),
  gitMissing: false,
  dateFormat: 'YYYY-MM-DD',
  filter: noFilter,
};

const resting: LineState = {
  selected: false,
  marked: false,
  startsGroup: false,
  dropTarget: false,
};

const entry = (name: string, folder = false, extra: object = {}) => ({
  name,
  folder,
  link: false,
  hidden: false,
  size: folder ? undefined : 2048,
  modified: 0,
  ...extra,
});

const rows = rowsOf(
  [
    entry('docs', true),
    entry('photo.png', false, { hidden: true }),
    entry('logo.svg'),
    entry('notes.txt'),
  ],
  false,
  true,
  { column: 'name', descending: false, groupByColor: false },
  new Set(),
);

const rowOf = (name: string): Row => {
  const found = rows.find((row) => row.key === name);
  assert.ok(found, name);
  return found;
};

suite('Commander tiles', () => {
  test('draws the name of a tile as the part of a path, in the class and the color of its file, its base apart from its extension so the base alone is cut short', () => {
    const photo = tileLookOf(rowOf('photo.png'), resting, settings);
    assert.deepStrictEqual(
      [photo.base, photo.extension, photo.nameClass, photo.nameColor],
      ['photo', '.png', 'path-part colored hidden', 'light-dark(red, red)'],
    );
    assert.deepStrictEqual(
      [
        tileLookOf(rowOf('docs'), resting, settings).extension,
        tileLookOf(parentRow, resting, settings).base,
      ],
      ['', '..'],
    );
  });

  test('shows a thumbnail of a raster image and an SVG as it is, and an icon of every other file and of a folder', () => {
    assert.deepStrictEqual(
      ['photo.png', 'logo.svg', 'notes.txt', 'docs'].map(
        (name) => tileLookOf(rowOf(name), resting, settings).image,
      ),
      ['raster', 'vector', undefined, undefined],
    );
  });

  test('marks what the filter found in the base and the extension of a name', () => {
    const found = tileLookOf(rowOf('notes.txt'), resting, {
      ...settings,
      filter: plainFilter('tes.t'),
    });
    assert.deepStrictEqual(
      [found.baseFound, found.extensionFound],
      [[{ start: 2, end: 5 }], [{ start: 0, end: 2 }]],
    );
  });

  test('names in its classes a tile selected, marked and hidden, which the canvas draws as the stylesheet colors a tile', () => {
    assert.strictEqual(
      tileLookOf(
        rowOf('photo.png'),
        { ...resting, selected: true, marked: true },
        settings,
      ).classes,
      'row commander-row selected marked hidden colored file-color-0 commander-tile',
    );
  });
});
