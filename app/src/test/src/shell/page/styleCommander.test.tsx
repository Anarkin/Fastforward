import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { PathTitle } from '../../../../lib/page/pathTitle';
import { cascaded, type States } from '../../../helpers/cascade';
import { defaultSettings } from '../../../helpers/fixtures';
import { PathTitleShown } from '../../../helpers/styleFixtures';
import { css, bodyVariable, compact, looks, after } from './stylesheetFixtures';
import { createElement } from 'react';
import {
  checkSize,
  checkStart,
  overCheckAttribute,
} from '../../../../tools/commander/page/lineCheck';
import {
  rendered,
  withClass,
  allWithClass,
  type MarkupElement,
} from '../../../helpers/markup';

function CommanderItem({
  className,
  paneClassName = '',
}: {
  readonly className: string;
  readonly paneClassName?: string;
}) {
  return (
    <div className={`commander ${paneClassName}`}>
      <div className={`row commander-row ${className}`}>
        <span className="commander-check">
          <span className="check-box" />
        </span>
      </div>
    </div>
  );
}

function checkBox(checked: boolean): MarkupElement {
  return rendered(
    createElement('input', { type: 'checkbox', checked, readOnly: true }),
  );
}

function commanderIconDisplay(className: string): string | undefined {
  const icon = rendered(
    createElement(
      'span',
      { className: 'commander-icon' },
      createElement('img', { className }),
    ),
  );
  return cascaded(withClass(icon, 'system-icon'), 'display');
}

function lineIcon(className: string, property: string): string | undefined {
  return cascaded(
    withClass(
      rendered(
        <div className="row commander-row commander-line">
          <img className={className} />
        </div>,
      ),
      'system-icon',
    ),
    property,
  );
}

function lineRow(className: string, overBox = false): MarkupElement {
  const row = withClass(
    rendered(
      <div className="commander">
        <div
          className={`row commander-row commander-line ${className}`}
          {...(overBox ? { [overCheckAttribute]: '' } : {})}
        />
      </div>,
    ),
    'commander-row',
  );
  assert.ok(row);
  return row;
}

const before = { pseudoElement: '::before' };

function lineBox(row: MarkupElement) {
  const box = before;
  const edge = cascaded(row, 'border-color', box);
  return {
    box: cascaded(row, 'content', box),
    edge: edge ?? cascaded(row, 'border', box)?.replace(/^1px solid /, ''),
    filled: cascaded(row, 'background', box),
    check: cascaded(row, 'content', after),
  };
}

function commanderRowColor(className: string): string | undefined {
  return cascaded(
    rendered(
      createElement('div', { className: `row commander-row ${className}` }),
    ),
    'color',
  );
}

function pathColors(pathTitle: React.ReactElement): (string | undefined)[] {
  const title = rendered(pathTitle);
  return [
    cascaded(title, 'color'),
    ...allWithClass(title, 'path-part').map((part) => cascaded(part, 'color')),
    cascaded(withClass(title, 'path-name'), 'color'),
  ];
}

const parts = (className: string, pointed = false) => {
  const item = withClass(
    rendered(
      <CommanderItem className={`${className}${pointed ? ' pointed' : ''}`} />,
    ),
    'commander-row',
  );
  const states: States = {};
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

const filled = (
  layout: string,
  className: string,
  inactive: boolean,
  pointed: boolean,
) => {
  const row = withClass(
    rendered(
      <CommanderItem
        className={`${layout} ${className}${pointed ? ' pointed' : ''}`}
        paneClassName={inactive ? 'commander-pane inactive' : ''}
      />,
    ),
    'commander-row',
  );
  assert.ok(row);
  return cascaded(row, 'background');
};

suite('Style', () => {
  test('ends the rows of the commander a padding before the scrollbar beside them, and its header as far in as the scrollbar is wide besides, so each column stands under its heading, whatever its size and the font, two characters apart, the handle resizing a column in the middle of the gap before it', () => {
    looks(rendered(<div className="commander-line commander-header" />), {
      padding:
        '0 calc(8px + var(--scrollbar-size)) 0 var(--commander-row-start)',
      'column-gap': 'var(--commander-gap)',
    });
    for (const className of [
      'row commander-row commander-line',
      'row commander-row selected commander-line',
    ]) {
      looks(rendered(<div className={className} />), {
        padding:
          '0 8px 0 calc(var(--commander-row-start) + 16px + var(--commander-gap))',
        'column-gap': 'var(--commander-gap)',
      });
    }
    assert.deepStrictEqual(
      ['commander-line commander-header', 'row commander-row commander-line']
        .map((className) =>
          cascaded(
            rendered(<div className={className} />),
            'grid-template-columns',
          ),
        )
        .map((columns) => columns?.replace(/^16px /, '')),
      Array.from(
        { length: 2 },
        () =>
          'minmax(0, 1fr) calc(var(--commander-extension) * var(--commander-advance)) calc(var(--commander-size) * var(--commander-advance)) calc(var(--commander-date) * var(--commander-advance))',
      ),
    );
    assert.match(
      css,
      /--commander-gap: calc\(2 \* var\(--commander-advance\)\);/,
    );
    looks(rendered(<div className="column-handle" />), {
      left: 'calc(var(--commander-gap) / -2 - 4px)',
    });
    assert.strictEqual(defaultSettings().tools.commander.columns.date, 16);
  });

  test('lays the hidden row the canvas reads the places of the columns from out as a row of cells, and the ruler a row is measured by beside it out of sight', () => {
    for (const icon of ['', 'generic-file', 'generic-folder']) {
      looks(
        rendered(
          <div className={`row commander-row commander-line ${icon}`} />,
        ),
        { display: 'grid', overflow: 'clip', position: undefined },
      );
    }
    looks(rendered(<div className="row commander-line commander-ruler" />), {
      position: 'absolute',
      visibility: 'hidden',
      width: '4000px',
      padding:
        '0 8px 0 calc(var(--commander-row-start) + 16px + var(--commander-gap))',
    });
  });

  test('opens the bookmarks and the drives below the path of a side as far in from the frame of the side as from the path, past the line of the frame, as the floating search stands', () => {
    looks(
      withClass(
        rendered(
          <div className="commander-path-menus">
            <div className="menu" />
          </div>,
        ),
        'menu',
      ),
      {
        top: 'calc(100% + var(--bar-space))',
        left: 'calc(var(--column-line, 0px) + var(--bar-space))',
      },
    );
  });

  test('keeps the name of the commander one character after its icon, as the icon is not a column to stand apart from', () => {
    for (const className of [
      'commander-line commander-header',
      'row commander-row commander-line',
    ]) {
      looks(
        withClass(
          rendered(
            <div className={className}>
              <span className="commander-icon" />
              <span className="commander-name" />
            </div>,
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
    assert.strictEqual(lineIcon('system-icon loading', 'display'), 'none');
    assert.notStrictEqual(lineIcon('system-icon', 'display'), 'none');
  });

  test('draws the generic icon of a row as a background of the row, the picture of a file or of a folder the page drew in the muted color, dimmed for a hidden one, where the icon of the file stands once it came, 16 pixels wide after the room of the box, in the middle of the row, over what the row is filled with, so a row has no element for its icon', () => {
    const icons = [
      'generic-file',
      'generic-folder',
      'hidden generic-file',
      'hidden generic-folder',
      '',
    ].map((className) =>
      cascaded(
        rendered(
          <div className={`row commander-row commander-line ${className}`} />,
        ),
        '--row-icon',
      ),
    );
    assert.deepStrictEqual(icons, [
      'var(--file-icon)',
      'var(--folder-icon)',
      'var(--hidden-file-icon)',
      'var(--hidden-folder-icon)',
      undefined,
    ]);
    const line = rendered(<div className="row commander-row commander-line" />);
    looks(line, {
      '--line-icon':
        'var(--row-icon, none) var(--commander-row-start) center / 16px 16px no-repeat',
      background: 'var(--line-icon)',
    });
    for (const [property, value] of [
      ['position', 'absolute'],
      ['top', 'calc((var(--commander-row-height) - 16px) / 2)'],
      ['left', 'var(--commander-row-start)'],
      ['width', '16px'],
      ['height', '16px'],
    ]) {
      assert.strictEqual(lineIcon('system-icon', property), value, property);
    }
    assert.strictEqual(
      cascaded(
        withClass(
          rendered(
            <div className="row commander-row commander-line hidden">
              <img className="system-icon" />
            </div>,
          ),
          'system-icon',
        ),
        'opacity',
      ),
      'var(--color-hidden-file)',
    );
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
      cascaded(
        withClass(
          rendered(<CommanderItem className="commander-line marked colored" />),
          'commander-row',
        ),
        'font-weight',
      ),
      undefined,
    );
  });

  test('leaves room before the icon of every row of the commander, and of its header, for the box of a mark, so nothing moves as the first file is marked, and draws the box of a row there without an element of its own, where a click is taken for one on it', () => {
    const commander = rendered(<div className="commander" />);
    looks(commander, {
      '--commander-check': `${checkSize}px`,
      '--commander-check-start': `${checkStart}px`,
    });
    assert.strictEqual(
      compact(cascaded(commander, '--commander-row-start')),
      'calc(var(--commander-check-start) + var(--commander-check) + 6px)',
    );
    const place = {
      position: 'absolute',
      top: 'calc((var(--commander-row-height) - var(--commander-check)) / 2)',
      left: 'var(--commander-check-start)',
      'box-sizing': 'border-box',
      width: 'var(--commander-check)',
      height: 'var(--commander-check)',
    };
    looks(lineRow('pointed'), place, before);
    looks(lineRow('marked'), place, before);
    looks(
      lineRow('marked'),
      {
        position: 'absolute',
        top: 'calc( (var(--commander-row-height) - var(--commander-check)) / 2 + var(--hairline) - 1px )',
        left: 'calc(var(--commander-check-start) + var(--hairline) - 1px)',
        width: 'calc(var(--commander-check) - 2 * var(--hairline) + 2px)',
        height: 'calc(var(--commander-check) - 2 * var(--hairline) + 2px)',
      },
      after,
    );
    looks(
      withClass(
        withClass(
          rendered(<CommanderItem className="commander-tile" />),
          'commander-row',
        ),
        'commander-check',
      ),
      { position: 'absolute' },
    );
  });

  test('shows the box of a mark of the commander empty under the pointer, its edge in the color of the text once the pointer is over the box itself, and checked once the file is marked, filled in the color of the text with the check in the color of the panel, and none otherwise, nor for the parent folder', () => {
    assert.deepStrictEqual(lineBox(lineRow('')), {
      box: undefined,
      edge: undefined,
      filled: undefined,
      check: undefined,
    });
    assert.deepStrictEqual(lineBox(lineRow('pointed')), {
      box: "''",
      edge: 'var(--muted-foreground)',
      filled: undefined,
      check: undefined,
    });
    assert.deepStrictEqual(lineBox(lineRow('pointed', true)), {
      box: "''",
      edge: 'var(--color-foreground)',
      filled: undefined,
      check: undefined,
    });
    assert.deepStrictEqual(lineBox(lineRow('marked')), {
      box: "''",
      edge: 'var(--color-foreground)',
      filled: 'var(--color-foreground)',
      check: "''",
    });
    assert.deepStrictEqual(lineBox(lineRow('up pointed')), {
      box: undefined,
      edge: undefined,
      filled: undefined,
      check: undefined,
    });
    looks(
      lineRow('marked'),
      { background: 'var(--color-panel-background)' },
      after,
    );
    assert.deepStrictEqual(parts('commander-tile'), {
      box: 'hidden',
      frame: ['var(--color-panel-background)', 'var(--muted-foreground)'],
      check: undefined,
    });
    assert.deepStrictEqual(parts('commander-tile', true), {
      box: 'visible',
      frame: ['var(--color-panel-background)', 'var(--muted-foreground)'],
      check: undefined,
    });
    assert.deepStrictEqual(parts('commander-tile marked'), {
      box: 'visible',
      frame: ['var(--color-foreground)', 'var(--color-foreground)'],
      check: "''",
    });
  });

  test('draws a check box of a dialog or of a Markdown task as the commander draws its own, a frame in the muted color filled in the color of the text with the check in the color of the panel once checked, rather than as the browser does', () => {
    const own = withClass(
      rendered(<CommanderItem className="commander-line marked" />),
      'commander-row',
    );
    for (const property of ['appearance', 'width', 'height', 'margin']) {
      assert.ok(cascaded(checkBox(false), property) !== undefined, property);
    }
    looks(checkBox(false), {
      appearance: 'none',
      'border-color': cascaded(
        withClass(
          withClass(
            rendered(<CommanderItem className="commander-line" />),
            'commander-row',
          ),
          'check-box',
        ),
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
    const row = lineRow('pointed');
    assert.strictEqual(
      cascaded(row, 'border', before),
      ['border-width', 'border-style', 'border-color']
        .map((property) => cascaded(checkBox(false), property))
        .join(' '),
    );
    looks(
      row,
      { 'border-radius': cascaded(checkBox(false), 'border-radius') },
      before,
    );
    looks(
      lineRow('marked'),
      {
        background: cascaded(checkBox(true), 'background'),
        'border-color': cascaded(checkBox(true), 'border-color'),
      },
      before,
    );
    for (const property of ['background', 'mask']) {
      assert.strictEqual(
        cascaded(lineRow('marked'), property, after),
        cascaded(checkBox(true), property, after),
        property,
      );
    }
  });

  test('washes a marked row of the commander light gray, the text mixed into the panel by the share the theme gives marked files, under the tint of the pointer or of the selection as any row, and keeps the wash where a side without focus drops the tint of its selection; a row of the details fills alike under its icon, whatever is pointed at, selected or marked, so its icon shows in every one of them', () => {
    const commander = rendered(<div className="commander" />);
    assert.strictEqual(
      compact(cascaded(commander, '--marked-background')),
      'color-mix(in srgb, var(--color-foreground) var(--color-marked-file), var(--color-panel-background))',
    );
    assert.strictEqual(
      compact(bodyVariable('selection-tint')),
      'color-mix(in srgb, var(--color-focus) var(--color-focus-selected), transparent)',
    );
    assert.deepStrictEqual(
      [
        filled('commander-tile', 'marked', false, false),
        filled('commander-tile', 'marked', false, true),
        filled('commander-tile', 'marked selected', false, false),
        filled('commander-tile', 'marked selected', true, false),
        filled('commander-tile', 'selected', true, false),
      ],
      [
        'var(--marked-background)',
        'linear-gradient(var(--hover-background), var(--hover-background)), var(--marked-background)',
        'linear-gradient(var(--selection-tint), var(--selection-tint)), var(--marked-background)',
        'var(--marked-background)',
        'none',
      ],
    );
    for (const className of [
      '',
      'selected',
      'marked',
      'marked selected',
      'hidden colored',
    ]) {
      for (const inactive of [false, true]) {
        for (const pointed of [false, true]) {
          const tile = filled('commander-tile', className, inactive, pointed);
          assert.strictEqual(
            filled('commander-line', className, inactive, pointed),
            tile === undefined || tile === 'none'
              ? 'var(--line-icon)'
              : `var(--line-icon), ${tile}`,
            `${className} ${String(inactive)} ${String(pointed)}`,
          );
        }
      }
    }
  });

  test('puts the box of a mark of the commander in the top left corner of a thumbnail, ringed in the color of the panel and empty on it, so it shows over any image', () => {
    const tile = withClass(
      rendered(<CommanderItem className="commander-tile" />),
      'commander-row',
    );
    looks(tile, { position: 'relative' });
    looks(withClass(tile, 'commander-check'), {
      top: '4px',
      left: '4px',
      width: '16px',
      height: '16px',
      'border-radius': 'var(--radius)',
      'box-shadow': '0 0 0 var(--hairline) var(--color-panel-background)',
    });
    looks(withClass(tile, 'check-box'), {
      background: 'var(--color-panel-background)',
      'border-radius': 'var(--radius)',
    });
    looks(
      withClass(
        withClass(
          rendered(<CommanderItem className="commander-tile marked" />),
          'commander-row',
        ),
        'check-box',
      ),
      {
        background: 'var(--color-foreground)',
      },
    );
  });

  test('draws a line above the first file of each group of duplicates inside its row, so every row keeps its height, and names the view after the path in the muted color', () => {
    looks(
      rendered(
        <div className="row commander-row commander-line group-start" />,
      ),
      {
        'box-shadow': 'inset 0 var(--hairline) 0 var(--color-border)',
        height: 'var(--commander-row-height)',
        'border-top': undefined,
      },
    );
    looks(rendered(<span className="path-duplicates" />), {
      color: 'var(--muted-foreground)',
      'margin-left': 'var(--commander-advance)',
    });
  });

  test('draws the path above what the commander, the viewer, the editor and the terminal show on the background of the header of a file in the diff, as git draws the path of each file', () => {
    const header = withClass(
      rendered(<div className="file-header" />),
      'file-header',
    );
    const rows = rendered(
      <div>
        <div className="commander">
          <div className="path-row commander-path" />
        </div>
        <div className="path-row" />
        <div className="path-row editor-path" />
        <div className="path-row terminal-path" />
      </div>,
    );
    assert.deepStrictEqual(
      allWithClass(rows, 'path-row').map((row) => cascaded(row, 'background')),
      Array.from({ length: 4 }, () => cascaded(header, 'background')),
    );
  });

  test('lays the path of a commander side out on the row every tool names its file or folder on, starting at the start of the row as theirs do rather than where the names of the rows start, the shield of a folder read as administrator after it', () => {
    const line = rendered(
      <div className="commander">
        <div className="path-row commander-path">
          <PathTitle path="C:/notes.txt" looks={[]} />
          <span className="elevated-mark" />
        </div>
      </div>,
    );
    looks(withClass(line, 'commander-path'), {
      display: 'flex',
      height: 'var(--path-row-height)',
      padding: '0 calc(var(--scrollbar-across) + 8px) 0 8px',
      'grid-template-columns': undefined,
      'border-bottom': undefined,
    });
    looks(withClass(line, 'path-title'), {
      'grid-column': undefined,
      'margin-left': undefined,
      'min-width': '0',
    });
    looks(withClass(line, 'elevated-mark'), {
      'margin-left': 'var(--commander-gap)',
    });
  });

  test('draws the path of a commander title in the font of its rows, each part in the color its own row has, the folders giving way to an ellipsis at their start first, and the name only once it alone is too long, leaving the folders room for their ellipsis', () => {
    const title = rendered(<PathTitle path="C:/notes.txt" looks={[]} />);
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
      withClass(rendered(<PathTitle path="C:/" looks={[]} />), 'path-end'),
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
        pathColors(<PathTitleShown hidden={[]} />),
        pathColors(
          <PathTitleShown hidden={[false, true, false]} color="orange" />,
        ),
        pathColors(
          <PathTitleShown hidden={[false, false, true]} color="orange" />,
        ),
      ],
      [
        [foreground, foreground, foreground, foreground, foreground],
        [
          foreground,
          foreground,
          muted,
          'var(--file-color)',
          'var(--file-color)',
        ],
        [foreground, foreground, foreground, muted, muted],
      ],
    );
  });

  test('lays the rows of a file viewed with wrapping out as wide as the viewer, clipping the spaces hanging past its edge, so they never scroll it sideways, as a row ending in a run of spaces did', () => {
    looks(rendered(<div className="viewer-rows wrapped" />), {
      width: '100%',
      'overflow-x': 'clip',
    });
    looks(rendered(<div className="viewer-rows" />), {
      width: 'max-content',
      'overflow-x': undefined,
    });
  });
});
