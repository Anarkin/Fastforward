import * as assert from 'node:assert';
import { createElement } from 'react';
import {
  columnFocusAttribute,
  type ColumnName,
} from '../../webview/activeColumn';
import { RefBubble } from '../../webview/bubbles';
import { listedFilesRows } from '../../webview/changesTree';
import { Column } from '../../webview/column';
import { columnsClass } from '../../webview/columns';
import {
  bubbleLineHeight,
  commitRowHeight,
  SoloButton,
  workingTreeRowHeight,
} from '../../webview/commitList';
import {
  FileNote,
  diffRowClass,
  FileHeader,
  HunkDivider,
  layoutVariables,
  rowHeight,
} from '../../webview/diffView';
import { ImageDiff } from '../../webview/imagePreview';
import { MarkdownDiff } from '../../webview/markdownPreview';
import { Crash } from '../../webview/errorBoundary';
import { overlayScrollbarClass } from '../../webview/overlayScrollbars';
import { codePadding, markerWidth, numberWidth } from '../../webview/overflow';
import { ShortcutsPopup } from '../../webview/shortcutsPopup';
import { SkeletonRows } from '../../webview/skeleton';
import { VirtualRows } from '../../webview/virtualRows';
import { tabSize } from '../../webview/wordWrap';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../cascade';
import { fileChange, renderedBy, stylesheet } from '../fixtures';
import {
  addressBar,
  bubbles,
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
  minimap,
  menuButton,
  navButtons,
  notices,
  repository,
  shownRow,
  splitLine,
  tabBar,
  workingTreeRow,
  worktree,
  worktreeBar,
} from '../styleFixtures';

const css = stylesheet();

const noop = () => undefined;

const titleEdge = 4;
const buttonWidth = 26;
const buttonGap = 2;
const titleClearance = 8;

function buttonsWidth(count: number): number {
  return (
    titleEdge + count * buttonWidth + (count - 1) * buttonGap + titleClearance
  );
}

function pixels(value: string | undefined): number {
  const match = /^calc\((.*)\)$/.exec(value ?? '');
  assert.ok(match, value);
  return match[1]
    .split('+')
    .map((term) =>
      term
        .split('*')
        .map((factor) => parseFloat(factor))
        .reduce((product, factor) => product * factor, 1),
    )
    .reduce((sum, term) => sum + term, 0);
}

function looks(
  element: MarkupElement | undefined,
  expected: Readonly<Record<string, string | undefined>>,
  states?: States,
): void {
  assert.ok(element);
  assert.deepStrictEqual(
    Object.fromEntries(
      Object.keys(expected).map((property) => [
        property,
        cascaded(element, property, states),
      ]),
    ),
    expected,
    element.classes.join(' '),
  );
}

function looksAlike(
  element: MarkupElement,
  properties: readonly string[],
  states: States,
  other: States = {},
): void {
  looks(
    element,
    Object.fromEntries(
      properties.map((property) => [
        property,
        cascaded(element, property, other),
      ]),
    ),
    states,
  );
}

const body = rendered(createElement('body'));

function bodyVariable(name: string): string | undefined {
  return cascaded(body, `--${name}`);
}

function layer(element: MarkupElement, states?: States): number {
  return Number(cascaded(element, 'z-index', states));
}

const hovered = { hover: true } as const;
const focused = { focus: true } as const;
const after = { pseudoElement: '::after' };

function commitColumnTitle(autoFetchMinutes: number): MarkupElement {
  return columnTitle(navButtons({ autoFetchMinutes }));
}

function shortcutsPopup(): MarkupElement {
  return rendered(createElement(ShortcutsPopup, { mac: false, onClose: noop }));
}

function overlayScrollbar(classes = ''): MarkupElement {
  return rendered(
    createElement('div', {
      className: `${overlayScrollbarClass} vertical ${classes}`,
    }),
  );
}

function skeletonRow(className?: string): MarkupElement {
  return withClass(
    rendered(createElement(SkeletonRows, { count: 1, className })),
    'skeleton-row',
  );
}

function soloButton(solo: boolean, applying: boolean): MarkupElement {
  return rendered(createElement(SoloButton, { solo, applying, onSolo: noop }));
}

function frameAndLine(row: MarkupElement): { frame: number; line: number } {
  const padding = /^(\d+)px \d+px (\d+)px$/.exec(
    cascaded(row, 'padding') ?? '',
  );
  assert.ok(padding);
  const border = /^(\d+)px /.exec(cascaded(row, 'border-bottom') ?? '');
  assert.ok(border);
  const height = /^(\d+)px$/.exec(
    cascaded(withClass(row, 'commit-line'), 'height') ?? '',
  );
  assert.ok(height);
  return {
    frame: Number(padding[1]) + Number(padding[2]) + Number(border[1]),
    line: Number(height[1]),
  };
}

function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

function hunkDots(sideBySide: boolean): MarkupElement {
  return withClass(
    diffView({ sideBySide }, diffRow(createElement(HunkDivider))),
    'hunk-dots',
  );
}

const fileHeader = diffRow(
  createElement(FileHeader, {
    path: 'a',
    open: true,
    whole: false,
    onClick: noop,
  }),
);

const lineTint = (change: 'added' | 'removed') =>
  cascaded(
    withClass(diffView({}, inlineLine(change)), 'diff-line', change),
    'background',
  );
const lineFiller = (filler: string) =>
  withClass(
    diffView({ sideBySide: true }, splitLine(filler, 'added')),
    'split-side',
    'filler',
  );

function columnVisibility(selected: string | undefined) {
  return allWithClass(columns(columnsClass(true, selected)), 'column').map(
    (column) => cascaded(column, 'visibility'),
  );
}

const bubbleLook = ['color', 'background', 'box-shadow', 'border'];

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(
      pixels(cascaded(title, 'padding-left')),
      buttonsWidth(3),
    );
    assert.strictEqual(
      pixels(cascaded(title, 'padding-right')),
      buttonsWidth(2),
    );
    assert.strictEqual(
      pixels(cascaded(commitColumnTitle(5), 'padding-left')),
      buttonsWidth(4),
    );
  });

  test('wraps the repository and worktree tabs onto more rows rather than scrolling them sideways, keeping the settings button by the first row', () => {
    for (const bar of [tabBar(), worktreeBar([worktree('a')])]) {
      looks(withClass(bar, 'tab-list'), {
        'flex-wrap': 'wrap',
        overflow: undefined,
        'overflow-x': undefined,
      });
    }
    looks(withClass(tabBar(), 'menu-button'), { 'align-self': 'flex-start' });
  });

  test('keeps the worktree row as tall while its worktrees are listed, or when it has none, as with them', () => {
    const height = 'calc(1lh + 6px)';
    looks(withClass(worktreeBar([worktree('a')]), 'tab'), { height });
    looks(withClass(worktreeBar([]), 'tab-list'), { 'min-height': height });
    const waiting = withClass(
      worktreeBar(undefined),
      'skeleton-tab',
      'waiting',
    );
    looks(waiting, { height });
    looks(withClass(waiting, 'bar'), { visibility: 'hidden' });
  });

  test('shades a round button on hover over whatever fill it has, so an active toggle or a pinned pair changes too', () => {
    const pinned = rendered(
      navButtons({ autoFetch: true, autoFetchMinutes: 5 }),
    );
    const enabled = [
      pinned,
      rendered(diffOptions({ ignoreWhitespace: true })),
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
      looks(button, { 'border-radius': '13px', width: '26px' });
      looks(
        button,
        { 'box-shadow': 'inset 0 0 0 13px var(--hover-background)' },
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

  test('places the hidden-change markers by the line numbers, padding and marker width the diff draws', () => {
    const row = shownRow(diffView({}, inlineLine('added', { marker: true })));
    looks(withClass(row, 'number'), { width: 'var(--diff-number-width)' });
    looks(withClass(row, 'code'), { padding: '0 var(--diff-code-padding)' });
    looks(withClass(row, 'hidden-change'), {
      width: 'var(--diff-marker-width)',
    });
    assert.deepStrictEqual(
      [
        layoutVariables['--diff-number-width'],
        layoutVariables['--diff-code-padding'],
        layoutVariables['--diff-marker-width'],
      ],
      [`${numberWidth}px`, `${codePadding}px`, `${markerWidth}px`],
    );
  });

  test('widens every row of an inline diff to its widest line and past it by the minimap, so short lines stay tinted, the strips between files and hunks reach across when scrolled sideways, and the widest line ends before the minimap', () => {
    const rows = allWithClass(
      diffView(
        {},
        fileHeader,
        diffRow(createElement(HunkDivider)),
        inlineLine('added'),
      ),
      'virtual-row',
      'diff-row',
    );
    assert.strictEqual(rows.length, 3);
    for (const row of rows) {
      looks(row, {
        'min-width':
          'max(100%, var(--diff-content-width, 0px) + var(--minimap-width))',
        width: 'max-content',
      });
    }
  });

  test('tints a binary file added or deleted like such a line, and hatches the side it lacks like one', () => {
    for (const change of ['added', 'removed'] as const) {
      assert.strictEqual(
        cascaded(
          withClass(
            rendered(
              createElement(FileNote, {
                text: 'Binary file',
                change,
                split: false,
              }),
            ),
            'file-note',
          ),
          'background',
        ),
        cascaded(
          withClass(diffView({}, inlineLine(change)), 'diff-line', change),
          'background',
        ),
      );
    }
    const split = rendered(
      createElement(FileNote, {
        text: 'Binary file',
        change: 'added',
        split: true,
      }),
    );
    assert.strictEqual(
      cascaded(withClass(split, 'filler'), 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
  });

  test('previews Markdown as wide as the diff, in halves side by side, hatching the half a file lacks', () => {
    const view = diffView(
      { sideBySide: true },
      createElement(
        'div',
        { className: diffRowClass('markdown') },
        createElement(MarkdownDiff, {
          sides: [
            { side: 'old', text: undefined, present: false },
            { side: 'new', text: undefined, present: true },
          ],
        }),
      ),
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'markdown-diff'), {
      display: 'flex',
      width: '100%',
      'margin-left': 'var(--visible-left, 0px)',
    });
    const [filler, pane] = allWithClass(view, 'markdown-pane');
    for (const half of [filler, pane]) {
      looks(half, { flex: '1 1 0', 'min-width': '0' });
    }
    assert.ok(filler.classes.includes('filler'));
    assert.strictEqual(
      cascaded(filler, 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
    looks(pane, { 'border-left': '1px solid var(--color-border)' });
    const links = rendered(
      createElement(
        'div',
        { className: 'markdown' },
        createElement('a', { href: 'https://example.com' }, 'web'),
        createElement('a', {}, 'relative'),
      ),
    ).children;
    looks(links[0], { color: 'var(--color-focus)' });
    looks(links[1], { color: undefined });
    const keyword = rendered(
      createElement(
        'div',
        { className: 'markdown' },
        createElement('span', { className: 'syntax-keyword' }, 'const'),
      ),
    ).children[0];
    assert.strictEqual(
      cascaded(keyword, 'color'),
      'var(--color-syntax-keyword)',
    );
  });

  test('keeps an image row as wide as the diff, its images in the part scrolled to, side by side and short of the minimap, hatching a side it lacks down to where an image could reach', () => {
    const view = diffView(
      {},
      createElement(
        'div',
        { className: diffRowClass('image') },
        createElement(ImageDiff, {
          panes: [
            { side: 'old', url: undefined },
            { side: 'new', url: 'a.png' },
          ],
        }),
      ),
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'image-diff'), {
      display: 'flex',
      height: '100%',
      width: '100%',
      'margin-left': 'var(--visible-left, 0px)',
    });
    const panes = allWithClass(view, 'image-pane');
    for (const pane of panes) {
      looks(pane, {
        flex: '0 0 50%',
        'box-sizing': 'border-box',
        'min-width': '0',
      });
    }
    assert.strictEqual(diffRowClass('line').includes('preview-row'), false);
    const filler = withClass(view, 'image-pane', 'filler');
    const frame = withClass(filler, 'image-frame');
    looks(frame, {
      flex: '1',
      'align-self': 'stretch',
      'margin-right': undefined,
      'padding-right': undefined,
    });
    assert.strictEqual(
      cascaded(frame, 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
  });

  test("opens the search over the commit column's title without moving its field or back button", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(cascaded(title, 'height'), 'var(--title-height)');
    assert.match(cascaded(title, 'border-bottom') ?? '', /^1px solid /);
    assert.match(
      cascaded(
        withClass(locationsPopup(''), 'locations-groups'),
        'border-top',
      ) ?? '',
      /^1px solid /,
    );
    const edge = cascaded(withClass(title, 'column-start'), 'left');
    assert.match(edge ?? '', /^\d+px$/);
    looks(withClass(locationsPopup(''), 'locations-search-row'), {
      height: 'calc(var(--title-height) - 1px)',
      'box-sizing': 'border-box',
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
      padding: `0 var(--search-gap) 0 ${edge}`,
    });
  });

  test('wraps long lines of code at spaces, breaking a word only where it would not fit, in rows as tall as their lines', () => {
    const inline = shownRow(diffView({ wordWrap: true }, inlineLine('added')));
    looks(inline, { width: '100%' });
    looks(withClass(inline, 'text-line'), {
      height: 'auto',
      'min-height': 'var(--diff-line-height)',
    });
    looks(withClass(inline, 'code'), {
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
      'min-width': '0',
    });
    const split = shownRow(
      diffView(
        { sideBySide: true, wordWrap: true },
        splitLine('removed', 'added'),
      ),
    );
    for (const side of allWithClass(split, 'split-code')) {
      looks(withClass(side, 'code'), {
        display: 'block',
        transform: 'none',
        'white-space': 'pre-wrap',
      });
    }
  });

  test('ends the lines that reach the right edge before the minimap, wrapped or scrolled sideways, keeping their rows tinted under it', () => {
    const clear = 'calc(var(--diff-code-padding) + var(--minimap-width))';
    for (const wordWrap of [false, true]) {
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('added'))),
          'code',
        ),
        { 'padding-right': clear },
      );
      const [left, right] = allWithClass(
        shownRow(diffView({ sideBySide: true, wordWrap }, splitLine('', ''))),
        'split-side',
      ).map((side) => withClass(side, 'code'));
      looks(left, { 'padding-right': undefined });
      looks(right, { 'padding-right': clear });
    }
  });

  test('draws a tab in the code as wide as the wrapping and the hidden changes count it', () => {
    for (const wordWrap of [false, true]) {
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('context'))),
          'code',
        ),
        { 'tab-size': 'var(--diff-tab-size)' },
      );
    }
    assert.strictEqual(layoutVariables['--diff-tab-size'], String(tabSize));
  });

  test('writes the title of the checked-out commit in bold', () => {
    looks(withClass(rendered(commitRow({ headCommit: 'a' })), 'subject'), {
      'font-weight': '600',
    });
    looks(withClass(rendered(commitRow({ headCommit: 'b' })), 'subject'), {
      'font-weight': undefined,
    });
  });

  test('fills and edges the search field in the border color until it is used, and draws the strip between hunks in it', () => {
    looks(withClass(addressBar(), 'address-bar'), {
      background: 'var(--color-border)',
      border: '1px solid var(--color-border)',
    });
    looks(
      withClass(
        diffView({}, diffRow(createElement(HunkDivider))),
        'hunk-divider',
      ),
      { background: 'var(--color-border)' },
    );
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
      withClass(worktreeBar([worktree('a')]), 'tab'),
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
      withClass(tabBar(), 'tab-add'),
      withClass(tabBar(), 'tab-close'),
      withClass(notices(), 'notice-close'),
    ]) {
      looks(button, { background: 'var(--hover-background)' }, hovered);
    }
    looks(soloButton(true, false), {
      background: 'var(--toggle-on-background)',
    });
  });

  test("edges the popup's search box in the border color, and tints the hovered search field like anything else hovered, its edge included", () => {
    looks(withClass(locationsPopup(''), 'locations-search'), {
      background: 'var(--color-panel-background)',
      border: '1px solid var(--color-border)',
    });
    looks(
      withClass(addressBar(), 'address-bar'),
      {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--color-border)',
        'border-color': 'transparent',
      },
      hovered,
    );
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

  test('draws the minimap marks as see-through as the theme says', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ]) {
      looks(withClass(minimap(), 'minimap-mark', kind), {
        opacity: undefined,
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-minimap), transparent )`,
      });
    }
  });

  test('tints the line numbers of a changed line with its row, and its changed characters as strongly as the theme says', () => {
    for (const [kind, color, word] of [
      ['added', 'added', 'word-added'],
      ['removed', 'deleted', 'word-removed'],
    ] as const) {
      const inline = shownRow(
        diffView({}, inlineLine(kind, { words: [{ start: 0, end: 1 }] })),
      );
      looks(withClass(inline, word), {
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-line), transparent )`,
      });
      const split = shownRow(
        diffView(
          { sideBySide: true },
          splitLine(
            kind === 'removed' ? kind : '',
            kind === 'added' ? kind : '',
          ),
        ),
      );
      for (const number of [
        ...allWithClass(inline, 'number'),
        ...allWithClass(split, 'number'),
      ]) {
        looks(number, { background: undefined, 'background-color': undefined });
      }
    }
  });

  test('tints the whole row of every added and removed line more lightly, as the theme says, in the colors their minimap marks are drawn in', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const tint = {
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-row), transparent )`,
      };
      looks(withClass(diffView({}, inlineLine(kind)), 'text-line'), tint);
      looks(
        withClass(
          diffView(
            { sideBySide: true },
            splitLine(
              kind === 'removed' ? kind : '',
              kind === 'added' ? kind : '',
            ),
          ),
          'split-side',
          kind,
        ),
        tint,
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
      background: 'var(--color-border)',
    });
    looks(
      withClass(contextMenu(), 'menu-item'),
      { background: 'var(--selection-background)' },
      hovered,
    );
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

  test('dims a clean working tree like an author or a folder', () => {
    looks(withClass(workingTreeRow(0), 'subject'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(workingTreeRow(1), 'subject'), { opacity: undefined });
  });

  test('draws every bubble but the checked-out one alike, in the bubble colors, ringed inside in the bubble border color to stand apart from a selected row', () => {
    const all = bubbles().filter(
      (bubble) => !bubble.classes.includes('checked-out'),
    );
    for (const kind of [
      'branch',
      'remote',
      'tag',
      'stash',
      'hash',
      'missing',
    ]) {
      assert.ok(
        all.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    for (const bubble of all) {
      looks(bubble, {
        color: 'var(--color-bubble-foreground)',
        background: 'var(--color-bubble)',
        'box-shadow': 'inset 0 0 0 1px var(--color-bubble-border)',
        border: undefined,
      });
    }
  });

  test('draws the button that shows a large diff, and the edge of a notice, in the solid focus color', () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'large-diff' },
            createElement('button', { className: 'show' }),
          ),
        ),
        'show',
      ),
      {
        color: 'var(--color-focus-foreground)',
        background:
          'linear-gradient(var(--color-focus), var(--color-focus)), var(--color-panel-background)',
      },
    );
    looks(withClass(notices('info'), 'notice'), {
      'border-left': '3px solid var(--color-focus)',
    });
  });

  test('fills the checked-out bubble with its own colors, and no bubble changes under the pointer', () => {
    const all = bubbles('main');
    const checkedOut = all.filter((bubble) =>
      bubble.classes.includes('checked-out'),
    );
    for (const kind of ['head', 'branch']) {
      assert.ok(
        checkedOut.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    for (const bubble of checkedOut) {
      looks(bubble, {
        color: 'var(--color-bubble-checked-out-foreground)',
        background: 'var(--color-bubble-checked-out)',
        'box-shadow': 'inset 0 0 0 1px var(--color-bubble-checked-out-border)',
        border: undefined,
      });
    }
    assert.ok(all.some((bubble) => bubble.parent?.classes.includes('active')));
    for (const bubble of all) {
      looksAlike(bubble, bubbleLook, hovered);
    }
  });

  test('hides every column but the commits while no commit is selected', () => {
    assert.deepStrictEqual(columnVisibility(undefined), [
      undefined,
      'hidden',
      'hidden',
    ]);
    assert.deepStrictEqual(columnVisibility('a'), [
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('grabs a column edge over the gap between the columns without painting it, even while dragging', () => {
    const resizer = withClass(columns(columnsClass(true, 'a')), 'resizer');
    looks(resizer, {
      width: '6px',
      right: 'calc(-3px - var(--gutter-width) / 2)',
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
    const spinning = { animation: 'spin 1s linear infinite' };
    looks(
      withClass(rendered(navButtons({ fetching: true })), 'spin-icon'),
      spinning,
    );
    looks(withClass(soloButton(false, true), 'spin-icon'), spinning);
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
    looks(mark, {
      position: 'absolute',
      'border-radius': '50%',
      background: 'var(--color-focus)',
    });
    looks(mark?.parent, { position: 'relative' });
    assert.deepStrictEqual(
      allWithClass(rendered(menuButton()), 'menu-mark'),
      [],
    );
  });

  test('draws a commit row and the one-line working tree row as tall as the list expects, as even lines of text', () => {
    const commit = rendered(commitRow({ refs: repository.refs }));
    const { frame, line } = frameAndLine(commit);
    assert.strictEqual(frame + 2 * line, commitRowHeight);
    const workingTree = frameAndLine(workingTreeRow(1));
    assert.strictEqual(
      workingTree.frame + workingTree.line,
      workingTreeRowHeight,
    );
    looks(withClass(commit, 'commit-line', 'secondary'), {
      height: `${line}px`,
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
    });
    looks(withClass(commit, 'bubble-line'), {
      'line-height': `${bubbleLineHeight}px`,
    });
    assert.strictEqual(bubbleLineHeight, line);
  });

  test('draws bubbles as text in the flow of their line, starting where the other lines start, their pill around it taking no room', () => {
    const commit = rendered(commitRow({ refs: repository.refs }));
    for (const badge of allWithClass(commit, 'badge')) {
      looks(badge, {
        display: 'inline',
        'line-height': 'inherit',
        'box-decoration-break': 'clone',
        margin:
          '0 calc(4px + var(--bubble-inset)) 0 calc(-1 * var(--bubble-inset))',
        padding: '1px var(--bubble-inset)',
      });
    }
    looks(withClass(commit, 'bubble-line'), {
      'margin-left': 'calc(-1 * var(--bubble-inset))',
      'padding-left': 'var(--bubble-inset)',
    });
  });

  test("draws the bubbles of a commit a search found as in the commit list, cutting off only a ref that is a result's own row", () => {
    const commit = commitRow({
      refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
    });
    assert.deepStrictEqual(
      badgeRules(createElement('div', { className: 'locations-list' }, commit)),
      badgeRules(commit),
    );
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'locations-list' },
            createElement(
              'div',
              { className: 'row result' },
              createElement(RefBubble, {
                info: { kind: 'branch', name: 'main' },
              }),
            ),
          ),
        ),
        'badge',
      ),
      { overflow: 'hidden', 'text-overflow': 'ellipsis' },
    );
  });

  test('gives a row of the other columns the fixed height of a diff row, whatever the font, so the columns line up', () => {
    for (const row of [fileRow(fileChange('src/a.ts')), folderRow()]) {
      looks(row, {
        'box-sizing': 'border-box',
        height: `${rowHeight({ kind: 'hunk', file: 0 })}px`,
      });
    }
  });

  test('puts the dots of a hunk divider under the line numbers, in both of them inline and in the one of a side by side', () => {
    looks(hunkDots(false), { width: 'calc(2 * var(--diff-number-width))' });
    looks(hunkDots(true), { width: 'var(--diff-number-width)' });
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
      withClass(worktreeBar(undefined), 'skeleton-tab'),
    ]) {
      looks(placeholder, { background: 'none' }, hovered);
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

  test("edges a popup with an inset shadow rather than a border, which Chromium rounds to whole device pixels, shifting the popup's contents at scales like 125%", () => {
    assert.match(
      bodyVariable('popup-shadow') ?? '',
      /^inset 0 0 0 1px var\(--color-border\),/,
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

  test('shows that nothing changed above the empty list, which still fills the column to take the keys', () => {
    const column = rendered(
      renderedBy(Column, {
        children: [
          createElement(VirtualRows, {
            key: 'rows',
            rows: listedFilesRows([]),
            renderRow: noop,
            selectedKey: undefined,
          }),
          createElement('div', { key: 'empty', className: 'empty-state' }),
        ],
      }),
    );
    looks(withClass(column, 'column-body'), {
      display: 'flex',
      'flex-direction': 'column',
    });
    looks(withClass(column, 'empty-state'), { order: '-1' });
    looks(withClass(column, 'virtual-rows-frame'), {
      flex: '1',
      'min-height': '0',
    });
  });

  test('keeps the button of a file header clear of the minimap, within the header', () => {
    const header = withClass(
      diffView(
        {},
        diffRow(
          createElement(FileHeader, {
            path: 'v.svg',
            open: true,
            whole: false,
            onClick: noop,
            preview: 'image',
            onRender: noop,
          }),
        ),
      ),
      'file-header',
    );
    looks(header, {
      padding: '4px calc(8px + var(--minimap-width)) 4px 8px',
      height: 'var(--diff-file-height)',
    });
    looks(withClass(header, 'file-header-button'), {
      height: '18px',
      margin: '-2px 0',
    });
    assert.strictEqual(
      rowHeight({ kind: 'file', file: 0, path: 'v.svg', open: true }),
      22,
    );
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
          }),
        ),
        'error-message',
      ),
    ]) {
      looks(selectable, { 'user-select': 'text' });
    }
    looks(withClass(view, 'file-header'), { 'user-select': 'none' });
  });

  test('draws an error notice by the notice rules alone, like any other notice but for its edge', () => {
    const rules = matchingRules(withClass(notices(), 'notice'));
    assert.deepStrictEqual(
      rules.map((rule) => rule.selector),
      ['.notice', '.notice.error'],
    );
    assert.deepStrictEqual(
      [...(rules.at(-1)?.declarations.keys() ?? [])],
      ['border-left-color'],
    );
  });

  test('strikes a deleted file through, in the text color like the other changes', () => {
    looks(withClass(fileRow(fileChange('src/a.ts', { status: 'D' })), 'path'), {
      'text-decoration': 'line-through',
      color: undefined,
    });
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
      addressBar(),
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

  test("centers the search field's text by its capitals and baseline, whatever the font's own spacing, clipping only sideways so the round tops of letters above the capitals show", () => {
    looks(withClass(addressBar(), 'address-text'), {
      'text-box': 'trim-both cap alphabetic',
      overflow: undefined,
      'overflow-x': 'clip',
      'overflow-y': 'visible',
    });
  });

  test('keeps one gutter at the left edge when the commits are hidden, the gap after their empty column', () => {
    looks(columns(columnsClass(true, 'a')), {
      padding: '0 var(--gutter-width) var(--gutter-width)',
      'padding-left': undefined,
      gap: 'var(--gutter-width)',
    });
    looks(columns(columnsClass(false, 'a')), { 'padding-left': '0' });
  });

  test('keeps the arrow cursor of a desktop app, but for resizing and typing', () => {
    assert.deepStrictEqual(
      [
        ...new Set(
          [...css.matchAll(/cursor: ([^;]+);/g)].map((match) => match[1]),
        ),
      ],
      ['col-resize', 'text'],
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
      withClass(tabBar(), 'tab-close'),
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
    assert.deepStrictEqual(
      [...css.matchAll(/opacity: (0\.\d+);/g)].map((match) => match[1]),
      ['0.15'],
    );
    looks(withClass(skeletonRow(), 'bar'), { opacity: '0.15' });
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

  test('highlights what a find in the diff matched in the search match colors, edging the current match, and ticks the minimap in them', () => {
    const [match, current] = allWithClass(
      diffView(
        {},
        inlineLine('context', {
          finds: [
            { start: 0, end: 1 },
            { start: 2, end: 3 },
          ],
          current: { start: 2, end: 3 },
        }),
      ),
      'find-match',
    );
    const colors = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
    };
    looks(match, { ...colors, 'box-shadow': undefined });
    looks(current, {
      ...colors,
      'box-shadow': '0 0 0 1px var(--color-search-match-foreground)',
    });
    assert.ok(current.classes.includes('current'));
    looks(withClass(minimap(), 'minimap-mark', 'match'), {
      background: 'var(--color-search-match)',
    });
  });

  test('draws the find field like the resting search field, edged in the focus color while typing in it', () => {
    looks(diffFind(), {
      background: 'var(--color-border)',
      border: '1px solid var(--color-border)',
    });
    for (const field of [diffFind(), diffFind('a')]) {
      looks(
        field,
        { 'border-color': 'var(--color-focus)' },
        { focus: withClass(field, 'diff-find-input') },
      );
    }
  });

  test('keeps the titles clear of the three buttons the Files column has on the left, and of the buttons and gaps the Diff column has on the left and the two on the right, its search field never squeezed out', () => {
    const files = columnTitle(
      createElement('div', { className: 'nav-buttons all-files' }),
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      buttonsWidth(3),
    );
    const options = diffOptions();
    const slots = allWithClass(rendered(options)).filter(
      (element) =>
        element.classes.includes('nav-button') ||
        element.classes.includes('nav-button-space'),
    ).length;
    const diff = columnTitle(options);
    assert.strictEqual(
      pixels(cascaded(diff, 'padding-left')),
      buttonsWidth(slots),
    );
    assert.strictEqual(
      pixels(cascaded(diff, 'padding-right')),
      buttonsWidth(2),
    );
    for (const group of [
      withClass(diff, 'nav-buttons'),
      withClass(diff, 'segmented'),
      withClass(diff, 'pin-pair'),
    ]) {
      looks(group, {
        gap: `${buttonGap}px`,
        border: undefined,
        padding: undefined,
      });
    }
    looks(diffFind(), { 'min-width': '100px' });
  });

  test('fills a pinned pair as one undimmed switched-on toggle, and lifts the chosen and the hovered layout button onto the panel inside their ring', () => {
    const pinned = rendered(diffOptions({ pinned: true }));
    const pair = withClass(pinned, 'pin-pair');
    looks(pair, { background: 'var(--toggle-on-background)' });
    const [entire, pin] = allWithClass(pair, 'nav-button', 'active');
    assert.ok(entire.attributes.has('disabled'));
    looks(entire, { opacity: '1', background: 'none' });
    looks(pin, { background: 'none' });
    for (const button of [
      entire,
      pin,
      ...allWithClass(
        withClass(rendered(diffOptions()), 'pin-pair'),
        'nav-button',
      ),
    ]) {
      looks(button, { color: 'var(--color-foreground)' });
    }
    const [chosen, other] = allWithClass(
      withClass(pinned, 'segmented'),
      'nav-button',
    );
    assert.ok(chosen.classes.includes('active'));
    looks(chosen, {
      background:
        'linear-gradient(var(--toggle-on-background), var(--toggle-on-background)), var(--color-panel-background)',
    });
    looks(other, { background: 'var(--color-panel-background)' }, hovered);
  });

  test('divides the two sides with one line from top to bottom, across headers and hunk gaps, letting the pointer through', () => {
    const view = diffView({ sideBySide: true }, splitLine('', ''));
    looks(
      view,
      {
        content: "''",
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: '50%',
        width: '1px',
        background: 'var(--color-border)',
        'pointer-events': 'none',
      },
      after,
    );
    const [left, right] = allWithClass(shownRow(view), 'split-side').map(
      (side) => matchingRules(side).map((rule) => rule.selector),
    );
    assert.deepStrictEqual(right, left);
  });

  test('tints a side a change lacks like the change, its stripes as strongly as a changed word, for lines, files, images and previews alike', () => {
    for (const [kind, change] of [
      ['addition', 'added'],
      ['removal', 'removed'],
    ] as const) {
      const fillers = [
        lineFiller(`filler ${kind}`),
        withClass(
          rendered(
            createElement('div', {
              className: `markdown-pane filler ${kind}`,
            }),
          ),
          'markdown-pane',
        ),
        withClass(
          rendered(
            createElement(
              'div',
              { className: `image-pane filler ${kind}` },
              createElement('div', { className: 'image-frame' }),
            ),
          ),
          'image-frame',
        ),
      ];
      for (const filler of fillers) {
        assert.strictEqual(
          cascaded(filler, 'background-color'),
          lineTint(change),
        );
        assert.match(cascaded(filler, 'background') ?? '', /linear-gradient/);
        assert.strictEqual(
          cascaded(filler, '--filler-stripe'),
          change === 'added'
            ? 'color-mix( in srgb, var(--color-added) var(--color-added-line), transparent )'
            : 'color-mix( in srgb, var(--color-deleted) var(--color-deleted-line), transparent )',
        );
      }
    }
  });

  test('stripes the empty side of a change in the border color, in tiles that meet across rows', () => {
    const filler =
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'split-side',
          'filler',
        ),
        'background',
      ) ?? '';
    assert.match(
      filler,
      /linear-gradient\( -45deg, var\(--filler-stripe, var\(--color-border\)\)/,
    );
    const tile = /\/ (\d+)px (\d+)px$/.exec(filler);
    assert.ok(tile, filler);
    const height = rowHeight({
      kind: 'split',
      file: 0,
      left: undefined,
      right: undefined,
    });
    assert.ok(height !== undefined);
    assert.strictEqual(height % Number(tile[2]), 0);
  });

  test('draws no focus outline around the commit list, whose selected row shows where the keys go', () => {
    const list = rendered(
      createElement('div', {
        className: 'virtual-rows list',
        [columnFocusAttribute]: '',
      }),
    );
    for (const states of [{}, focused]) {
      looks(list, { outline: 'none' }, states);
    }
  });

  test('keeps the search fields clear of the active column edge, the title holding both fields at one height', () => {
    const column = rendered(renderedBy(Column, { children: null }));
    const px = (name: string) => {
      const match = /^(\d+)px$/.exec(cascaded(column, `--${name}`) ?? '');
      assert.ok(match, name);
      return Number(match[1]);
    };
    const edge = 2;
    const above = (px('title-height') - 1 - px('search-height')) / 2;
    assert.ok(above - edge >= 2, String(above));
    for (const field of [
      diffFind(),
      withClass(locationsPopup(''), 'locations-search'),
      withClass(addressBar(), 'address-bar'),
    ]) {
      looks(field, { height: 'var(--search-height)' });
    }
  });

  test('gives the keys of every shortcut group the same share of the width, wrapping a long list of them, so the actions line up', () => {
    for (const list of allWithClass(shortcutsPopup(), 'shortcuts-list')) {
      looks(list, { 'grid-template-columns': '48% 1fr' });
    }
    for (const keys of allWithClass(shortcutsPopup(), 'shortcut-keys')) {
      looks(keys, { 'flex-wrap': 'wrap' });
    }
  });

  test('draws the shortcuts over the notices and menus, but under the overlay scrollbars', () => {
    const shortcuts = layer(shortcutsPopup());
    for (const below of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(shortcuts > layer(below), below.classes.join(' '));
    }
    assert.ok(layer(overlayScrollbar()) > shortcuts);
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

  test('draws a menu, a context menu and so their submenus over the notices, which take the pointer only on a notice, and both under the overlay scrollbars', () => {
    assert.strictEqual(cascaded(contextMenu(), 'position'), 'fixed');
    assert.ok(layer(contextMenu()) > layer(notices()));
    assert.ok(layer(historyMenu()) > layer(notices()));
    assert.ok(layer(overlayScrollbar()) > layer(contextMenu()));
    looks(notices(), { 'pointer-events': 'none' });
    looks(withClass(notices(), 'notice'), { 'pointer-events': 'auto' });
  });

  test('edges the active column in the focus color, over its contents but letting the pointer through, and outlines nothing in it', () => {
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
            content: shown ? "''" : undefined,
            position: shown ? 'absolute' : undefined,
            'box-shadow': shown
              ? 'inset 0 0 0 2px var(--color-focus)'
              : undefined,
            'pointer-events': shown ? 'none' : undefined,
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

  test('mutes the search placeholders like other muted text', () => {
    looks(withClass(addressBar(), 'address-text', 'empty'), {
      color: 'var(--muted-foreground)',
    });
    for (const field of [
      withClass(locationsPopup(''), 'locations-search'),
      withClass(diffFind(), 'diff-find-input'),
    ]) {
      looks(
        field,
        { color: 'var(--muted-foreground)' },
        { pseudoElement: '::placeholder' },
      );
    }
  });
});
