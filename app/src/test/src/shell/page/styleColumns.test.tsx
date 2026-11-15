import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ColumnName } from '../../../../tools/git/page/activeColumn';
import { columnFocusAttribute } from '../../../../lib/page/columnFocus';
import { Column } from '../../../../tools/git/page/column';
import { StatusLine } from '../../../../tools/commander/page/statusLine';
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
  activeEdge,
  pixels,
  looks,
  deviceRounded,
  layer,
  hovered,
  focused,
  after,
  halved,
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
      <ColumnShown start={<div className="nav-buttons all-files" />} />,
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      buttonsWidth(<CommitColumn />, <ColumnShown start={null} />, 3),
    );
    const gap = cascaded(withClass(files, 'nav-buttons'), 'gap');
    assert.ok(gap);
    const diff = columnTitle(<ColumnShown start={<DiffOptionsShown />} />);
    for (const group of [
      withClass(diff, 'nav-buttons'),
      withClass(diff, 'segmented'),
    ]) {
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
          start: <div className="nav-buttons all-files" />,
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

  test('fills a pinned pair as one undimmed switched-on toggle, its buttons unfilled, and fills the layout buttons as one pill, lifting the chosen and the hovered one onto the panel inside it', () => {
    const fetching = withClass(
      rendered(<NavButtonsShown autoFetch autoFetchMinutes={5} fetching />),
      'pin-pair',
    );
    assert.ok(fetching.classes.includes('pinned'));
    looks(fetching, { background: 'var(--toggle-on-background)' });
    const [fetch, pin] = allWithClass(fetching, 'nav-button');
    assert.ok(fetch.attributes.has('disabled'));
    looks(fetch, { opacity: '1', background: 'none' });
    for (const button of [fetch, pin]) {
      looks(button, { background: 'none', color: 'var(--color-foreground)' });
    }
    const options = rendered(<DiffOptionsShown />);
    looks(withClass(options, 'segmented'), {
      background: 'var(--button-background)',
      'box-shadow': undefined,
    });
    const [chosen, other] = allWithClass(
      withClass(options, 'segmented'),
      'nav-button',
    );
    assert.ok(chosen.classes.includes('active'));
    looks(chosen, {
      background:
        'linear-gradient(var(--toggle-on-background), var(--toggle-on-background)), var(--color-panel-background)',
    });
    looks(other, { background: 'none' });
    looks(other, { background: 'var(--color-panel-background)' }, hovered);
  });

  test('keeps the search fields clear of the active column edge, the title holding both fields at one height', () => {
    const column = rendered(renderedBy(Column, { children: null }));
    const px = (name: string) => {
      const match = /^(\d+)px$/.exec(cascaded(column, `--${name}`) ?? '');
      assert.ok(match, name);
      return Number(match[1]);
    };
    const edge = parseFloat(
      activeEdge(
        <Columns className={columnsClass(true, 'a')} active="commits" />,
      ),
    );
    const line = parseFloat(
      cascaded(withClass(column, 'column-title'), 'border-bottom') ?? '',
    );
    assert.strictEqual(
      cascaded(column, '--search-height'),
      'var(--button-size)',
    );
    const above =
      (px('title-height') - line - deviceRounded('button-size')) / 2;
    assert.ok(above - edge >= 2, String(above));
    for (const field of [
      withClass(rendered(<DiffFindShown />), 'search-box'),
      withClass(rendered(<LocationsPopupShown query="" />), 'search-box'),
    ]) {
      looks(field, { height: 'var(--search-height)' });
    }
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      width: 'var(--search-height)',
      height: 'var(--search-height)',
      'border-radius': 'calc(var(--search-height) / 2)',
    });
  });

  test('draws the active column edge over the search popup that covers the column, but under menus and notices', () => {
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

  test('edges the active column in the focus color and the others in the border color, over their contents but letting the pointer through, as wide as the line it tells the scrollbars it draws, and outlines nothing in them', () => {
    const names: readonly ColumnName[] = ['commits', 'files', 'diff'];
    for (const active of names) {
      const edges = allWithClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active={active} />,
        ),
        'column',
      );
      for (const [index, name] of names.entries()) {
        const shown = name === active;
        looks(
          edges[index],
          {
            content: "''",
            position: 'absolute',
            '--frame-line': 'var(--column-line)',
            'box-shadow': shown
              ? 'inset 0 0 0 var(--frame-line) var(--color-focus)'
              : 'inset 0 0 0 var(--frame-line) var(--color-border)',
            'pointer-events': 'none',
          },
          after,
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

  test('mutes the search placeholders and the magnifier of the search button like other muted text', () => {
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      color: 'var(--muted-foreground)',
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
