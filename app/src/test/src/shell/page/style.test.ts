import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { Column } from '../../../../tools/git/page/column';
import { columnsClass } from '../../../../tools/git/page/columns';
import { TabBar } from '../../../../shell/page/tabBar';
import { MenuButton } from '../../../../lib/page/menu';
import { Highlight } from '../../../../lib/page/highlight';
import { KeyCombo } from '../../../../lib/page/keyCombo';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import { fileChange, renderedBy } from '../../../helpers/fixtures';
import { tabsStore } from '../../../helpers/componentFixtures';
import {
  searchButton,
  columns,
  commitRow,
  contextMenu,
  diffOptions,
  diffRow,
  diffView,
  fileRow,
  folderRow,
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
} from '../../../helpers/styleFixtures';
import { ShellStore } from '../../../../shell/page/store';
import {
  noop,
  activeEdge,
  looks,
  looksAlike,
  bodyVariable,
  halved,
  deviceRounded,
  hovered,
  aboutPopup,
  tabBarIn,
  shortcutsPopup,
  overlayScrollbar,
  soloButton,
  fileHeader,
} from './stylesheetFixtures';
import {
  FileHeader,
  HunkDivider,
} from '../../../../tools/git/page/diffRowParts';

const inside = (classes: string, child: React.ReactNode) =>
  rendered(createElement('div', { className: classes }, child));

const found = (classes: string, current: boolean) =>
  withClass(
    inside(
      classes,
      createElement(
        'span',
        { className: current ? 'find-match current' : 'find-match' },
        'x',
      ),
    ),
    'find-match',
  );

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

  test('marks every match of a search in the colors of a match as a plain rectangle, as the cursor is one, outlining the current one, in the editor, the viewer, the diff, PDFs, the commander, the commits, the files, the locations and the shortcuts, and outlines a bracket as a plain rectangle too', () => {
    const match = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
      'border-radius': undefined,
    };
    const outline =
      '0 0 0 var(--hairline) var(--color-search-match-foreground)';
    for (const classes of [
      'cm-editor editor-text',
      'viewer-row',
      'diff-line',
    ]) {
      looks(found(classes, false), { ...match, 'box-shadow': undefined });
      looks(found(classes, true), { ...match, 'box-shadow': outline });
    }
    for (const classes of [
      'row commander-row',
      'commit',
      'row tree-row',
      'locations-list',
      'shortcuts-popup',
    ]) {
      looks(
        withClass(
          inside(classes, createElement(Highlight, { text: 'x', query: 'x' })),
          'match',
        ),
        match,
      );
    }
    looks(
      withClass(
        inside(
          'shortcuts-popup',
          createElement(KeyCombo, { keys: 'F1', matched: new Set(['f1']) }),
        ),
        'match',
      ),
      match,
    );
    for (const classes of [
      'highlight',
      'highlight begin',
      'highlight end',
      'highlight selected',
    ]) {
      looks(
        withClass(
          inside(
            'pdf-pane',
            createElement(
              'div',
              { className: 'textLayer' },
              createElement('span', { className: classes }, 'x'),
            ),
          ),
          ...classes.split(' '),
        ),
        {
          '--highlight-bg-color': 'var(--color-search-match)',
          'border-radius': '0',
        },
      );
    }
    for (const bracket of ['cm-matchingBracket', 'cm-nonmatchingBracket']) {
      looks(
        withClass(
          inside(
            'cm-editor editor-text cm-focused',
            createElement('span', { className: bracket }, '('),
          ),
          bracket,
        ),
        { background: 'none', 'border-radius': undefined },
      );
    }
  });

  test('selects text in the color of a selected row everywhere, in the text boxes, the viewer, the diff, Markdown and any other text as the editor does, and see-through in that color over the page of a PDF, which shows through', () => {
    const selected = { pseudoElement: '::selection' };
    const text = createElement('span', { className: 'text' }, 'x');
    for (const element of [
      rendered(createElement('input', { className: 'prompt-input' })),
      rendered(createElement('textarea', { className: 'field' })),
      withClass(inside('viewer-row', text), 'text'),
      withClass(inside('diff-line', text), 'text'),
      withClass(inside('markdown', text), 'text'),
      withClass(inside('notice', text), 'text'),
    ]) {
      looks(
        element,
        { 'background-color': 'var(--selection-background)' },
        selected,
      );
    }
    const editor = rendered(
      createElement(
        'div',
        { className: 'cm-editor editor-text editor-selection' },
        createElement(
          'div',
          { className: 'cm-scroller' },
          createElement('div', { className: 'cm-line' }, 'x'),
          createElement(
            'div',
            { className: 'cm-selectionLayer' },
            createElement('div', { className: 'cm-selectionBackground' }),
          ),
        ),
      ),
    );
    looks(
      withClass(editor, 'cm-line'),
      { 'background-color': 'transparent' },
      selected,
    );
    looks(withClass(editor, 'cm-selectionBackground'), {
      background: 'var(--selection-background)',
    });
    looks(
      withClass(
        inside(
          'pdf-pane',
          createElement('div', { className: 'textLayer' }, text),
        ),
        'text',
      ),
      { 'background-color': 'var(--selection-tint)' },
      selected,
    );
    assert.strictEqual(
      bodyVariable('selection-tint'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent )',
    );
  });
});
