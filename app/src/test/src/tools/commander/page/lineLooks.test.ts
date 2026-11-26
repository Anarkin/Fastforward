import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import { formatDate } from '../../../../../lib/page/dates';
import { noFilter } from '../../../../../lib/shared/filter';
import {
  flatRowOf,
  parentRow,
  rowsOf,
  type Row,
} from '../../../../../tools/commander/page/listing';
import {
  lineLookOf,
  type LineSettings,
  type LineState,
} from '../../../../../tools/commander/page/lineLooks';
import { plainFilter } from '../../../../helpers/filters';

const dateFormat = 'YYYY-MM-DD HH:mm';

const settings: LineSettings = {
  fileColors: fileColorsOf([
    { extensions: ['exe'], colors: { light: 'red', dark: 'red' } },
    { extensions: ['txt'], colors: { light: 'blue', dark: 'cyan' } },
  ]),
  gitMissing: false,
  dateFormat,
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
  size: folder ? undefined : 12_288,
  modified: 0,
  ...extra,
});

const rows = rowsOf(
  [
    entry('docs', true),
    entry('repo', true),
    entry('counted', true, { size: 5, counting: true }),
    entry('unread', true, { size: 5, unreadFolders: 2 }),
    entry('notes.txt'),
    entry('tool.exe', false, { hidden: true }),
  ],
  false,
  true,
  { column: 'name', descending: false, groupByColor: false },
  new Set(['repo']),
);

const rowOf = (name: string): Row => {
  const found = rows.find((row) => row.key === name);
  assert.ok(found, name);
  return found;
};

const look = (
  row: Row,
  state: Partial<LineState> = {},
  given: Partial<LineSettings> = {},
) => lineLookOf(row, { ...resting, ...state }, { ...settings, ...given });

suite('Commander lines', () => {
  test('draws a file with its name, extension, size and date in the classes the look of its row is read from, the color of its group among them, a folder with its name in brackets and the parent folder as up', () => {
    const date = formatDate(0, dateFormat);
    assert.deepStrictEqual(look(rowOf('notes.txt')), {
      key: 'notes.txt',
      classes: 'row commander-row colored file-color-1 commander-line',
      up: false,
      folder: false,
      name: 'notes',
      extension: 'txt',
      size: '12,288',
      date,
      nameFound: [],
      extensionFound: [],
      counting: false,
      repository: false,
    });
    assert.deepStrictEqual(
      [
        look(rowOf('docs')).name,
        look(rowOf('docs')).classes,
        look(parentRow).name,
        look(parentRow).classes,
      ],
      [
        '[docs]',
        'row commander-row commander-folder commander-line',
        '[..]',
        'row commander-row commander-folder commander-line up',
      ],
    );
  });

  test('names in its classes a row selected, marked, hidden, dropped on and starting a group of duplicates, which the canvas draws as the stylesheet colors them', () => {
    assert.strictEqual(
      look(rowOf('tool.exe'), {
        selected: true,
        marked: true,
        startsGroup: true,
        dropTarget: true,
      }).classes,
      'row commander-row selected marked hidden drop-target colored file-color-0 group-start commander-line',
    );
  });

  test('marks what the filter found in the name and the extension, past the bracket of a folder', () => {
    const filter = plainFilter('ote tx oc');
    assert.deepStrictEqual(
      [
        look(rowOf('notes.txt'), {}, { filter }),
        look(rowOf('docs'), {}, { filter }),
      ].map(({ nameFound, extensionFound }) => [nameFound, extensionFound]),
      [
        [[{ start: 1, end: 4 }], [{ start: 0, end: 2 }]],
        [[{ start: 2, end: 4 }], []],
      ],
    );
  });

  test('shows the git icon of a repository in place of its extension while git is there, and a size still counted dimmed', () => {
    assert.deepStrictEqual(
      [
        look(rowOf('repo')).repository,
        look(rowOf('repo'), {}, { gitMissing: true }).repository,
        look(rowOf('counted')).counting,
      ],
      [true, false, true],
    );
  });

  test('shows the name of a file under the side without the folder it is in, so the names line up', () => {
    assert.strictEqual(look(flatRowOf(entry('a.txt'), 'sub/')).name, 'a');
  });
});
