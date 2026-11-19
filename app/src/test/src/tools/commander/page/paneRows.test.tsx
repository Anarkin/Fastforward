import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import { formatDate } from '../../../../../lib/page/dates';
import { noFilter } from '../../../../../lib/shared/filter';
import { strings } from '../../../../../lib/shared/strings';
import { iconWait } from '../../../../../tools/commander/page/iconAsks';
import {
  parentRow,
  rowsOf,
  type Row,
} from '../../../../../tools/commander/page/listing';
import {
  PaneLine,
  type PaneLook,
} from '../../../../../tools/commander/page/paneRows';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { withStores } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { plainFilter } from '../../../../helpers/filters';

const tab = String.fromCharCode(9);

const dateFormat = 'YYYY-MM-DD HH:mm';

const date = formatDate(0, dateFormat);

const look: PaneLook = {
  tab: '1',
  folder: '/work',
  fileColors: fileColorsOf([
    { extensions: ['exe'], colors: { light: 'red', dark: 'red' } },
    { extensions: ['txt'], colors: { light: 'blue', dark: 'cyan' } },
  ]),
  gitMissing: false,
  columns: { extension: 5, size: 9, date: 16 },
  room: { name: 20, extension: 5, size: 9, date: 16 },
  dateFormat,
  filter: noFilter,
};

const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

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
    entry('other.txt'),
    entry('tool.exe', false, { hidden: true }),
    entry(`${'n'.repeat(21)}.txt`),
    entry('日本.txt'),
    entry('x.appinstaller'),
    entry('plain'),
  ],
  false,
  true,
  sort,
  new Set(['repo']),
);

const rowOf = (name: string): Row => {
  const found = rows.find((row) => row.key === name);
  assert.ok(found, name);
  return found;
};

const line = (
  row: Row,
  given: Partial<PaneLook> = {},
  state: { selected?: boolean; marked?: boolean; startsGroup?: boolean } = {},
) => (
  <PaneLine
    side="left"
    row={row}
    index={0}
    look={{ ...look, ...given }}
    selected={state.selected === true}
    marked={state.marked === true}
    startsGroup={state.startsGroup === true}
    dropTarget={false}
    pairsClick={() => false}
    onMenu={noop}
  />
);

const drawn = (...given: Parameters<typeof line>) =>
  renderToStaticMarkup(withStores(line(...given)));

const rest = (extension: string, size: string) =>
  `${extension.padEnd(5)}  ${size.padStart(9)}  ${date}`;

const stayed = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, iconWait + 30);
      }),
  );

suite('Commander rows', () => {
  test('draws a file, a folder and the parent folder each as one element holding one text, the name of a folder in its brackets, with the color of its group as a class, its generic icon as another and nothing for its box, so a row of a list scrolled is one box to style, lay out and paint rather than ten', () => {
    assert.strictEqual(
      drawn(rowOf('notes.txt')),
      `<div class="row commander-row colored file-color-1 commander-line generic-file plain" draggable="true">notes${tab}${rest('txt', '12,288')}</div>`,
    );
    assert.strictEqual(
      drawn(rowOf('tool.exe'), {}, { selected: true, marked: true }),
      `<div class="row commander-row selected marked hidden colored file-color-0 commander-line generic-file plain" draggable="true">tool${tab}${rest('exe', '12,288')}</div>`,
    );
    assert.strictEqual(
      drawn(rowOf('plain'), {}, { startsGroup: true }),
      `<div class="row commander-row group-start commander-line generic-file plain" draggable="true">plain${tab}${rest('', '12,288')}</div>`,
    );
    assert.strictEqual(
      drawn(rowOf('docs')),
      `<div class="row commander-row commander-folder commander-line generic-folder plain" data-drop="docs" draggable="true">[docs]${tab}${rest('', '')}</div>`,
    );
    assert.strictEqual(
      drawn(parentRow),
      '<div class="row commander-row commander-folder commander-line generic-folder up plain" data-drop=".." draggable="false">[..]</div>',
    );
  });

  test('draws a row with a cell for each column where one text can not show it: a name longer than its column or with characters of another width, an extension longer than its column, a word the filter marks, the git icon of a repository, a size still counted or with a note, and every row until the side has measured the room of its names', () => {
    const celled = (...given: Parameters<typeof line>) => {
      const markup = drawn(...given);
      return {
        plain: / plain"/.test(markup),
        cells: [...markup.matchAll(/<span class="(commander-[a-z]+)/g)].map(
          (match) => match[1],
        ),
        marks: [...markup.matchAll(/<mark class="match">([^<]*)</g)].map(
          (match) => match[1],
        ),
      };
    };
    const cells = [
      'commander-name',
      'commander-extension',
      'commander-size',
      'commander-date',
    ];
    for (const name of [
      `${'n'.repeat(21)}.txt`,
      '日本.txt',
      'x.appinstaller',
      'repo',
      'counted',
      'unread',
    ]) {
      assert.deepStrictEqual(
        celled(rowOf(name)),
        { plain: false, cells, marks: [] },
        name,
      );
    }
    assert.deepStrictEqual(
      celled(rowOf('notes.txt'), { room: { ...look.room, name: undefined } }),
      { plain: false, cells, marks: [] },
    );
    assert.deepStrictEqual(
      celled(rowOf('notes.txt'), { filter: plainFilter('ote tx') }),
      { plain: false, cells, marks: ['ote', 'tx'] },
    );
    assert.deepStrictEqual(
      celled(rowOf('other.txt'), { filter: plainFilter('notes') }),
      { plain: true, cells: [], marks: [] },
    );
    assert.match(
      drawn(rowOf('repo')),
      new RegExp(
        `^<div class="row commander-row commander-folder commander-line generic-folder" data-drop="repo" draggable="true"><span class="commander-name">repo</span><span class="commander-extension cut"><button class="commander-mark" title="${strings.commander.openRepository}"`,
      ),
    );
    assert.deepStrictEqual(celled(rowOf('repo'), { gitMissing: true }), {
      plain: true,
      cells: [],
      marks: [],
    });
  });

  test('keeps the generic icon of a file behind its row until the icon of the file has come, puts it back once that fails, and starts anew for the file the element of a row is given next, so a list that writes its rows into the elements of those it left shows no file the icon of another', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const commander = createCommanderStore(noop);
      const show = (row: Row) =>
        act(async () => {
          root.render(withStores(line(row), { commander }));
        });
      const shown = () => {
        const element = main.querySelector('.commander-row');
        const image = element?.querySelector('img');
        return {
          element,
          generic: element?.classList.contains('generic-file'),
          text: element?.textContent?.split(tab)[0],
          image:
            image === null || image === undefined
              ? undefined
              : `${new URL(image.getAttribute('src') ?? '', 'fastforward://app').searchParams.get('name') ?? ''}${image.classList.contains('loading') ? ' loading' : ''}`,
        };
      };
      const tell = (type: string) =>
        act(async () => {
          main.querySelector('img')?.dispatchEvent(new dom.window.Event(type));
        });

      await show(rowOf('notes.txt'));
      const first = shown();
      assert.deepStrictEqual(
        [first.generic, first.text, first.image],
        [true, 'notes', undefined],
      );
      await stayed();
      assert.deepStrictEqual(
        [shown().generic, shown().image],
        [true, 'notes.txt loading'],
      );
      await tell('load');
      assert.deepStrictEqual(
        [shown().generic, shown().image],
        [false, 'notes.txt'],
      );

      await show(rowOf('other.txt'));
      const next = shown();
      assert.strictEqual(next.element, first.element);
      assert.deepStrictEqual(
        [next.generic, next.text, next.image],
        [true, 'other', undefined],
      );
      await stayed();
      assert.deepStrictEqual(
        [shown().generic, shown().image],
        [true, 'other.txt loading'],
      );
      await tell('error');
      assert.deepStrictEqual(
        [shown().generic, shown().image],
        [true, undefined],
      );

      await show(rowOf('notes.txt'));
      assert.deepStrictEqual(
        [shown().element === first.element, shown().generic, shown().image],
        [true, false, 'notes.txt'],
      );
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
