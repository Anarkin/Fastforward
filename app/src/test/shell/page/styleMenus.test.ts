import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { createGitStore, GitStore } from '../../../tools/git/page/store';
import { ContextMenu } from '../../../lib/page/contextMenu';
import { ToolIcon } from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import { Name } from '../../../lib/page/name';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { PromptPopup } from '../../../shell/page/promptPopup';
import { ClonePopup } from '../../../tools/git/page/clonePopup';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../support/cascade';
import {
  contextMenu,
  historyMenu,
  locationsPopup,
  notices,
  tabBar,
} from '../../support/styleFixtures';
import {
  noop,
  looks,
  looksAlike,
  bodyVariable,
  layer,
  hovered,
  focused,
  shortcutsPopup,
  overlayScrollbar,
} from './stylesheetFixtures';

suite('Style', () => {
  test('draws the button of a dialog the keyboard moved the focus to as the tool chooser draws its tool, tinted inside the outline of focus, the default button then plain, as Enter presses the one focused', () => {
    const row = rendered(
      createElement(
        'div',
        { className: 'confirm-buttons' },
        createElement('button', { className: 'confirm-button' }, 'Cancel'),
        createElement('button', { className: 'confirm-button default' }, 'OK'),
      ),
    );
    const [cancel, ok] = allWithClass(row, 'confirm-button');
    const tool = rendered(
      createElement('button', { className: 'open-with-tool' }, 'Terminal'),
    );
    const asTool = {
      color: 'inherit',
      background: cascaded(tool, 'background', { focus: tool }),
      outline: cascaded(tool, 'outline', { focus: tool }),
      'outline-offset': cascaded(tool, 'outline-offset', { focus: tool }),
    };
    assert.strictEqual(asTool.background, 'var(--selection-background)');
    looks(ok, {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    });
    looks(cancel, { background: 'var(--color-background)' });
    looks(cancel, asTool, { focus: cancel });
    looks(
      ok,
      { color: 'inherit', background: 'var(--color-background)' },
      { focus: cancel },
    );
    looks(ok, asTool, { focus: ok });
  });

  test('paints the default button of a confirmation in the color of focus, hovered or not, so it shows what Enter does', () => {
    const popup = rendered(
      createElement(ConfirmPopup, {
        title: 'Close Tab',
        message: 'Are you sure?',
        confirm: 'Close',
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    const blue = {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    };
    looks(withClass(popup, 'confirm-button', 'default'), blue);
    looks(withClass(popup, 'confirm-button', 'default'), blue, {
      hover: withClass(popup, 'confirm-button', 'default'),
    });
  });

  test('starts the labels of every menu alike, leaving the same room before each for an icon, a check or nothing, as an item without an icon started further left than those with one', () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [
            {
              label: 'New',
              icon: createElement(ToolIcon, { tool: 'terminal' }),
              onClick: noop,
            },
            { label: 'Group by Color', checked: true, onClick: noop },
            { label: 'Details', checked: false, onClick: noop },
            { separator: true },
            { label: '...', onClick: noop },
            { label: 'Git', submenu: [{ label: 'Open...', onClick: noop }] },
          ],
        },
        onClose: noop,
      }),
    );
    const widths = [
      ...allWithClass(menu, 'menu-check'),
      ...allWithClass(historyMenu(), 'menu-check'),
    ].map((check) => cascaded(check, 'width'));

    assert.strictEqual(widths.length, 6);
    assert.deepStrictEqual(new Set(widths), new Set(['24px']));
  });

  test('starts the label of an item with a submenu where the others start, keeping its gap only before the arrow', () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [
            { label: 'Checkout', submenu: [{ label: 'main', onClick: noop }] },
          ],
        },
        onClose: noop,
      }),
    );
    looks(withClass(menu, 'menu-item', 'has-submenu'), { gap: undefined });
    const arrow = withClass(menu, 'submenu-arrow');
    looks(arrow, { 'margin-left': 'auto' });
    assert.ok(parseFloat(cascaded(arrow, 'padding-left') ?? '') > 0);
  });

  test('draws the line between groups of a menu as a border, which Chromium keeps a whole number of screen pixels thick wherever it falls, as a box a pixel tall came out one or two thick at 125%', () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [
            { label: 'Browse...', onClick: noop },
            { separator: true },
            { label: 'app', onClick: noop },
          ],
        },
        onClose: noop,
      }),
    );
    looks(withClass(menu, 'menu-separator'), {
      height: '0',
      'border-top': '1px solid var(--color-border)',
      background: undefined,
    });
  });

  test("puts a removable item's X at the right end of its entry, drawn like a tab's X and shown only on hovering or reaching the entry, keeping the label clear of it", () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [{ label: 'app', onRemove: noop, removeTitle: 'Remove app' }],
        },
        onClose: noop,
      }),
    );
    const entry = withClass(menu, 'menu-entry');
    const remove = withClass(menu, 'menu-remove');
    const tabClose = withClass(tabBar(), 'tab-close');
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

  test("fills and edges the popup's search box in the border color like the other search fields until it is focused or holds a query, then in the panel's", () => {
    const empty = withClass(locationsPopup(''), 'locations-search');
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
      focused,
    );
    const searched = withClass(locationsPopup('main'), 'locations-search');
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

  test('draws a menu like the other popups, its separators in the border color and the item under the pointer like a selected row', () => {
    for (const menu of [contextMenu(), historyMenu()]) {
      looks(menu, {
        background: 'var(--color-panel-background)',
        'box-shadow': 'var(--popup-shadow)',
        border: undefined,
      });
    }
    looks(withClass(contextMenu(), 'menu-separator'), {
      'border-top': '1px solid var(--color-border)',
    });
    looks(
      withClass(contextMenu(), 'menu-item'),
      { background: 'var(--selection-background)' },
      hovered,
    );
  });

  test('writes the names, paths and addresses typed into a dialog in the monospace font of the settings, so every character tells apart, a space at the end, l from I and 0 from O', () => {
    const store = createGitStore(noop, {
      clone: {
        view: { kind: 'form', url: '', folder: '/code', name: '' },
        form: 1,
        folder: undefined,
        target: undefined,
      },
    });
    const clone = rendered(
      createElement(GitStore, { value: store }, createElement(ClonePopup)),
    );
    const prompt = rendered(
      createElement(PromptPopup, {
        title: 'New Folder',
        message: 'Make a folder',
        label: 'Name',
        confirm: 'Make',
        problemOf: () => undefined,
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    const fields = [
      withClass(prompt, 'prompt-input'),
      ...allWithClass(clone, 'clone-input'),
    ];
    assert.strictEqual(fields.length, 4);
    for (const field of fields) {
      looks(field, {
        'font-family': 'var(--monospace-font-family)',
        'font-size': 'var(--monospace-font-size)',
      });
    }
  });

  test('sets a name apart in a dialog in the monospace font of the settings on a faint tint of the text, the same on a line of its own as in a sentence, each piece of a path kept whole on a line unless it alone is wider, and the labels of the lines muted', () => {
    const popup = rendered(
      createElement(ConfirmPopup, {
        title: 'Copy',
        lines: [
          { label: 'Copy', text: '3 items' },
          { label: 'To', name: 'D:\\photos' },
        ],
        confirm: 'Copy',
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    const name = withClass(popup, 'name');
    looks(name, {
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
      background: 'var(--name-background)',
      'box-decoration-break': 'clone',
    });
    for (const piece of name.children) {
      looks(piece, {
        display: 'inline-block',
        'max-width': '100%',
        'overflow-wrap': 'anywhere',
      });
    }
    looks(withClass(popup, 'name-lines'), {
      display: 'grid',
      'grid-template-columns': 'auto minmax(0, 1fr)',
    });
    looks(withClass(popup, 'name-label'), {
      color: 'var(--muted-foreground)',
    });
  });

  test("draws the line of a filtered menu's edge along the top of its filter, which stays atop the menu as it scrolls and would cover that line", () => {
    looks(rendered(createElement('input', { className: 'menu-filter' })), {
      'box-shadow': 'inset 0 var(--hairline) 0 var(--color-border)',
    });
  });

  test('lines the check boxes of a dialog up with its labels, without the margin the browser gives them', () => {
    for (const className of ['pack-check', 'transfer-all']) {
      const label = rendered(
        createElement(
          'label',
          { className },
          createElement('input', { type: 'checkbox' }),
        ),
      );
      const [box] = label.children;
      looks(box, { margin: '0' });
    }
  });

  test('sets a name on a button apart only in the monospace font, as the button frames it as its tint would', () => {
    const name = withClass(
      rendered(
        createElement(MenuButton, {
          title: 'Drive',
          label: 'C:',
          named: true,
          items: [],
        }),
      ),
      'name',
    );
    looks(name, {
      'font-family': 'var(--monospace-font-family)',
      background: 'none',
      padding: '0',
    });
  });

  test('keeps the spaces of a name that follow a separator, which a piece of a path kept whole would drop at its start, as in the characters a name cannot hold', () => {
    const name = withClass(
      rendered(createElement(Name, null, '\\ / : * ?')),
      'name',
    );
    assert.strictEqual(name.children.length, 3);
    for (const piece of name.children) {
      looks(piece, { 'white-space': 'pre-wrap' });
    }
  });

  test('scrolls a submenu taller than the window, which lists every ref at a commit', () => {
    looks(rendered(createElement('div', { className: 'menu submenu' })), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
  });

  test('lines the first item of a submenu up with the item that opens it', () => {
    const submenu = rendered(
      createElement('div', { className: 'menu submenu' }),
    );
    assert.strictEqual(cascaded(submenu, 'border'), undefined);
    const padding = cascaded(submenu, 'padding');
    assert.match(padding ?? '', /^\d+px$/);
    assert.strictEqual(cascaded(submenu, 'top'), `-${padding}`);
  });

  test('highlights no disabled menu item on hover, whose text would vanish in the selection color', () => {
    const [enabled, disabled] = allWithClass(contextMenu(), 'menu-item');
    assert.ok(disabled.attributes.has('disabled'));
    looks(enabled, { color: 'var(--color-foreground)' }, hovered);
    for (const states of [hovered, focused]) {
      looksAlike(disabled, ['color', 'background'], states);
    }
  });

  test('highlights the menu item the keys are on like the one under the pointer, without an outline', () => {
    const [item] = allWithClass(contextMenu(), 'menu-item');
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
      contextMenu(),
      historyMenu(),
      shortcutsPopup(),
      withClass(notices(), 'notice'),
    ]) {
      looks(popup, { 'box-shadow': 'var(--popup-shadow)', border: undefined });
    }
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    const sticky = withClass(locationsPopup(''), 'tree-row', 'sticky');
    looks(sticky, { background: 'var(--popup-background)' });
    looks(
      sticky,
      {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--popup-background)',
      },
      hovered,
    );
  });

  test('keeps a context menu within the window, scrolling one taller than it, as the repositories may be, unless it opens submenus, which scrolling would cut off', () => {
    looks(withClass(contextMenu(), 'context-menu'), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
    looks(
      withClass(
        rendered(
          createElement(ContextMenu, {
            menu: {
              x: 0,
              y: 0,
              items: [{ label: 'Bookmark', submenu: [{ label: 'main' }] }],
            },
            onClose: noop,
          }),
        ),
        'context-menu',
      ),
      { 'max-height': undefined, 'overflow-y': undefined },
    );
  });

  test('draws a menu, a context menu and so their submenus over the notices, which take the pointer only on a notice, and both under the overlay scrollbars', () => {
    assert.strictEqual(cascaded(contextMenu(), 'position'), 'fixed');
    assert.ok(layer(contextMenu()) > layer(notices()));
    assert.ok(layer(historyMenu()) > layer(notices()));
    assert.ok(layer(overlayScrollbar()) > layer(contextMenu()));
    looks(notices(), { 'pointer-events': 'none' });
    looks(withClass(notices(), 'notice'), { 'pointer-events': 'auto' });
  });
});
