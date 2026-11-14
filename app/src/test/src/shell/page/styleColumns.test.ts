import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import type { ColumnName } from '../../../../tools/git/page/activeColumn';
import { columnFocusAttribute } from '../../../../lib/page/columnFocus';
import { Column } from '../../../../tools/git/page/column';
import { columnsClass } from '../../../../tools/git/page/columns';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import { renderedBy } from '../../../helpers/fixtures';
import {
  searchButton,
  columns,
  columnTitle,
  contextMenu,
  diffFind,
  diffOptions,
  diffView,
  historyMenu,
  inlineLine,
  locationsPopup,
  navButtons,
  notices,
} from '../../../helpers/styleFixtures';
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
} from './stylesheetFixtures';

suite('Style', () => {
  test('highlights what a search matched in the search match colors', () => {
    const matches = allWithClass(locationsPopup('m'), 'match');
    assert.ok(matches.length > 1);
    for (const match of matches) {
      looks(match, {
        color: 'var(--color-search-match-foreground)',
        background: 'var(--color-search-match)',
      });
    }
  });

  test('draws the find field like the resting search field, edged in the focus color while typing in it', () => {
    const resting = withClass(locationsPopup(''), 'locations-search');
    looks(diffFind(), {
      background: cascaded(resting, 'background'),
      border: cascaded(resting, 'border'),
    });
    for (const field of [diffFind(), diffFind('a')]) {
      looks(
        field,
        { 'border-color': 'var(--color-focus)' },
        { focus: withClass(field, 'find-field-input') },
      );
    }
  });

  test('keeps the title of the Files column clear of its three buttons on the left, spaces the buttons of the Diff column alike, and never squeezes the search field out', () => {
    const files = columnTitle(
      createElement('div', { className: 'nav-buttons all-files' }),
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      buttonsWidth(3),
    );
    const gap = cascaded(withClass(files, 'nav-buttons'), 'gap');
    assert.ok(gap);
    const diff = columnTitle(diffOptions());
    for (const group of [
      withClass(diff, 'nav-buttons'),
      withClass(diff, 'segmented'),
    ]) {
      looks(group, { gap, border: undefined, padding: undefined });
    }
    assert.ok(parseFloat(cascaded(diffFind(), 'min-width') ?? '') > 0);
  });

  test('keeps the title of the Files column on one line after its buttons, centered while it fits beside the room they take mirrored on the right, then cut off with an ellipsis', () => {
    const title = withClass(
      rendered(
        renderedBy(Column, {
          title: '0123456 → 89abcde',
          start: createElement('div', { className: 'nav-buttons all-files' }),
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
      rendered(
        navButtons({ autoFetch: true, autoFetchMinutes: 5, fetching: true }),
      ),
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
    const options = rendered(diffOptions());
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
    const edge = parseFloat(activeEdge());
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
      diffFind(),
      withClass(locationsPopup(''), 'locations-search'),
    ]) {
      looks(field, { height: 'var(--search-height)' });
    }
    looks(withClass(searchButton(), 'search-button'), {
      width: 'var(--search-height)',
      height: 'var(--search-height)',
      'border-radius': 'calc(var(--search-height) / 2)',
    });
  });

  test('draws the active column edge over the search popup that covers the column, but under menus and notices', () => {
    const edge = layer(
      withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'),
      after,
    );
    assert.ok(edge > layer(locationsPopup('')));
    for (const above of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(layer(above) > edge, above.classes.join(' '));
    }
  });

  test('edges the active column in the focus color and the others in the border color, over their contents but letting the pointer through, as wide as the line it tells the scrollbars it draws, and outlines nothing in them', () => {
    const names: readonly ColumnName[] = ['commits', 'files', 'diff'];
    for (const active of names) {
      const edges = allWithClass(
        columns(columnsClass(true, 'a'), active),
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
    const focusable = allWithClass(diffView({}, inlineLine('added'))).filter(
      (element) => element.attributes.has(columnFocusAttribute),
    );
    assert.strictEqual(focusable.length, 1);
    looks(focusable[0], { outline: 'none' }, focused);
  });

  test('mutes the search placeholders and the magnifier of the search button like other muted text', () => {
    looks(withClass(searchButton(), 'search-button'), {
      color: 'var(--muted-foreground)',
    });
    for (const field of [
      withClass(locationsPopup(''), 'locations-search'),
      withClass(diffFind(), 'find-field-input'),
    ]) {
      looks(
        field,
        { color: 'var(--muted-foreground)' },
        { pseudoElement: '::placeholder' },
      );
    }
  });
});
