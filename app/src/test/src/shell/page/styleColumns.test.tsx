import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ColumnName } from '../../../../tools/git/page/activeColumn';
import { columnFocusAttribute } from '../../../../lib/page/columnFocus';
import { Column } from '../../../../lib/page/column';
import { StatusLine } from '../../../../lib/page/statusLine';
import { columnsClass } from '../../../../tools/git/page/columnsShown';
import { cascaded } from '../../../helpers/cascade';
import {
  Columns,
  ColumnShown,
  ContextMenuShown,
  NoticesShown,
  SearchButtonShown,
} from '../../../helpers/styleFixtures';
import { columnTitle, diffView } from '../../../helpers/styleMarkup';
import {
  buttonsWidth,
  columnEdge,
  pixels,
  looks,
  deviceRounded,
  layer,
  hovered,
  focused,
  after,
  halved,
  unwrapped,
} from './stylesheetFixtures';
import { renderedBy } from '../../../helpers/componentFixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import {
  CommitColumn,
  HistoryMenuShown,
  LocationsPopupShown,
  NavButtonsShown,
} from '../../../helpers/styleHistoryFixtures';
import {
  DiffFindShown,
  DiffOptionsShown,
  DiffViewShown,
  InlineLine,
} from '../../../helpers/styleDiffFixtures';

function columnVisibility(columns: React.ReactElement) {
  return allWithClass(rendered(columns), 'column').map((column) =>
    cascaded(column, 'visibility'),
  );
}

function lineOf(font: 'monospace' | 'proportional') {
  return rendered(
    <Column status={<StatusLine font={font}>+1 −0</StatusLine>}>
      <div />
    </Column>,
  );
}

suite('Style', () => {
  test('highlights what a search matched in the search match colors', () => {
    const matches = allWithClass(
      rendered(<LocationsPopupShown query="m" />),
      'match',
    );
    assert.ok(matches.length > 1);
    for (const match of matches) {
      looks(match, {
        color: 'var(--color-search-match-foreground)',
        background: 'var(--color-search-match)',
      });
    }
  });

  test('draws the find field like the resting search field, edged in the focus color while typing in it', () => {
    const resting = withClass(
      rendered(<LocationsPopupShown query="" />),
      'search-box',
    );
    looks(withClass(rendered(<DiffFindShown />), 'search-box'), {
      background: cascaded(resting, 'background'),
      border: cascaded(resting, 'border'),
    });
    for (const shown of [
      rendered(<DiffFindShown />),
      rendered(<DiffFindShown query="a" />),
    ]) {
      looks(
        withClass(shown, 'search-box'),
        { 'border-color': 'var(--color-focus)' },
        { focus: withClass(shown, 'search-box-input') },
      );
    }
  });

  test("fills and edges the popup's search box in the border color like the other search fields until it is focused or holds a query, then in the panel's", () => {
    const popup = rendered(<LocationsPopupShown query="" />);
    const empty = withClass(popup, 'search-box');
    looks(empty, {
      background: 'var(--color-border)',
      border: '1px solid var(--color-border)',
    });
    looks(
      empty,
      {
        background: 'var(--color-panel-background)',
        'border-color': 'var(--color-focus)',
      },
      { focus: withClass(popup, 'search-box-input') },
    );
    const searched = withClass(
      rendered(<LocationsPopupShown query="main" />),
      'search-box',
    );
    for (const states of [{}, hovered]) {
      looks(
        searched,
        {
          background: 'var(--color-panel-background)',
          'border-color': 'var(--color-border)',
        },
        states,
      );
    }
  });

  test('keeps the title of the Files column clear of its three buttons on the left, spaces the buttons of the Diff column alike, and never squeezes the search field out', () => {
    const files = columnTitle(
      <ColumnShown start={<div className="toolbar all-files" />} />,
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      buttonsWidth(<CommitColumn />, <ColumnShown start={null} />, 3),
    );
    const gap = cascaded(withClass(files, 'toolbar'), 'gap');
    assert.ok(gap);
    const diff = columnTitle(<ColumnShown start={<DiffOptionsShown />} />);
    const groups = allWithClass(diff, 'toolbar');
    assert.ok(groups.length >= 3, String(groups.length));
    for (const group of groups) {
      looks(group, { gap, border: undefined, padding: undefined });
    }
    assert.ok(
      parseFloat(
        cascaded(
          withClass(rendered(<DiffFindShown />), 'search-box'),
          'min-width',
        ) ?? '',
      ) > 0,
    );
  });

  test('keeps the title of the Files column on one line after its buttons, centered while it fits beside the room they take mirrored on the right, then cut off with an ellipsis', () => {
    const title = withClass(
      rendered(
        renderedBy(Column, {
          title: '0123456 → 89abcde',
          start: <div className="toolbar all-files" />,
          children: null,
        }),
      ),
      'column-title',
    );
    looks(withClass(title, 'column-name'), {
      flex: 'none',
      'max-width': '100%',
      overflow: 'hidden',
      'white-space': 'nowrap',
      'text-overflow': 'ellipsis',
    });
    assert.strictEqual(
      pixels(cascaded(title, 'width', after)) +
        parseFloat(cascaded(title, 'padding-right') ?? ''),
      pixels(cascaded(title, 'padding-left')),
    );
  });

  test('draws every button of a bar alike, whatever group it stands in: the fetch button and its pin, the layout buttons and every other toggle filled as buttons are, switched on in the tint of a toggle and tinted under the pointer as every button, a group filling nothing behind its buttons, as a pinned pair was filled as one and the layout buttons stood in a ground of their own, the hovered one white', () => {
    const nav = rendered(
      <NavButtonsShown autoFetch autoFetchMinutes={5} fetching />,
    );
    const options = rendered(<DiffOptionsShown ignoreWhitespace={false} />);
    for (const group of [
      ...allWithClass(nav, 'toolbar'),
      ...allWithClass(options, 'toolbar'),
    ]) {
      looks(group, { background: undefined, 'box-shadow': undefined });
    }
    const buttons = [
      ...allWithClass(nav, 'nav-button'),
      ...allWithClass(options, 'nav-button'),
    ];
    assert.ok(buttons.length >= 11, String(buttons.length));
    const switchedOn = buttons.filter((button) =>
      button.classes.includes('active'),
    );
    assert.ok(switchedOn.length >= 3, String(switchedOn.length));
    for (const button of buttons) {
      looks(button, {
        background: button.classes.includes('active')
          ? 'var(--toggle-on-background)'
          : 'var(--button-background)',
        color: 'var(--color-foreground)',
      });
      if (!button.attributes.has('disabled')) {
        looks(
          button,
          {
            background: cascaded(button, 'background'),
            'box-shadow':
              'inset 0 0 0 calc(var(--button-size) / 2) var(--hover-background)',
          },
          hovered,
        );
      }
    }
    const [fetch] = allWithClass(withClass(nav, 'pin-pair'), 'nav-button');
    assert.ok(fetch.attributes.has('disabled'));
    looks(fetch, { opacity: '1' });
  });

  test('keeps the search fields clear of the edge of a column, the title holding both fields at one height', () => {
    const column = rendered(renderedBy(Column, { children: null }));
    const edge = parseFloat(
      columnEdge(
        <Columns className={columnsClass(true, 'a')} active="commits" />,
      ),
    );
    assert.ok(edge > 0, String(edge));
    assert.strictEqual(
      cascaded(column, '--search-height'),
      'var(--button-size)',
    );
    assert.strictEqual(
      unwrapped(cascaded(column, '--bar-edge')),
      'calc(var(--column-line, 0px) + var(--bar-space))',
    );
    assert.ok(deviceRounded('bar-space') >= 2);
    for (const field of [
      withClass(rendered(<DiffFindShown />), 'search-box'),
      withClass(rendered(<LocationsPopupShown query="" />), 'search-box'),
    ]) {
      looks(field, { height: 'var(--search-height)' });
    }
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      width: 'var(--button-size)',
      height: 'var(--button-size)',
      'border-radius': 'var(--radius)',
    });
  });

  test('draws the edge of a column over the search popup that covers the column, but under menus and notices', () => {
    const edge = layer(
      withClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active="commits" />,
        ),
        'column',
      ),
      after,
    );
    assert.ok(edge > layer(rendered(<LocationsPopupShown query="" />)));
    for (const above of [
      rendered(<ContextMenuShown />),
      rendered(<HistoryMenuShown />),
      rendered(<NoticesShown />),
    ]) {
      assert.ok(layer(above) > edge, above.classes.join(' '));
    }
  });

  test('edges every column in the border color, whichever has the keyboard, over their contents but letting the pointer through, as wide as the line it tells the scrollbars it draws, and grays what is selected in the columns without the keyboard, so the blue selection alone tells the column that has it, and outlines nothing in them', () => {
    const names: readonly ColumnName[] = ['commits', 'files', 'diff'];
    for (const active of names) {
      const edges = allWithClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active={active} />,
        ),
        'column',
      );
      for (const [index, name] of names.entries()) {
        looks(
          edges[index],
          {
            content: "''",
            position: 'absolute',
            '--frame-line': 'var(--column-line)',
            'box-shadow': 'inset 0 0 0 var(--frame-line) var(--color-border)',
            'pointer-events': 'none',
          },
          after,
        );
        assert.strictEqual(
          cascaded(edges[index], '--selection-background'),
          name === active ? undefined : 'var(--resting-selection-background)',
          `${name} while ${active} has the keyboard`,
        );
      }
    }
    const focusable = allWithClass(
      diffView(<DiffViewShown />, <InlineLine kind="added" />),
    ).filter((element) => element.attributes.has(columnFocusAttribute));
    assert.strictEqual(focusable.length, 1);
    looks(focusable[0], { outline: 'none' }, focused);
  });

  test('types in a search box in the monospace font of the code it searches, and in the font of the app where it searches what is written in it', () => {
    looks(withClass(rendered(<DiffFindShown />), 'search-box-input'), {
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
    });
    looks(
      withClass(rendered(<LocationsPopupShown query="" />), 'search-box-input'),
      { 'font-family': undefined, 'font-size': undefined },
    );
  });

  test('writes a status line in the monospace font of the code under which it sits, and in the font of the app under what is written in it', () => {
    looks(
      withClass(
        rendered(<StatusLine font="monospace">Col 12</StatusLine>),
        'column-status',
      ),
      {
        'font-family': 'var(--monospace-font-family)',
        'font-size': 'var(--monospace-font-size)',
      },
    );
    looks(
      withClass(
        rendered(<StatusLine font="proportional">Reading…</StatusLine>),
        'column-status',
      ),
      { 'font-family': undefined, 'font-size': undefined },
    );
  });

  test('draws the text of a status line in the color of the text it sits under, not muted, as what it says is read as the text of the column', () => {
    for (const font of ['monospace', 'proportional'] as const) {
      looks(
        withClass(
          rendered(<StatusLine font={font}>12 files changed</StatusLine>),
          'column-status',
        ),
        { color: 'var(--color-foreground)' },
      );
    }
  });

  test('makes a status line exactly one row of its own font tall, as if another row of the list above it, on whole device pixels, its line drawn inside it taking no room, and the scrollbars of the body over it ending square against it', () => {
    looks(withClass(lineOf('proportional'), 'column'), {
      '--status-height': 'var(--row-line-height)',
    });
    assert.strictEqual(
      cascaded(withClass(lineOf('monospace'), 'column'), '--status-height')
        ?.replaceAll(/\(\s+/g, '(')
        .replaceAll(/\s+\)/g, ')'),
      'round(var(--monospace-font-size) * var(--monospace-line-height), var(--device-pixel, 1px))',
    );
    for (const font of ['monospace', 'proportional'] as const) {
      const column = lineOf(font);
      looks(withClass(column, 'column-status'), {
        height: 'var(--status-height)',
        'line-height': 'var(--status-height)',
        padding: '0 8px',
        'border-top': undefined,
        'box-shadow': 'inset 0 var(--hairline) var(--color-border)',
      });
      looks(withClass(column, 'column-body'), {
        '--line-below': '0px',
        '--corner-round': '0px',
      });
    }
  });

  test('mutes the search placeholders like other muted text, the magnifier of the search button in the color of every button', () => {
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      color: 'var(--color-foreground)',
    });
    for (const field of [
      withClass(rendered(<LocationsPopupShown query="" />), 'search-box-input'),
      withClass(rendered(<DiffFindShown />), 'search-box-input'),
    ]) {
      looks(
        field,
        { color: 'var(--muted-foreground)' },
        { pseudoElement: '::placeholder' },
      );
    }
  });

  test('grabs a column edge over the gap between the columns without painting it, even while dragging', () => {
    const resizer = withClass(
      rendered(<Columns className={columnsClass(true, 'a')} />),
      'resizer',
    );
    looks(resizer, {
      width: '6px',
      right: `calc(-${halved(cascaded(resizer, 'width'))} - var(--gutter-width) / 2)`,
      cursor: 'col-resize',
    });
    for (const states of [{}, hovered]) {
      looks(
        resizer,
        { background: undefined, 'background-color': undefined },
        states,
      );
    }
    looks(rendered(<body className="resizing" />), {
      cursor: 'col-resize',
    });
  });

  test('hides every column but the commits while no commit is selected', () => {
    assert.deepStrictEqual(
      columnVisibility(<Columns className={columnsClass(true, undefined)} />),
      [undefined, 'hidden', 'hidden'],
    );
    assert.deepStrictEqual(
      columnVisibility(<Columns className={columnsClass(true, 'a')} />),
      [undefined, undefined, undefined],
    );
  });

  test('hides the diff while the commit selected has no change to show, keeping its place', () => {
    assert.deepStrictEqual(
      columnVisibility(<Columns className={columnsClass(true, 'a', false)} />),
      [undefined, undefined, 'hidden'],
    );
  });
});
