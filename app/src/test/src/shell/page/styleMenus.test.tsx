import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { SearchBar } from '../../../../lib/page/searchBar';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import { ContextMenu } from '../../../../shell/page/contextMenu';
import { MenuButton } from '../../../../lib/page/menu';
import { defaultScrolling } from '../../../../lib/page/scrollSettings';
import { cascaded } from '../../../helpers/cascade';
import {
  ContextMenuShown,
  NoticesShown,
  ShortcutsPopupShown,
  TabBarShown,
} from '../../../helpers/styleFixtures';
import {
  noop,
  looks,
  looksAlike,
  bodyVariable,
  layer,
  hovered,
  focused,
} from './stylesheetFixtures';
import { popupOf, scrollbarCover } from '../../../helpers/styleMarkup';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';

const zIndexOf = (className: string) =>
  Number(cascaded(rendered(<div className={className} />), 'z-index'));

suite('Style', () => {
  test('starts the labels of every menu alike, leaving the same room before each for an icon, a check or nothing, as an item without an icon started further left than those with one', () => {
    const menu = rendered(
      <ContextMenu
        menu={{
          x: 0,
          y: 0,
          items: [
            {
              label: 'New',
              icon: 'terminal',
              onClick: noop,
            },
            { label: 'Group by Color', checked: true, onClick: noop },
            { label: 'Details', checked: false, onClick: noop },
            { separator: true },
            { label: '...', onClick: noop },
            { label: 'Git', submenu: [{ label: 'Open...', onClick: noop }] },
          ],
        }}
        onClose={noop}
      />,
    );
    const widths = allWithClass(menu, 'menu-check').map((check) =>
      cascaded(check, 'width'),
    );

    assert.strictEqual(widths.length, 5);
    assert.deepStrictEqual(new Set(widths), new Set(['24px']));
  });

  test('starts the label of an item with a submenu where the others start, keeping its gap only before the arrow', () => {
    const menu = rendered(
      <ContextMenu
        menu={{
          x: 0,
          y: 0,
          items: [
            { label: 'Checkout', submenu: [{ label: 'main', onClick: noop }] },
          ],
        }}
        onClose={noop}
      />,
    );
    looks(withClass(menu, 'menu-item', 'has-submenu'), { gap: undefined });
    const arrow = withClass(menu, 'submenu-arrow');
    looks(arrow, { 'margin-left': 'auto' });
    assert.ok(parseFloat(cascaded(arrow, 'padding-left') ?? '') > 0);
  });

  test('draws the line between groups of a menu as a border, which Chromium keeps a whole number of screen pixels thick wherever it falls, as a box a pixel tall came out one or two thick at 125%', () => {
    const menu = rendered(
      <ContextMenu
        menu={{
          x: 0,
          y: 0,
          items: [
            { label: 'Browse...', onClick: noop },
            { separator: true },
            { label: 'app', onClick: noop },
          ],
        }}
        onClose={noop}
      />,
    );
    looks(withClass(menu, 'menu-separator'), {
      height: '0',
      'border-top': '1px solid var(--color-border)',
      background: undefined,
    });
  });

  test('makes a key cap in a menu as tall as an item of the menu, as it is as tall as a row in the list of shortcuts, its item centering it as it centers its words', () => {
    const menu = rendered(
      <ContextMenu
        menu={{
          x: 0,
          y: 0,
          items: [{ label: 'Details', keys: 'Mod+1', onClick: noop }],
        }}
        onClose={noop}
      />,
    );
    looks(withClass(menu, 'menu-keys'), {
      '--keycap-line': 'var(--menu-item-height)',
    });
    looks(withClass(menu, 'menu-item'), {
      display: 'flex',
      'align-items': 'center',
    });
  });

  test("puts a removable item's X at the right end of its entry, a square as tall as the line of the menu, rounded like a tab's X and shown only on hovering or reaching the entry, keeping the label clear of it", () => {
    const menu = rendered(
      <ContextMenu
        menu={{
          x: 0,
          y: 0,
          items: [{ label: 'app', onRemove: noop, removeTitle: 'Remove app' }],
        }}
        onClose={noop}
      />,
    );
    const entry = withClass(menu, 'menu-entry');
    const remove = withClass(menu, 'menu-remove');
    const tabClose = withClass(rendered(<TabBarShown />), 'tab-close');
    looks(
      remove,
      Object.fromEntries(
        ['border-radius'].map((property) => [
          property,
          cascaded(tabClose, property),
        ]),
      ),
    );
    looks(remove, {
      position: 'absolute',
      top: '0',
      right: '2px',
      width: 'var(--menu-item-height)',
      height: 'var(--menu-item-height)',
      visibility: 'hidden',
    });
    looks(remove, { visibility: undefined }, { hover: entry });
    looks(
      remove,
      { visibility: undefined },
      { focus: withClass(menu, 'menu-item') },
    );
    looks(remove, { background: 'var(--hover-background)' }, hovered);
    looks(withClass(menu, 'menu-item'), {
      'padding-right': 'calc(var(--menu-item-height) + 12px)',
    });
  });

  test('draws a menu like the other popups, its separators in the border color and the item under the pointer like a selected row', () => {
    for (const menu of [rendered(<ContextMenuShown />)]) {
      looks(menu, {
        background: 'var(--color-panel-background)',
        'box-shadow': 'var(--popup-shadow)',
        border: undefined,
      });
    }
    looks(withClass(rendered(<ContextMenuShown />), 'menu-separator'), {
      'border-top': '1px solid var(--color-border)',
    });
    looks(
      withClass(rendered(<ContextMenuShown />), 'menu-item'),
      { background: 'var(--selection-background)' },
      hovered,
    );
  });

  test('makes a menu with a filter at least 260 px wide, so what is typed stays readable beside its counter and toggles however narrow its items are', () => {
    looks(rendered(<div className="menu filtered-menu" />), {
      'min-width': '260px',
    });
  });

  test("draws the line of a filtered menu's edge along the top of its filter, which stays atop the menu as it scrolls and would cover that line, inside the menu's padding so the edge the menu draws inside itself shows beside it, its box 8 px in from that edge, clear of the rounded corners", () => {
    looks(
      withClass(
        rendered(
          <div className="menu filtered-menu">
            <SearchBar
              font="proportional"
              compact
              query=""
              options={plainSearch}
              found={{ current: 0, matches: 0 }}
              onQuery={noop}
              onOptions={noop}
            />
          </div>,
        ),
        'search-bar',
      ),
      {
        position: 'sticky',
        top: '0',
        height: 'var(--menu-search-height)',
        margin: '0 0 4px',
        padding: '0 4px',
        'box-shadow': 'inset 0 var(--hairline) 0 var(--color-border)',
      },
    );
  });

  test('scrolls a submenu taller than the window, which lists every ref at a commit', () => {
    looks(rendered(<div className="menu submenu" />), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
  });

  test('lines the first item of a submenu up with the item that opens it', () => {
    const submenu = rendered(<div className="menu submenu" />);
    assert.strictEqual(cascaded(submenu, 'border'), undefined);
    const padding = cascaded(submenu, 'padding');
    assert.match(padding ?? '', /^\d+px$/);
    assert.strictEqual(cascaded(submenu, 'top'), `-${padding}`);
  });

  test('highlights no disabled menu item on hover, whose text would vanish in the selection color', () => {
    const [enabled, disabled] = allWithClass(
      rendered(<ContextMenuShown />),
      'menu-item',
    );
    assert.ok(disabled.attributes.has('disabled'));
    looks(enabled, { color: 'var(--color-foreground)' }, hovered);
    for (const states of [hovered, focused]) {
      looksAlike(disabled, ['color', 'background'], states);
    }
  });

  test('highlights the menu item the keys are on like the one under the pointer, without an outline', () => {
    const [item] = allWithClass(rendered(<ContextMenuShown />), 'menu-item');
    looksAlike(item, ['color', 'background'], focused, hovered);
    assert.notStrictEqual(
      cascaded(item, 'background', focused),
      cascaded(item, 'background'),
    );
    for (const states of [{}, focused]) {
      looks(item, { outline: 'none' }, states);
    }
  });

  test("edges a popup with an inset shadow rather than a border, which Chromium rounds to whole device pixels, shifting the popup's contents at scales like 125%, the shadow a hairline rounded down to whole device pixels as a border is, so it shows no faint pixel inside it, a dialog drawing it over its contents as the line of its frame, so the thumb of a list in it rounds its end inside the corner of the dialog", () => {
    assert.strictEqual(
      bodyVariable('hairline'),
      'round(down, 1px, var(--device-pixel, 1px))',
    );
    assert.match(
      bodyVariable('popup-shadow') ?? '',
      /^inset 0 0 0 var\(--hairline\) var\(--color-border\),/,
    );
    assert.strictEqual(
      bodyVariable('popup-shadow'),
      'inset 0 0 0 var(--hairline) var(--color-border), var(--popup-drop)',
    );
    looks(rendered(<ContextMenuShown />), {
      'box-shadow': 'var(--popup-shadow)',
      border: undefined,
    });
    looks(withClass(rendered(<NoticesShown />), 'notice'), {
      'box-shadow':
        'inset 0 0 0 var(--card-edge) var(--muted-foreground), var(--popup-drop)',
      border: undefined,
    });
    const dialog = popupOf(<ShortcutsPopupShown />);
    looks(dialog, {
      'box-shadow': 'var(--popup-drop)',
      border: undefined,
      '--popup-line': 'var(--hairline)',
    });
    looks(
      dialog,
      {
        position: 'absolute',
        inset: '0',
        'border-radius': 'inherit',
        '--frame-line': 'var(--popup-line)',
        'box-shadow': 'inset 0 0 0 var(--frame-line) var(--color-border)',
        'pointer-events': 'none',
      },
      { pseudoElement: '::after' },
    );
  });

  test('keeps a context menu within the window, scrolling one taller than it, as the repositories may be, unless it opens submenus, which scrolling would cut off', () => {
    looks(withClass(rendered(<ContextMenuShown />), 'context-menu'), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
    looks(
      withClass(
        rendered(
          <ContextMenu
            menu={{
              x: 0,
              y: 0,
              items: [{ label: 'Bookmark', submenu: [{ label: 'main' }] }],
            }}
            onClose={noop}
          />,
        ),
        'context-menu',
      ),
      { 'max-height': undefined, 'overflow-y': undefined },
    );
  });

  test('draws a menu, a context menu and so their submenus over the notices, which take the pointer only on a notice, and both over the overlay scrollbars of the lists under them', () => {
    assert.strictEqual(
      cascaded(rendered(<ContextMenuShown />), 'position'),
      'fixed',
    );
    assert.ok(
      layer(rendered(<ContextMenuShown />)) > layer(rendered(<NoticesShown />)),
    );
    assert.ok(layer(scrollbarCover()) < layer(rendered(<ContextMenuShown />)));
    looks(rendered(<NoticesShown />), { 'pointer-events': 'none' });
    looks(withClass(rendered(<NoticesShown />), 'notice'), {
      'pointer-events': 'auto',
    });
  });

  test('writes the choice shown on a dropdown button in the font size of the settings, as the text around it', () => {
    const button = withClass(
      rendered(
        <MenuButton
          scrolling={defaultScrolling}
          title="Encoding"
          label="UTF-8"
          items={[]}
        />,
      ),
      'menu-button-trigger',
    );
    assert.strictEqual(cascaded(button, 'font'), 'inherit');
    assert.strictEqual(
      cascaded(withClass(button, 'menu-button-label'), 'font-size'),
      undefined,
    );
  });

  test('draws the menu of a part of a path over the dialogs, their scrollbars and the other menus, as a part in a dialog or a menu opens it over them', () => {
    const pathMenu = zIndexOf('menu context-menu path-menu');
    assert.ok(pathMenu > zIndexOf('backdrop') + 1, String(pathMenu));
    assert.ok(pathMenu > zIndexOf('menu context-menu'), String(pathMenu));
  });
});
