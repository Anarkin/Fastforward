import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { PathTitle } from '../../../tools/commander/page/pathTitle';
import {
  cascaded,
  rendered,
  withClass,
  type States,
} from '../../support/cascade';
import { defaultSettings } from '../../support/fixtures';
import {
  css,
  compact,
  looks,
  checkBox,
  after,
  commanderIconDisplay,
  commanderRowColor,
  commanderItem,
  pathColors,
} from './stylesheetFixtures';

const parts = (className: string, pointed = false) => {
  const item = commanderItem(className);
  const states: States = pointed ? { hover: item } : {};
  const box = withClass(item, 'check-box');
  return {
    box: cascaded(withClass(item, 'commander-check'), 'visibility', states),
    frame: ['background', 'border-color'].map((property) =>
      cascaded(box, property, states),
    ),
    check: cascaded(box, 'content', {
      ...states,
      pseudoElement: '::after',
    }),
  };
};

suite('Style', () => {
  test('keeps the columns of the commander clear of the scrollbar drawn over its right edge, whatever its size and the font, two characters apart, the handle resizing a column in the middle of the gap before it', () => {
    for (const className of [
      'commander-line commander-header',
      'row commander-row commander-line',
      'row commander-row selected commander-line',
    ]) {
      looks(rendered(createElement('div', { className })), {
        padding:
          '0 calc(8px + var(--scrollbar-size)) 0 var(--commander-row-start)',
        'column-gap': 'var(--commander-gap)',
      });
    }
    assert.match(
      css,
      /--commander-gap: calc\(2 \* var\(--commander-advance\)\);/,
    );
    looks(rendered(createElement('div', { className: 'column-handle' })), {
      left: 'calc(var(--commander-gap) / -2 - 4px)',
    });
    assert.strictEqual(defaultSettings().tools.commander.columns.date, 16);
  });

  test('keeps the name of the commander one character after its icon, as the icon is not a column to stand apart from', () => {
    for (const className of [
      'commander-line commander-header',
      'row commander-row commander-line',
    ]) {
      looks(
        withClass(
          rendered(
            createElement(
              'div',
              { className },
              createElement('span', { className: 'commander-icon' }),
              createElement('span', { className: 'commander-name' }),
            ),
          ),
          'commander-name',
        ),
        {
          'margin-left':
            'calc(var(--commander-advance) - var(--commander-gap))',
        },
      );
    }
  });

  test('hides the icon of a file of the commander while it loads, the generic one standing in for it, and shows it once it came', () => {
    assert.strictEqual(commanderIconDisplay('system-icon loading'), 'none');
    assert.notStrictEqual(commanderIconDisplay('system-icon'), 'none');
  });

  test('colors the files of the commander with the color of their group, the selected and the marked rows too, at the weight of the others, dimming hidden rows in their own color', () => {
    assert.strictEqual(commanderRowColor('colored'), 'var(--file-color)');
    assert.strictEqual(
      commanderRowColor('selected colored'),
      'var(--file-color)',
    );
    assert.strictEqual(
      commanderRowColor('hidden colored'),
      'color-mix( in srgb, var(--file-color, var(--color-foreground)) var(--color-hidden-file), transparent )',
    );
    assert.strictEqual(
      commanderRowColor('marked colored'),
      'var(--file-color)',
    );
    assert.strictEqual(
      cascaded(commanderItem('commander-line marked colored'), 'font-weight'),
      undefined,
    );
  });

  test('leaves room before the icon of every row of the commander, and of its header, for the box of a mark, so nothing moves as the first file is marked', () => {
    const commander = rendered(
      createElement('div', { className: 'commander' }),
    );
    looks(commander, {
      '--commander-check': '12px',
      '--commander-check-start': '4px',
    });
    assert.strictEqual(
      compact(cascaded(commander, '--commander-row-start')),
      'calc(var(--commander-check-start) + var(--commander-check) + 6px)',
    );
    looks(withClass(commanderItem('commander-line'), 'commander-check'), {
      position: 'absolute',
      top: 'calc((var(--commander-row-height) - var(--commander-check)) / 2)',
      left: 'var(--commander-check-start)',
      width: 'var(--commander-check)',
      height: 'var(--commander-check)',
    });
    looks(commanderItem('commander-line'), { position: 'relative' });
  });

  test('shows the box of a mark of the commander empty under the pointer and checked once the file is marked, filled in the color of the text with the check in the color of the panel, and none otherwise', () => {
    assert.deepStrictEqual(parts('commander-line'), {
      box: 'hidden',
      frame: [undefined, 'var(--muted-foreground)'],
      check: undefined,
    });
    assert.deepStrictEqual(parts('commander-line', true), {
      box: 'visible',
      frame: [undefined, 'var(--muted-foreground)'],
      check: undefined,
    });
    assert.deepStrictEqual(parts('commander-line marked'), {
      box: 'visible',
      frame: ['var(--color-foreground)', 'var(--color-foreground)'],
      check: "''",
    });
    looks(
      withClass(commanderItem('commander-line marked'), 'check-box'),
      { background: 'var(--color-panel-background)' },
      after,
    );
  });

  test('draws a check box of a dialog or of a Markdown task as the commander draws its own, a frame in the muted color filled in the color of the text with the check in the color of the panel once checked, rather than as the browser does', () => {
    const own = commanderItem('commander-line marked');
    for (const property of ['appearance', 'width', 'height', 'margin']) {
      assert.ok(cascaded(checkBox(false), property) !== undefined, property);
    }
    looks(checkBox(false), {
      appearance: 'none',
      'border-color': cascaded(
        withClass(commanderItem('commander-line'), 'check-box'),
        'border-color',
      ),
      'border-radius': cascaded(withClass(own, 'check-box'), 'border-radius'),
      width: 'var(--check-size)',
      margin: '0',
    });
    looks(checkBox(true), {
      background: cascaded(withClass(own, 'check-box'), 'background'),
      'border-color': cascaded(withClass(own, 'check-box'), 'border-color'),
    });
    looks(checkBox(true), { content: "''" }, after);
    looks(checkBox(false), { content: undefined }, after);
    for (const property of ['background', 'mask', 'inset']) {
      assert.strictEqual(
        cascaded(checkBox(true), property, after),
        cascaded(withClass(own, 'check-box'), property, after),
        property,
      );
    }
  });

  test('washes a marked row of the commander light gray, the text mixed into the panel by the share the theme gives marked files, under the tint of the pointer or of the selection as any row, and keeps the wash where a side without focus drops the tint of its selection', () => {
    const commander = rendered(
      createElement('div', { className: 'commander' }),
    );
    assert.strictEqual(
      compact(cascaded(commander, '--marked-background')),
      'color-mix(in srgb, var(--color-foreground) var(--color-marked-file), var(--color-panel-background))',
    );
    assert.strictEqual(
      compact(cascaded(commander, '--selection-tint')),
      'color-mix(in srgb, var(--color-focus) var(--color-focus-selected), transparent)',
    );
    for (const layout of ['commander-line', 'commander-tile']) {
      const marked = commanderItem(`${layout} marked`);
      looks(marked, { background: 'var(--marked-background)' });
      looks(
        marked,
        {
          background:
            'linear-gradient(var(--hover-background), var(--hover-background)), var(--marked-background)',
        },
        { hover: marked },
      );
      looks(commanderItem(`${layout} marked selected`), {
        background:
          'linear-gradient(var(--selection-tint), var(--selection-tint)), var(--marked-background)',
      });
      looks(
        commanderItem(`${layout} marked selected`, 'commander-pane inactive'),
        { background: 'var(--marked-background)' },
      );
      looks(commanderItem(`${layout} selected`, 'commander-pane inactive'), {
        background: 'none',
      });
    }
  });

  test('puts the box of a mark of the commander in the top left corner of a thumbnail, ringed in the color of the panel and empty on it, so it shows over any image', () => {
    const tile = commanderItem('commander-tile');
    looks(tile, { position: 'relative' });
    looks(withClass(tile, 'commander-check'), {
      top: '4px',
      left: '4px',
      width: '16px',
      height: '16px',
      'border-radius': '3px',
      'box-shadow': '0 0 0 var(--hairline) var(--color-panel-background)',
    });
    looks(withClass(tile, 'check-box'), {
      background: 'var(--color-panel-background)',
      'border-radius': '3px',
    });
    looks(withClass(commanderItem('commander-tile marked'), 'check-box'), {
      background: 'var(--color-foreground)',
    });
  });

  test('draws a line above the first file of each group of duplicates inside its row, so every row keeps its height, and names the view after the path in the muted color', () => {
    looks(
      rendered(
        createElement('div', {
          className: 'row commander-row commander-line group-start',
        }),
      ),
      {
        'box-shadow': 'inset 0 var(--hairline) 0 var(--color-border)',
        height: 'var(--commander-row-height)',
        'border-top': undefined,
      },
    );
    looks(rendered(createElement('span', { className: 'path-duplicates' })), {
      color: 'var(--muted-foreground)',
      'margin-left': 'var(--commander-advance)',
    });
  });

  test('lays the path of a commander side out as its rows are, on a line of its own with a line under it, starting where the names of the rows start and running to the end of their dates', () => {
    const line = rendered(
      createElement(
        'div',
        { className: 'commander' },
        createElement(
          'div',
          { className: 'commander-path commander-line' },
          createElement('span', { className: 'commander-icon' }),
          createElement(PathTitle, { path: 'C:/notes.txt', hidden: [] }),
        ),
      ),
    );
    looks(withClass(line, 'commander-path'), {
      display: 'grid',
      flex: 'none',
      'box-sizing': 'content-box',
      height: 'var(--commander-row-height)',
      padding:
        '0 calc(8px + var(--scrollbar-size)) 0 var(--commander-row-start)',
      'border-bottom': '1px solid var(--color-border)',
    });
    looks(withClass(line, 'path-title'), {
      'grid-column': '2 / -1',
      'margin-left': 'calc(var(--commander-advance) - var(--commander-gap))',
      'max-width': 'none',
      'justify-content': undefined,
    });
  });

  test('draws the path of a commander title in the font of its rows, each part in the color its own row has, the folders giving way to an ellipsis at their start first, and the name only once it alone is too long, leaving the folders room for their ellipsis', () => {
    const title = rendered(
      createElement(PathTitle, { path: 'C:/notes.txt', hidden: [] }),
    );
    looks(title, {
      display: 'flex',
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
    });
    looks(withClass(title, 'path-text'), {
      display: 'flex',
      flex: '0 1 auto',
      'min-width': '0',
    });
    looks(withClass(title, 'path-folder'), {
      flex: '0 1 auto',
      'min-width': '0',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      direction: 'rtl',
    });
    looks(withClass(title, 'path-end'), {
      display: 'flex',
      flex: 'none',
      'max-width': 'calc(100% - 2 * max(1ch, var(--commander-advance)))',
    });
    looks(
      withClass(
        rendered(createElement(PathTitle, { path: 'C:/', hidden: [] })),
        'path-end',
      ),
      { 'max-width': '100%' },
    );
    looks(withClass(title, 'path-name'), {
      flex: '0 1 auto',
      'min-width': '0',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    const foreground = 'var(--color-foreground)';
    const muted =
      'color-mix( in srgb, var(--file-color, var(--color-foreground)) var(--color-hidden-file), transparent )';
    assert.deepStrictEqual(
      [
        pathColors([]),
        pathColors([false, true, false], 'orange'),
        pathColors([false, false, true], 'orange'),
      ],
      [
        [foreground, undefined, undefined, undefined],
        [foreground, undefined, muted, 'var(--file-color)'],
        [foreground, undefined, undefined, muted],
      ],
    );
  });

  test('lays the rows of a file viewed with wrapping out as wide as the viewer, clipping the spaces hanging past its edge, so they never scroll it sideways, as a row ending in a run of spaces did', () => {
    looks(
      rendered(createElement('div', { className: 'viewer-rows wrapped' })),
      { width: '100%', 'overflow-x': 'clip' },
    );
    looks(rendered(createElement('div', { className: 'viewer-rows' })), {
      width: 'max-content',
      'overflow-x': undefined,
    });
  });
});
