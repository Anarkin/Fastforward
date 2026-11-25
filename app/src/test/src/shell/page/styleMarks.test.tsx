import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { HighlightWords } from '../../../../lib/page/highlight';
import { KeyCombo } from '../../../../shell/page/keyCombo';
import { Name } from '../../../../lib/page/name';
import { cascaded } from '../../../helpers/cascade';
import {
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  body,
  currentMatch,
  looks,
  paddingOf,
  unwrapped,
} from './stylesheetFixtures';

const filter = plainFilter('x');

const filtered = (around: (marked: React.ReactNode) => React.ReactElement) =>
  withClass(
    rendered(around(<HighlightWords text="x" filter={filter} />)),
    'match',
  );

const found = (around: (marked: React.ReactNode) => React.ReactElement) =>
  withClass(
    rendered(around(<mark className="find-match current">x</mark>)),
    'find-match',
  );

const marks: readonly [string, MarkupElement][] = [
  [
    'the viewer',
    found((marked) => (
      <div className="viewer-rows">
        <div className="viewer-row">{marked}</div>
      </div>
    )),
  ],
  [
    'the diff',
    found((marked) => (
      <div className="diff-line">
        <span className="code">{marked}</span>
      </div>
    )),
  ],
  [
    'the rows of the commander',
    filtered((marked) => (
      <div className="row commander-row commander-line">
        <span className="commander-name">{marked}</span>
      </div>
    )),
  ],
  [
    'the thumbnails of the commander',
    filtered((marked) => (
      <div className="row commander-row commander-tile">
        <div className="commander-tile-name">
          <span className="commander-tile-base">{marked}</span>
        </div>
      </div>
    )),
  ],
  [
    'the commits',
    filtered((marked) => (
      <div className="commit">
        <div className="commit-line">
          <span className="subject">{marked}</span>
        </div>
      </div>
    )),
  ],
  [
    'the files',
    filtered((marked) => (
      <div className="row tree-row file">
        <span className="path">{marked}</span>
      </div>
    )),
  ],
  [
    'the locations',
    filtered((marked) => (
      <div className="locations-list">
        <div className="row result">{marked}</div>
      </div>
    )),
  ],
  [
    'the shortcuts',
    filtered((marked) => (
      <div className="shortcuts-popup">
        <div className="shortcut-row">
          <span>{marked}</span>
        </div>
      </div>
    )),
  ],
  [
    'a menu',
    filtered((marked) => (
      <div className="menu filtered-menu">
        <button className="menu-item">{marked}</button>
      </div>
    )),
  ],
  [
    'a name in a menu',
    withClass(
      rendered(
        <div className="menu filtered-menu">
          <button className="menu-item">
            <Name filter={filter}>x</Name>
          </button>
        </div>,
      ),
      'match',
    ),
  ],
];

function fontOf(element: MarkupElement): string {
  for (
    let current: MarkupElement | undefined = element;
    current;
    current = current.parent
  ) {
    const family = cascaded(current, 'font-family');
    if (family !== undefined) {
      return family;
    }
  }
  return 'var(--font-family)';
}

const textHeights: Readonly<Record<string, string>> = {
  'var(--font-family)': 'var(--text-height, 1lh)',
  'var(--monospace-font-family)': 'var(--monospace-text-height, 1lh)',
};

const unwrappedLooks = (
  element: MarkupElement,
  expected: Readonly<Record<string, string | undefined>>,
  what: string,
) =>
  assert.deepStrictEqual(
    Object.fromEntries(
      Object.keys(expected).map((property) => {
        const value = cascaded(element, property);
        return [property, value === undefined ? value : unwrapped(value)];
      }),
    ),
    expected,
    what,
  );

suite('Style', () => {
  test('pads every mark of a find and of a filter up to the top and down to the bottom of its line, by the leading of the font it marks, which the page measures, halved down to a device pixel above as Chromium sets the text in its line, and a 256th of a device pixel more, as Chromium cuts a padding down to a 64th of one where the arithmetic falls a hair short, so the mark fills the very rows of device pixels the selection and the cursor fill, in the viewer, the diff, the commander, the commits, the files, the locations, the shortcuts and the menus, while its padding makes no line taller and no text wider', () => {
    for (const [where, mark] of marks) {
      unwrappedLooks(
        mark,
        {
          '--mark-text-height': textHeights[fontOf(mark)],
          '--mark-leading': 'max(0px, 1lh - var(--mark-text-height))',
          '--mark-slack': 'calc(var(--device-pixel, 1px) / 256)',
          '--mark-above':
            'round(down, var(--mark-leading) / 2 + var(--mark-slack), var(--device-pixel, 1px))',
          'padding-top':
            'calc(var(--mark-above) + var(--mark-reach, 0px) + var(--mark-slack))',
          'padding-bottom':
            'calc(var(--mark-leading) - var(--mark-above) + var(--mark-reach, 0px) + var(--mark-slack))',
          padding: undefined,
          display: undefined,
          'line-height': undefined,
        },
        where,
      );
    }
    assert.deepStrictEqual(
      [...new Set(marks.map(([, mark]) => fontOf(mark)))].toSorted(),
      Object.keys(textHeights).toSorted(),
    );
  });

  test('draws a mark in a menu as tall as its item, whose line is the item, with no padding above or below it, as a mark in a row of the commander is as tall as the row', () => {
    for (const where of ['a menu', 'a name in a menu']) {
      const mark = marks.find(([name]) => name === where)?.[1];
      assert.ok(mark);
      let item = mark.parent;
      while (item && !item.classes.includes('menu-item')) {
        item = item.parent;
      }
      assert.ok(item);
      looks(item, {
        height: 'var(--menu-item-height)',
        'line-height': 'var(--menu-item-height)',
      });
      const { top, bottom } = paddingOf(item);
      assert.deepStrictEqual([top, bottom], ['0', '0']);
    }
    for (const [, mark] of marks) {
      looks(mark, { '--mark-reach': undefined });
    }
  });

  test('fills the current match in the blue of the cursor with its white text, the colors of a current match in the theme, as an orange beside the yellow of the other matches was hardly told from it, and with no edge, which was hardly seen, so it stands apart from the yellow of the other matches at a glance', () => {
    const current = marks.filter(([, mark]) =>
      mark.classes.includes('current'),
    );
    assert.strictEqual(current.length, 2);
    for (const [, mark] of current) {
      looks(mark, currentMatch);
    }
  });

  test('colors the text between the tokens of a line that took the color of most of its tokens for its own in the color text has in no token, the one the app draws its text in, so a line drawn with fewer elements looks as it did', () => {
    assert.strictEqual(cascaded(body, 'color'), 'var(--color-foreground)');
    const plain = <span className="syntax-plain">a</span>;
    for (const shown of [
      <div key="diff" className="diff-view">
        <div className="diff-line">
          <span className="code syntax-keyword">{plain}</span>
        </div>
      </div>,
      <div key="viewer" className="viewer-rows">
        <div className="viewer-row syntax-keyword">{plain}</div>
      </div>,
      <div key="editor" className="editor-surface">
        <div className="editor-cells">
          <div className="editor-row syntax-keyword">{plain}</div>
        </div>
      </div>,
    ]) {
      const line = rendered(shown);
      assert.strictEqual(
        cascaded(withClass(line, 'syntax-keyword'), 'color'),
        'var(--color-syntax-keyword)',
      );
      assert.strictEqual(
        cascaded(withClass(line, 'syntax-plain'), 'color'),
        'var(--color-foreground)',
      );
    }
  });

  test('marks the occurrences of the text selected in the viewer and the diff as the editor marks its own, in the yellow of a find match at the share the theme gives such marks, the whole of it by default, and in its text color, padded as a find match there', () => {
    const padded = [
      '--mark-text-height',
      '--mark-leading',
      '--mark-above',
      'padding-top',
      'padding-bottom',
    ];
    for (const around of [
      (marked: React.ReactNode) => (
        <div className="viewer-rows">
          <div className="viewer-row">{marked}</div>
        </div>
      ),
      (marked: React.ReactNode) => (
        <div className="diff-view">
          <div className="diff-line">
            <span className="code">{marked}</span>
          </div>
        </div>
      ),
    ]) {
      const occurrence = withClass(
        rendered(around(<mark className="occurrence-match">x</mark>)),
        'occurrence-match',
      );
      const match = withClass(
        rendered(around(<mark className="find-match">x</mark>)),
        'find-match',
      );
      assert.deepStrictEqual(
        Object.fromEntries(
          [...padded, 'color', 'background'].map((property) => [
            property,
            cascaded(occurrence, property),
          ]),
        ),
        {
          ...Object.fromEntries(
            padded.map((property) => [property, cascaded(match, property)]),
          ),
          color: 'var(--color-search-match-foreground)',
          background:
            'color-mix( in srgb, var(--color-search-match) var(--color-search-match-implicit), transparent )',
        },
      );
    }
  });

  test('leaves the keys of a shortcut F1 found unpadded, as each is a box of its own as tall as its line', () => {
    looks(
      withClass(
        rendered(
          <div className="shortcuts-popup">
            <KeyCombo keys="F1" matched={new Set(['f1'])} />
          </div>,
        ),
        'match',
      ),
      { 'padding-top': undefined, 'padding-bottom': undefined },
    );
  });
});
