import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { HighlightWords } from '../../../../lib/page/highlight';
import { KeyCombo } from '../../../../lib/page/keyCombo';
import { Name } from '../../../../lib/page/name';
import { cascaded } from '../../../helpers/cascade';
import {
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  currentMatchOutline,
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
    'the editor',
    withClass(
      rendered(
        <div className="cm-editor editor-text">
          <div className="cm-scroller">
            <div className="cm-content">
              <div className="cm-line">
                <span className="find-match">x</span>
              </div>
            </div>
          </div>
        </div>,
      ),
      'find-match',
    ),
  ],
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

const editorBracket = (classes: string) =>
  withClass(
    rendered(
      <div className="cm-editor editor-text cm-focused">
        <div className="cm-scroller">
          <div className="cm-content">
            <div className="cm-line">
              <span className={classes}>(</span>
            </div>
          </div>
        </div>
      </div>,
    ),
    classes,
  );

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
  test('pads every mark of a find and of a filter up to the top and down to the bottom of its line, by the leading of the font it marks, which the page measures, halved down to a device pixel above as Chromium sets the text in its line, or halved exactly in the editor, whose cursor and selection center their row on the text, half a device pixel above the line where the leading is an odd number of them, and a 256th of a device pixel more, as Chromium cuts a padding down to a 64th of one where the arithmetic falls a hair short, so the mark fills the very rows of device pixels the selection and the cursor fill, in the editor, the viewer, the diff, the commander, the commits, the files, the locations, the shortcuts and the menus, while its padding makes no line taller and no text wider', () => {
    for (const [where, mark] of marks) {
      unwrappedLooks(
        mark,
        {
          '--mark-text-height': textHeights[fontOf(mark)],
          '--mark-leading': 'max(0px, 1lh - var(--mark-text-height))',
          '--mark-slack': 'calc(var(--device-pixel, 1px) / 256)',
          '--mark-above':
            where === 'the editor'
              ? 'calc(var(--mark-leading) / 2)'
              : 'round(down, var(--mark-leading) / 2 + var(--mark-slack), var(--device-pixel, 1px))',
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

  test('reaches a mark in a menu out to the edges of its item, by the padding of the item, so it is as tall as the item shows itself chosen, as a mark in a row of the commander is as tall as the row', () => {
    for (const where of ['a menu', 'a name in a menu']) {
      const mark = marks.find(([name]) => name === where)?.[1];
      assert.ok(mark);
      let item = mark.parent;
      while (item && !item.classes.includes('menu-item')) {
        item = item.parent;
      }
      assert.ok(item);
      const { top, bottom } = paddingOf(item);
      assert.strictEqual(top, bottom);
      looks(mark, { '--mark-reach': top });
    }
    for (const [where, mark] of marks) {
      if (!where.includes('menu')) {
        looks(mark, { '--mark-reach': undefined });
      }
    }
  });

  test('outlines the current match inside its line, at the top and the bottom rows of device pixels the mark fills, and beside it, as before, so neither the next line nor a side clipping its code hides the outline', () => {
    const current = marks.filter(([, mark]) =>
      mark.classes.includes('current'),
    );
    assert.strictEqual(current.length, 2);
    for (const [, mark] of current) {
      looks(mark, { 'box-shadow': currentMatchOutline });
    }
  });

  test('marks what the editor marks on its own, a bracket it matches and the copies of the word at the cursor or of the text selected, alike, padded as a find match over the rows of device pixels the cursor fills, so the cursor standing on one covers its mark whole, in the yellow of a find match at the share the theme gives such marks and see-through, so a find match stays the one mark in full yellow and the text keeps the color of its syntax, and leaves a bracket that matches none as it is', () => {
    const match = marks.find(([where]) => where === 'the editor')?.[1];
    assert.ok(match, 'no find match in the editor');
    const padded = [
      '--mark-text-height',
      '--mark-leading',
      '--mark-slack',
      '--mark-above',
      'padding-top',
      'padding-bottom',
      'padding-left',
      'padding-right',
    ];
    const looked = [...padded, 'color', 'background', 'box-shadow'];
    const lookOf = (element: MarkupElement) =>
      Object.fromEntries(
        looked.map((property) => [property, cascaded(element, property)]),
      );
    const implicit = {
      ...Object.fromEntries(
        padded.map((property) => [property, cascaded(match, property)]),
      ),
      color: undefined,
      background:
        'color-mix( in srgb, var(--color-search-match) var(--color-search-match-implicit), transparent )',
      'box-shadow': undefined,
    };
    assert.deepStrictEqual(
      lookOf(editorBracket('cm-matchingBracket')),
      implicit,
    );
    assert.deepStrictEqual(lookOf(editorBracket('occurrence-match')), implicit);
    assert.deepStrictEqual(
      lookOf(editorBracket('cm-nonmatchingBracket')),
      Object.fromEntries(looked.map((property) => [property, undefined])),
    );
    for (const mark of ['cm-matchingBracket', 'occurrence-match']) {
      const colored = withClass(
        rendered(
          <div className="cm-editor editor-text cm-focused">
            <div className="cm-scroller">
              <div className="cm-content">
                <div className="cm-line">
                  <span className={mark}>
                    <span className="syntax-keyword">(</span>
                  </span>
                </div>
              </div>
            </div>
          </div>,
        ),
        'syntax-keyword',
      );
      assert.strictEqual(
        cascaded(colored, 'color'),
        'var(--color-syntax-keyword)',
        mark,
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
