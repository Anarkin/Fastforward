import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { ContextMenu } from '../../../../shell/page/contextMenu';
import { MenuButton } from '../../../../lib/page/menu';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import {
  ContextMenuShown,
  HistoryMenuShown,
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
import { overlayScrollbar, popupOf } from '../../../helpers/styleMarkup';

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
    const widths = [
      ...allWithClass(menu, 'menu-check'),
      ...allWithClass(rendered(<HistoryMenuShown />), 'menu-check'),
    ].map((check) => cascaded(check, 'width'));

    assert.strictEqual(widths.length, 6);
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

  test("puts a removable item's X at the right end of its entry, drawn like a tab's X and shown only on hovering or reaching the entry, keeping the label clear of it", () => {
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
        ['width', 'height', 'border-radius'].map((property) => [
          property,
          cascaded(tabClose, property),
        ]),
      ),
    );
    looks(remove, { position: 'absolute', visibility: 'hidden' });
    looks(remove, { visibility: undefined }, { hover: entry });
    looks(
      remove,
      { visibility: undefined },
      { focus: withClass(menu, 'menu-item') },
    );
    looks(remove, { background: 'var(--hover-background)' }, hovered);
    assert.ok(
      parseFloat(
        cascaded(withClass(menu, 'menu-item'), 'padding-right') ?? '',
      ) >=
        parseFloat(cascaded(remove, 'right') ?? '') +
          parseFloat(cascaded(remove, 'width') ?? ''),
    );
  });

  test('draws a menu like the other popups, its separators in the border color and the item under the pointer like a selected row', () => {
    for (const menu of [
      rendered(<ContextMenuShown />),
      rendered(<HistoryMenuShown />),
    ]) {
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

  test("draws the line of a filtered menu's edge along the top of its filter, which stays atop the menu as it scrolls and would cover that line", () => {
    looks(rendered(<input className="menu-filter" />), {
      'box-shadow': 'inset 0 var(--hairline) 0 var(--color-border)',
    });
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

  test("edges a popup with an inset shadow rather than a border, which Chromium rounds to whole device pixels, shifting the popup's contents at scales like 125%, the shadow a hairline rounded down to whole device pixels as a border is, so it shows no faint pixel inside it", () => {
    assert.strictEqual(
      bodyVariable('hairline'),
      'round(down, 1px, var(--device-pixel, 1px))',
    );
    assert.match(
      bodyVariable('popup-shadow') ?? '',
      /^inset 0 0 0 var\(--hairline\) var\(--color-border\),/,
    );
    for (const popup of [
      rendered(<ContextMenuShown />),
      rendered(<HistoryMenuShown />),
      popupOf(<ShortcutsPopupShown />),
      withClass(rendered(<NoticesShown />), 'notice'),
    ]) {
      looks(popup, { 'box-shadow': 'var(--popup-shadow)', border: undefined });
    }
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

  test('draws a menu, a context menu and so their submenus over the notices, which take the pointer only on a notice, and both under the overlay scrollbars', () => {
    assert.strictEqual(
      cascaded(rendered(<ContextMenuShown />), 'position'),
      'fixed',
    );
    assert.ok(
      layer(rendered(<ContextMenuShown />)) > layer(rendered(<NoticesShown />)),
    );
    assert.ok(
      layer(rendered(<HistoryMenuShown />)) > layer(rendered(<NoticesShown />)),
    );
    assert.ok(
      layer(overlayScrollbar()) > layer(rendered(<ContextMenuShown />)),
    );
    looks(rendered(<NoticesShown />), { 'pointer-events': 'none' });
    looks(withClass(rendered(<NoticesShown />), 'notice'), {
      'pointer-events': 'auto',
    });
  });

  test('writes the choice shown on a dropdown button in the font size of the settings, as the text around it', () => {
    const button = withClass(
      rendered(<MenuButton title="Encoding" label="UTF-8" items={[]} />),
      'menu-button-trigger',
    );
    assert.strictEqual(cascaded(button, 'font'), 'inherit');
    assert.strictEqual(
      cascaded(withClass(button, 'menu-button-label'), 'font-size'),
      undefined,
    );
  });
});
