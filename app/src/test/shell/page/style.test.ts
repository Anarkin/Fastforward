import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import type { ColumnName } from '../../../tools/git/page/activeColumn';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { listedFilesRows } from '../../../tools/git/page/changesTree';
import { Column } from '../../../tools/git/page/column';
import { columnsClass } from '../../../tools/git/page/columns';
import { TabBar } from '../../../shell/page/tabBar';
import { MenuButton } from '../../../lib/page/menu';
import { Crash } from '../../../shell/page/errorBoundary';
import { VirtualRows } from '../../../lib/page/virtualRows';
import { allWithClass, cascaded, rendered, withClass } from '../../cascade';
import {
  defaultSettings,
  fileChange,
  renderedBy,
  stylesheet,
} from '../../fixtures';
import { tabsStore } from '../../componentFixtures';
import {
  searchButton,
  columns,
  columnTitle,
  commitRow,
  contextMenu,
  diffFind,
  diffOptions,
  diffRow,
  diffView,
  fileRow,
  folderRow,
  historyMenu,
  inlineLine,
  locationsPopup,
  messagePanel,
  minimap,
  menuButton,
  navButtons,
  notices,
  tabBar,
  workingTreeRow,
  worktree,
  worktreeBar,
} from '../../styleFixtures';
import { defaultScrolling } from '../../../lib/page/rowScroll';
import { ShellStore } from '../../../shell/page/store';
import {
  css,
  noop,
  buttonsWidth,
  activeEdge,
  pixels,
  looks,
  looksAlike,
  body,
  bodyVariable,
  halved,
  deviceRounded,
  layer,
  hovered,
  focused,
  after,
  aboutPopup,
  tabBarIn,
  shortcutsPopup,
  overlayScrollbar,
  skeletonRow,
  soloButton,
  fileHeader,
} from './stylesheetFixtures';
import { FileHeader, HunkDivider } from '../../../tools/git/page/diffRowParts';

suite('Style', () => {
  test('colors the icon of each tool with its own color from the settings, so tabs of different tools for one folder tell apart at a glance', () => {
    const bar = rendered(
      createElement(
        ShellStore,
        {
          value: tabsStore(
            [
              { id: '1', tool: 'git', root: '/a', name: 'a' },
              { id: '2', tool: 'commander', root: '/a', name: 'a' },
              { id: '3', tool: 'terminal', root: '/a', name: 'a' },
            ],
            '1',
          ),
        },
        createElement(TabBar, {}),
      ),
    );
    assert.deepStrictEqual(
      allWithClass(bar, 'tool-icon').map((icon) => cascaded(icon, 'color')),
      [
        'var(--color-git-icon)',
        'var(--color-commander-icon)',
        'var(--color-terminal-icon)',
      ],
    );
  });

  test('writes the choice shown on a dropdown button in the font size of the settings, as the text around it', () => {
    const button = withClass(
      rendered(
        createElement(MenuButton, {
          title: 'Encoding',
          label: 'UTF-8',
          items: [],
        }),
      ),
      'menu-button-trigger',
    );
    assert.strictEqual(cascaded(button, 'font'), 'inherit');
    assert.strictEqual(
      cascaded(withClass(button, 'menu-button-label'), 'font-size'),
      undefined,
    );
  });

  test('sizes every round button and spaces every group of them by one size and one gap, each a whole number of screen pixels, so no gap is drawn wider than another at 125%', () => {
    assert.strictEqual(deviceRounded('button-size'), 26);
    assert.strictEqual(deviceRounded('button-gap'), 2);
    assert.strictEqual(deviceRounded('arrowed-button-width'), 44);
    const nav = rendered(navButtons({ autoFetch: true, autoFetchMinutes: 5 }));
    const options = rendered(diffOptions());
    for (const group of [
      withClass(nav, 'nav-buttons'),
      withClass(nav, 'pin-pair'),
      withClass(options, 'nav-buttons'),
      withClass(options, 'segmented'),
      withClass(
        rendered(
          renderedBy(Column, {
            actions: createElement('span'),
            children: null,
          }),
        ),
        'column-actions',
      ),
    ]) {
      looks(group, { gap: 'var(--button-gap)' });
    }
    const buttons = [
      ...allWithClass(nav, 'nav-button'),
      ...allWithClass(options, 'nav-button'),
    ];
    assert.ok(buttons.length > 8);
    for (const button of buttons) {
      looks(button, {
        width: 'var(--button-size)',
        height: 'var(--button-size)',
      });
    }
    looks(withClass(searchButton(), 'search-button'), {
      width: 'var(--search-height)',
    });
    assert.strictEqual(
      cascaded(
        rendered(renderedBy(Column, { children: null })),
        '--search-height',
      ),
      'var(--button-size)',
    );
  });

  test('shades a round button on hover over whatever fill it has, so an active toggle or a pinned pair changes too', () => {
    const pinned = rendered(
      navButtons({ autoFetch: true, autoFetchMinutes: 5 }),
    );
    const enabled = [
      pinned,
      rendered(diffOptions({ ignoreWhitespace: false })),
    ].flatMap((root) =>
      allWithClass(root, 'nav-button').filter(
        (button) => !button.attributes.has('disabled'),
      ),
    );
    const filled = enabled.filter((button) =>
      button.classes.includes('active'),
    );
    assert.strictEqual(filled.length, 3);
    for (const button of enabled) {
      const radius = halved(cascaded(button, 'width'));
      looks(button, { 'border-radius': radius });
      looks(
        button,
        { 'box-shadow': `inset 0 0 0 ${radius} var(--hover-background)` },
        hovered,
      );
    }
    for (const button of filled) {
      looksAlike(button, ['background'], hovered);
    }
    looksAlike(withClass(pinned, 'pin-pair'), ['background'], {
      hover: filled[0],
    });
    const disabled = withClass(pinned, 'nav-button');
    assert.ok(disabled.attributes.has('disabled'));
    looks(disabled, { 'box-shadow': undefined }, hovered);
  });

  test('fills the search button in the border color, as the search fields are until used, and draws the strip between hunks in it', () => {
    looks(withClass(searchButton(), 'search-button'), {
      background: 'var(--color-border)',
    });
    looks(
      withClass(
        diffView({}, diffRow(createElement(HunkDivider))),
        'hunk-divider',
      ),
      { background: 'var(--color-border)' },
    );
  });

  test("fills every round button in the border color, but in the color of the tab bar or a popup's title it sits on, showing no circle there, and in the panel's on a file's header, tinting the button of an open menu, the + one too, over its fill and ringing a button's dot in it", () => {
    assert.strictEqual(
      bodyVariable('button-background'),
      'var(--color-border)',
    );
    for (const bar of [
      withClass(tabBar(), 'tabs'),
      withClass(shortcutsPopup(), 'shortcuts-title'),
      withClass(aboutPopup(), 'shortcuts-title'),
    ]) {
      looks(bar, {
        background: 'var(--color-background)',
        '--button-background': 'var(--color-background)',
      });
    }
    looks(withClass(diffView({}, fileHeader), 'file-header'), {
      background: 'var(--color-border)',
      '--button-background': 'var(--color-panel-background)',
    });
    const diff = rendered(diffOptions());
    const laidOut = allWithClass(withClass(diff, 'segmented'), 'nav-button');
    for (const button of [
      ...allWithClass(rendered(navButtons()), 'nav-button'),
      ...allWithClass(diff, 'nav-button').filter(
        (option) => !laidOut.includes(option),
      ),
      withClass(rendered(menuButton()), 'nav-button'),
      withClass(shortcutsPopup(), 'nav-button'),
      withClass(
        diffView(
          {},
          diffRow(
            createElement(FileHeader, {
              path: 'v.svg',
              open: true,
              whole: false,
              collapsible: true,
              onClick: noop,
              onView: noop,
            }),
          ),
        ),
        'file-header-button',
      ),
    ]) {
      assert.ok(!button.classes.includes('active'));
      looks(button, { background: 'var(--button-background)' });
    }
    for (const open of [
      rendered(
        createElement('button', {
          className: 'nav-button menu-button-trigger open',
        }),
      ),
      withClass(tabBarIn(false, true), 'tab-add'),
    ]) {
      looks(open, {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--button-background)',
      });
    }
    assert.match(
      cascaded(
        withClass(rendered(menuButton({ marked: true })), 'menu-mark'),
        'box-shadow',
      ) ?? '',
      /^0 0 0 \S+ var\(--button-background\)$/,
    );
  });

  test('rings a button or link the keyboard reached in the focus color, in whole pixels inside its edge like the active column, so nothing around it clips it, but not a menu item, which it tints instead, nor a popup taking the keyboard', () => {
    const edge = activeEdge();
    assert.match(edge, /^\d+px$/);
    const ring = {
      outline: `${edge} solid var(--color-focus)`,
      'outline-offset': `-${edge}`,
    };
    const about = aboutPopup();
    for (const control of [
      withClass(tabBar(), 'tab-add'),
      withClass(tabBar(), 'tab-close'),
      withClass(notices(), 'notice-close'),
      withClass(rendered(navButtons()), 'nav-button'),
      withClass(about, 'about-copy'),
      withClass(about, 'nav-button'),
      about.children[1]?.children.find((child) => child.tag === 'a'),
    ]) {
      looks(control, ring, { focus: control });
    }
    looks(withClass(tabBar(), 'tab-add'), { outline: undefined });
    const item = withClass(contextMenu(), 'menu-item');
    looks(item, { outline: 'none' }, { focus: item });
    looks(about, { outline: 'none' }, { focus: about });
    const pinned = messagePanel({}, true);
    const close = withClass(pinned, 'message-close');
    looks(close, ring, { focus: close });
    const description = withClass(pinned, 'message-body');
    looks(pinned, { outline: 'none' }, { focus: pinned });
    looks(description, { outline: 'none' }, { focus: description });
  });

  test('tints a row under the pointer with a see-through touch of the focus color, over whatever lies under it', () => {
    assert.strictEqual(
      bodyVariable('hover-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-hover), transparent )',
    );
    for (const row of [
      allWithClass(tabBar(), 'tab').find(
        (tab) => !tab.classes.includes('active'),
      ),
      fileRow(fileChange('src/a.ts')),
      folderRow(),
      rendered(commitRow()),
      workingTreeRow(1),
    ]) {
      looks(row, { background: 'var(--hover-background)' }, hovered);
    }
  });

  test('tints a hovered button like a hovered row, and a switched-on toggle as strongly as a selection, both see-through', () => {
    assert.strictEqual(
      bodyVariable('toggle-on-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent )',
    );
    for (const button of [
      withClass(tabBar(), 'tab-close'),
      withClass(notices(), 'notice-close'),
    ]) {
      looks(button, { background: 'var(--hover-background)' }, hovered);
    }
    looks(soloButton(true, false), {
      background: 'var(--toggle-on-background)',
    });
  });

  test('fills the search fields, the search button and the worktree chips alike, and tints them alike when hovered, the edges of the fields included', () => {
    const fields = [withClass(locationsPopup(''), 'locations-search')];
    const chip = allWithClass(
      worktreeBar([worktree('a'), worktree('b')], '/a'),
      'tab',
    ).find((tab) => !tab.classes.includes('active'));
    const tinted =
      'linear-gradient(var(--hover-background), var(--hover-background)), var(--color-border)';
    for (const field of [
      ...fields,
      withClass(searchButton(), 'search-button'),
      chip,
    ]) {
      looks(field, { background: 'var(--color-border)' });
      looks(field, { background: tinted }, hovered);
    }
    for (const field of fields) {
      looks(field, { 'border-color': 'transparent' }, hovered);
    }
  });

  test('draws the scrollbars and the minimap viewport in the one scrollbar color, as see-through as the theme says at rest, hovered and dragged', () => {
    for (const [name, state] of [
      ['scrollbar-background', 'rest'],
      ['scrollbar-hover-background', 'hover'],
      ['scrollbar-active-background', 'drag'],
    ]) {
      assert.strictEqual(
        bodyVariable(name),
        `color-mix( in srgb, var(--color-scrollbar) var(--color-scrollbar-${state}), transparent )`,
        name,
      );
    }
    const resting = { background: 'var(--scrollbar-background) padding-box' };
    const hover = { 'background-color': 'var(--scrollbar-hover-background)' };
    const drag = { 'background-color': 'var(--scrollbar-active-background)' };
    looks(overlayScrollbar('shown'), resting);
    looks(overlayScrollbar('shown'), hover, hovered);
    looks(overlayScrollbar('shown dragging'), drag);
    const viewport = withClass(minimap(), 'minimap-viewport');
    looks(viewport, resting);
    looks(viewport, hover, { hover: minimap() });
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'diff-minimap shown dragging' },
            createElement('div', { className: 'minimap-viewport' }),
          ),
        ),
        'minimap-viewport',
      ),
      drag,
    );
  });

  test('draws a thumb across the whole of its box, as wide as the scrollbar size, with no border keeping it off the edges it runs along', () => {
    looks(overlayScrollbar('shown'), { border: undefined });
    looks(withClass(minimap(), 'minimap-viewport'), { border: undefined });
  });

  test('tints a selected row and the active search result alike, with the focus color', () => {
    assert.strictEqual(
      bodyVariable('selection-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), var(--color-panel-background) )',
    );
    for (const row of [
      fileRow(fileChange('src/a.ts'), true),
      rendered(commitRow({ selected: 'a' })),
      withClass(locationsPopup('m'), 'row', 'result', 'active'),
    ]) {
      for (const states of [{}, hovered]) {
        looks(row, { background: 'var(--selection-background)' }, states);
      }
    }
  });

  test('paints the color of the panel behind every list and preview that scrolls in a column, so the text in it keeps ClearType where Chromium composites a scrolling area, from 150% on', () => {
    for (const scroller of [
      rendered(createElement('div', { className: 'virtual-rows' })),
      rendered(
        createElement('div', {
          className: 'column-body viewer-body viewer-preview',
        }),
      ),
    ]) {
      looks(scroller, { background: 'var(--color-panel-background)' });
    }
  });

  test('grabs a column edge over the gap between the columns without painting it, even while dragging', () => {
    const resizer = withClass(columns(columnsClass(true, 'a')), 'resizer');
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
    looks(rendered(createElement('body', { className: 'resizing' })), {
      cursor: 'col-resize',
    });
  });

  test('spins the icon of a running button', () => {
    for (const icon of [
      withClass(rendered(navButtons({ fetching: true })), 'spin-icon'),
      withClass(soloButton(false, true), 'spin-icon'),
    ]) {
      assert.match(
        cascaded(icon, 'animation') ?? '',
        /^spin \S+ linear infinite$/,
      );
    }
    looks(withClass(rendered(navButtons()), 'spin-icon'), {
      animation: undefined,
    });
  });

  test('marks the fetch button in the warning color while stale and the error color when failed, as a dot outside the spinning icon', () => {
    const stale = rendered(
      navButtons({
        lastFetch: { succeeded: 0 },
        autoFetch: true,
        autoFetchMinutes: 1,
      }),
    );
    const failed = rendered(navButtons({ lastFetch: { failed: 0 } }));
    for (const [root, color] of [
      [stale, 'warning'],
      [failed, 'error'],
    ] as const) {
      const mark = withClass(root, 'fetch-mark');
      looks(mark, {
        position: 'absolute',
        'border-radius': '50%',
        background: `var(--color-${color}-foreground)`,
      });
      looks(mark?.parent, { position: 'relative' });
      assert.ok(!mark?.parent?.classes.includes('spin-icon'));
    }
  });

  test('marks the menu button in the focus color while an update waits, as a dot like the one on the fetch button', () => {
    const mark = withClass(rendered(menuButton({ marked: true })), 'menu-mark');
    const fetchMark = withClass(
      rendered(navButtons({ lastFetch: { failed: 0 } })),
      'fetch-mark',
    );
    looks(mark, {
      position: cascaded(fetchMark, 'position'),
      'border-radius': cascaded(fetchMark, 'border-radius'),
      background: 'var(--color-focus)',
    });
    looks(mark?.parent, { position: 'relative' });
    assert.deepStrictEqual(
      allWithClass(rendered(menuButton()), 'menu-mark'),
      [],
    );
  });

  test('draws the rows of the lists as tall as one line of the line height of the settings, the size of the font rounded to the device pixel, with nothing above or below the text', () => {
    looks(rendered(createElement('div', { className: 'row' })), {
      height: 'var(--row-line-height)',
      'line-height': 'var(--row-line-height)',
      padding: '0 8px',
    });
    assert.match(
      stylesheet(),
      /--row-line-height: round\(\s*var\(--font-size\) \* var\(--line-height\),\s*var\(--device-pixel, 1px\)\s*\);/,
    );
  });

  test('gives a row of the files column one line of the line height of the settings, its icons in the middle of it, as tall as a line of the diff at the default sizes, so the columns line up', () => {
    for (const row of [fileRow(fileChange('src/a.ts')), folderRow()]) {
      looks(row, {
        'box-sizing': 'border-box',
        height: 'var(--row-line-height)',
        display: 'flex',
        'align-items': 'center',
      });
    }
    const { fonts } = defaultSettings();
    assert.deepStrictEqual(
      [fonts.size, fonts.lineHeight],
      [fonts.monospaceSize, fonts.monospaceLineHeight],
    );
  });

  test('cuts off every long name in a row with an ellipsis', () => {
    for (const row of [
      fileRow(fileChange('src/a.ts')),
      fileRow(fileChange('src/a.ts', { status: 'D' })),
      fileRow(undefined),
      folderRow(),
    ]) {
      looks(withClass(row, 'path'), {
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'min-width': '0',
      });
    }
  });

  test("lines a folder's name up with the names of the files beside it, leaving no gap after its twisty", () => {
    looks(folderRow(), { gap: undefined });
  });

  test('highlights no loading placeholder on hover', () => {
    for (const placeholder of [
      skeletonRow(),
      skeletonRow('diff-line'),
      rendered(createElement('div', { className: 'commit placeholder' })),
      withClass(locationsPopup('abcd'), 'hash-suggestion', 'empty'),
    ]) {
      looks(placeholder, { background: 'none' }, hovered);
    }
  });

  test('shows that nothing changed as a dimmed row above the empty list, which still fills the column to take the keys', () => {
    const column = rendered(
      renderedBy(Column, {
        children: [
          createElement(VirtualRows, {
            key: 'rows',
            rows: listedFilesRows([]),
            renderRow: noop,
            selectedKey: undefined,
            scrolling: defaultScrolling,
          }),
          createElement('div', { key: 'empty', className: 'row empty' }),
        ],
      }),
    );
    looks(withClass(column, 'column-body'), {
      display: 'flex',
      'flex-direction': 'column',
    });
    const row = fileRow(fileChange('src/a.ts'));
    looks(withClass(column, 'empty'), {
      order: '-1',
      'flex-shrink': '0',
      height: cascaded(row, 'height'),
      padding: cascaded(row, 'padding'),
      color: 'var(--muted-foreground)',
    });
    looks(withClass(column, 'virtual-rows'), {
      flex: '1',
      'min-height': '0',
    });
  });

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    looks(body, { 'user-select': 'none' });
    const view = diffView({}, fileHeader);
    for (const selectable of [
      view,
      withClass(notices(), 'notice-message'),
      withClass(
        rendered(
          createElement(Crash, {
            title: 'Fastforward',
            error: new Error('boom'),
            onReload: noop,
            listen: () => noop,
            onQuit: noop,
          }),
        ),
        'error-message',
      ),
    ]) {
      looks(selectable, { 'user-select': 'text' });
    }
    looks(withClass(view, 'file-header'), { 'user-select': 'none' });
  });

  test('strikes a deleted file through, in the text color like the other changes', () => {
    looks(withClass(fileRow(fileChange('src/a.ts', { status: 'D' })), 'path'), {
      'text-decoration': 'line-through',
      color: undefined,
    });
  });

  test('starts a changed file with its icon, spaced from its name, in the theme color of its kind', () => {
    for (const [status, kind] of [
      ['A', 'added'],
      ['M', 'modified'],
      ['D', 'deleted'],
      ['R', 'renamed'],
    ] as const) {
      const icon = withClass(
        fileRow(fileChange('src/a.ts', { status })),
        'change-icon',
        kind,
      );
      looks(icon, { color: `var(--color-change-${kind})`, 'flex-shrink': '0' });
      assert.ok(parseFloat(cascaded(icon, 'margin-right') ?? '') > 0);
    }
  });

  test('sizes all text by the font size settings, or a multiple of them for the headings of Markdown, buttons and inputs included', () => {
    const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map(
      (match) => match[1],
    );
    assert.deepStrictEqual(
      [...new Set(sizes.filter((size) => !size.startsWith('calc(')))],
      ['var(--font-size)', 'var(--monospace-font-size)'],
    );
    for (const scaled of sizes.filter((size) => size.startsWith('calc('))) {
      assert.match(scaled, /^calc\(var\(--font-size\) \* [\d.]+\)$/);
    }
    const controls = [
      tabBar(),
      contextMenu(),
      locationsPopup(''),
      diffFind(),
      notices(),
      searchButton(),
      rendered(navButtons()),
    ].flatMap((root) =>
      allWithClass(root).filter((element) =>
        ['button', 'input'].includes(element.tag),
      ),
    );
    assert.ok(controls.length > 10);
    for (const control of controls) {
      looks(control, { font: 'inherit' });
    }
  });

  test('keeps the arrow cursor of a desktop app but for resizing, the fields showing the text cursor of their own', () => {
    assert.deepStrictEqual(
      [
        ...new Set(
          [...css.matchAll(/cursor: ([^;]+);/g)].map((match) => match[1]),
        ),
      ],
      ['col-resize'],
    );
  });

  test('mutes text by the one muted opacity, from the text color', () => {
    assert.strictEqual(
      bodyVariable('muted-opacity'),
      'var(--color-foreground-muted)',
    );
    assert.strictEqual(
      bodyVariable('muted-foreground'),
      'color-mix( in srgb, var(--color-foreground) var(--color-foreground-muted), transparent )',
    );
    looks(withClass(rendered(commitRow()), 'commit-line', 'secondary'), {
      color: 'var(--muted-foreground)',
    });
  });

  test('dims close buttons, disabled controls and a gone bubble like muted text, keeping its own fade only for the loading placeholder', () => {
    for (const dimmed of [
      withClass(notices(), 'notice-close'),
      withClass(locationsPopup(''), 'badge', 'missing'),
      allWithClass(contextMenu(), 'menu-item').find((item) =>
        item.attributes.has('disabled'),
      ),
      allWithClass(rendered(navButtons()), 'nav-button').find((button) =>
        button.attributes.has('disabled'),
      ),
    ]) {
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
    const fades = [...css.matchAll(/opacity: (0\.\d+);/g)].map(
      (match) => match[1],
    );
    assert.strictEqual(fades.length, 1);
    looks(withClass(skeletonRow(), 'bar'), { opacity: fades[0] });
  });

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
