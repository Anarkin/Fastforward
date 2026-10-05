import * as assert from 'node:assert';
import { columnFocusAttribute } from '../webview/activeColumn';
import { RefBubble } from '../webview/bubbles';
import { changesTreeElement } from '../webview/changesTree';
import { Column } from '../webview/column';
import {
  bubbleLineHeight,
  commitRowHeight,
  CommitRow,
  workingTreeRowHeight,
} from '../webview/commitList';
import { ContextMenu } from '../webview/contextMenu';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiffOptions } from '../webview/diffColumn';
import { rowHeight } from '../webview/diffView';
import { NavButtons } from '../webview/navBar';
import { Notices } from '../webview/notices';
import { overlayScrollbarClass } from '../webview/overlayScrollbars';
import { codePadding, numberWidth } from '../webview/overflow';
import {
  cascaded,
  matchingRules,
  rendered,
  withClass,
  type MarkupElement,
} from './cascade';
import { commitInfo, renderedBy, stylesheet } from './fixtures';

const css = stylesheet();

function declarationsOf(selector: string): string {
  const escaped = selector.replace(/[.()[\]]/g, '\\$&');
  const rule = new RegExp(`(^|,\\s*)${escaped}\\s*(,[^{]*)?{([^}]*)}`, 'm');
  const match = rule.exec(css);
  assert.ok(match, selector);
  return match[3];
}

function level(selector: string): number {
  const match = /z-index: (\d+);/.exec(declarationsOf(selector));
  assert.ok(match, selector);
  return Number(match[1]);
}

function variablePx(name: string): number {
  const match = new RegExp(`--${name}: (\\d+)px;`).exec(css);
  assert.ok(match, name);
  return Number(match[1]);
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

function columnTitle(start: React.ReactNode): MarkupElement {
  return withClass(
    rendered(renderedBy(Column, { start, children: null })),
    'column-title',
  );
}

function commitColumnTitle(autoFetchMinutes: number): MarkupElement {
  return columnTitle(
    createElement(NavButtons, {
      back: [],
      forward: [],
      onNavigate: () => undefined,
      fetching: false,
      onFetch: () => undefined,
      autoFetch: false,
      autoFetchMinutes,
      onAutoFetch: () => undefined,
    }),
  );
}

function layer(element: MarkupElement): number {
  return Number(cascaded(element, 'z-index'));
}

function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const edge = 4;
    const button = 26;
    const gap = 2;
    const clearance = 8;
    const buttons = (count: number) =>
      edge + count * button + (count - 1) * gap + clearance;
    const title = commitColumnTitle(0);
    assert.strictEqual(pixels(cascaded(title, 'padding-left')), buttons(3));
    assert.strictEqual(pixels(cascaded(title, 'padding-right')), buttons(2));
    const withAutoFetch = commitColumnTitle(5);
    assert.strictEqual(
      pixels(cascaded(withAutoFetch, 'padding-left')),
      buttons(4),
    );
  });

  test('shades a round button on hover over whatever fill it has, so an active toggle or a pinned pair changes too', () => {
    const hover = declarationsOf('.nav-button:hover:not(:disabled)');
    assert.match(
      hover,
      /^\s*box-shadow: inset 0 0 0 13px var\(--hover-background\);\s*$/,
    );
    assert.match(declarationsOf('.nav-button'), /border-radius: 13px;/);
    assert.match(declarationsOf('.nav-button'), /width: 26px;/);
  });

  test('places the hidden-change markers by the line numbers and padding the diff draws', () => {
    assert.match(
      declarationsOf('.diff-line .number'),
      new RegExp(`width: ${numberWidth}px;`),
    );
    assert.match(
      declarationsOf('.diff-line .code'),
      new RegExp(`padding: 0 ${codePadding}px;`),
    );
  });

  test("opens the search over the commit column's title without moving its field or back button", () => {
    const title = declarationsOf('.column-title');
    const row = declarationsOf('.locations-search-row');
    assert.match(title, /height: var\(--title-height\);/);
    assert.match(title, /border-bottom: 1px solid/);
    assert.match(declarationsOf('.locations-groups'), /border-top: 1px solid/);
    assert.match(row, /height: calc\(var\(--title-height\) - 1px\);/);
    assert.match(row, /box-sizing: border-box;/);
    assert.doesNotMatch(row, /margin/);
    const edge = /left: (\d+px);/.exec(declarationsOf('.column-start'));
    assert.ok(edge);
    assert.match(
      row,
      new RegExp(`padding: 0 var\\(--search-gap\\) 0 ${edge[1]};`),
    );
  });

  test('wraps long lines of code at spaces, breaking a word only where it would not fit, in rows as tall as their lines', () => {
    const code = declarationsOf('.diff-view.wrap .diff-line .code');
    assert.match(code, /white-space: pre-wrap;/);
    assert.match(code, /overflow-wrap: anywhere;/);
    assert.match(code, /min-width: 0;/);
    const line = declarationsOf('.diff-view.wrap .diff-line');
    assert.match(line, /height: auto;/);
    assert.match(line, /min-height: var\(--diff-line-height\);/);
    assert.match(
      declarationsOf('.diff-view.wrap .virtual-row.diff-row'),
      /width: 100%;/,
    );
    const split = declarationsOf('.diff-view.wrap .split-code .code');
    assert.match(split, /display: block;/);
    assert.match(split, /transform: none;/);
  });

  test('wraps the lines that reach the right edge before the minimap, keeping their rows tinted under it', () => {
    for (const selector of [
      '.diff-view.wrap .diff-line:not(.split-side) .code',
      '.diff-view.wrap .split-side:last-child .code',
    ]) {
      assert.match(
        declarationsOf(selector),
        /padding-right: calc\(6px \+ var\(--minimap-width\)\);/,
      );
    }
  });

  test('draws a tab in the code as wide as four spaces', () => {
    assert.match(declarationsOf('.diff-line .code'), /tab-size: 4;/);
  });

  test('writes the title of the checked-out commit in bold', () => {
    assert.match(
      declarationsOf('.commit.checked-out .subject'),
      /font-weight: 600/,
    );
  });

  test('fills and edges the search field in the border color until it is used, and draws the strip between hunks in it', () => {
    const field = declarationsOf('.address-bar');
    assert.ok(field.includes('background: var(--color-border);'));
    assert.ok(field.includes('border: 1px solid var(--color-border);'));
    assert.ok(
      declarationsOf('.hunk-divider').includes(
        'background: var(--color-border);',
      ),
    );
  });

  test('tints a row under the pointer with a see-through touch of the focus color, over whatever lies under it', () => {
    assert.match(
      css,
      /\nbody \{[^}]*--hover-background: color-mix\(\s*in srgb,\s*var\(--color-focus\) var\(--color-focus-hover\),\s*transparent\s*\);/,
    );
    for (const selector of [
      '.tab:not(.active):hover',
      '.row:hover,\n.commit:hover',
    ]) {
      assert.ok(
        declarationsOf(selector).includes(
          'background: var(--hover-background);',
        ),
        selector,
      );
    }
  });

  test('tints a hovered button like a hovered row, and a switched-on toggle as strongly as a selection, both see-through', () => {
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    assert.ok(
      body.includes(
        '--toggle-on-background: color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent );',
      ),
      body,
    );
    for (const selector of ['.tab-add:hover', '.notice-close:hover']) {
      assert.ok(
        declarationsOf(selector).includes(
          'background: var(--hover-background);',
        ),
        selector,
      );
    }
    assert.ok(
      declarationsOf('.nav-button.toggle.active').includes(
        'background: var(--toggle-on-background);',
      ),
    );
  });

  test("edges the popup's search box in the border color, and tints the hovered search field like anything else hovered, its edge included", () => {
    const box = declarationsOf('.locations-search');
    assert.ok(box.includes('background: var(--color-panel-background);'));
    assert.ok(box.includes('border: 1px solid var(--color-border);'));
    const hovered = declarationsOf('.address-bar:hover');
    assert.match(
      hovered,
      /background:\s*linear-gradient\(var\(--hover-background\), var\(--hover-background\)\),\s*var\(--color-border\);/,
    );
    assert.ok(hovered.includes('border-color: transparent;'));
  });

  test('draws the scrollbars and the minimap viewport in the one scrollbar color, as see-through as the theme says at rest, hovered and dragged', () => {
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    for (const [name, state] of [
      ['scrollbar-background', 'rest'],
      ['scrollbar-hover-background', 'hover'],
      ['scrollbar-active-background', 'drag'],
    ]) {
      assert.ok(
        body.includes(
          `--${name}: color-mix( in srgb, var(--color-scrollbar) var(--color-scrollbar-${state}), transparent );`,
        ),
        name,
      );
    }
    for (const [selector, background] of [
      [
        '.overlay-scrollbar',
        'background: var(--scrollbar-background) padding-box;',
      ],
      [
        '.overlay-scrollbar:hover',
        'background-color: var(--scrollbar-hover-background);',
      ],
      [
        '.overlay-scrollbar.dragging',
        'background-color: var(--scrollbar-active-background);',
      ],
      [
        '.minimap-viewport',
        'background: var(--scrollbar-background) padding-box;',
      ],
      [
        '.diff-minimap:hover .minimap-viewport',
        'background-color: var(--scrollbar-hover-background);',
      ],
      [
        '.diff-minimap.dragging .minimap-viewport',
        'background-color: var(--scrollbar-active-background);',
      ],
    ]) {
      assert.ok(declarationsOf(selector).includes(background), selector);
    }
  });

  test('draws the minimap marks as see-through as the theme says', () => {
    const minimap = /\n\.minimap-mark \{([^}]*)\}/.exec(css)?.[1] ?? '';
    assert.doesNotMatch(minimap, /opacity/);
    for (const [selector, color] of [
      ['.minimap-mark.added', 'added'],
      ['.minimap-mark.removed', 'deleted'],
    ]) {
      assert.ok(
        declarationsOf(selector)
          .replace(/\s+/g, ' ')
          .includes(
            `background: color-mix( in srgb, var(--color-${color}) var(--color-${color}-minimap), transparent );`,
          ),
        selector,
      );
    }
  });

  test('tints the line numbers of a changed line with its row, and its changed characters as strongly as the theme says', () => {
    for (const color of ['added', 'deleted']) {
      const word = color === 'added' ? 'word-added' : 'word-removed';
      assert.match(
        css,
        new RegExp(
          `\\n\\.diff-line \\.${word} \\{\\s*background: color-mix\\(\\s*in srgb,\\s*var\\(--color-${color}\\) var\\(--color-${color}-line\\),\\s*transparent\\s*\\);\\s*\\}`,
        ),
        color,
      );
    }
    assert.doesNotMatch(css, /\.diff-line\.(?:added|removed) \.number/);
    assert.doesNotMatch(css, /\.compared/);
  });

  test('tints the whole row of every added and removed line more lightly, as the theme says, in the colors their minimap marks are drawn in', () => {
    for (const [selector, color] of [
      ['.diff-line.added', 'added'],
      ['.diff-line.removed', 'deleted'],
    ]) {
      assert.ok(
        declarationsOf(selector)
          .replace(/\s+/g, ' ')
          .includes(
            `background: color-mix( in srgb, var(--color-${color}) var(--color-${color}-row), transparent );`,
          ),
        selector,
      );
    }
  });

  test('draws a menu like the other popups, its separators in the border color and the item under the pointer like a selected row', () => {
    const menu = declarationsOf('.menu');
    assert.ok(menu.includes('background: var(--color-panel-background);'));
    assert.ok(menu.includes('box-shadow: var(--popup-shadow);'));
    assert.doesNotMatch(menu, /border:/);
    assert.ok(
      declarationsOf('.menu-separator').includes(
        'background: var(--color-border);',
      ),
    );
    assert.ok(
      declarationsOf('.menu-item:hover:not(:disabled)').includes(
        'background: var(--selection-background);',
      ),
    );
  });

  test('tints a selected row and the active search result alike, with the focus color', () => {
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    assert.ok(
      body.includes(
        '--selection-background: color-mix( in srgb, var(--color-focus) var(--color-focus-selected), var(--color-panel-background) );',
      ),
      body,
    );
    for (const selector of [
      '.row.selected,\n.commit.selected',
      '.locations-list .row.result.active',
    ]) {
      assert.ok(
        declarationsOf(selector).includes(
          'background: var(--selection-background);',
        ),
        selector,
      );
    }
  });

  test('dims a clean working tree like an author or a folder', () => {
    assert.match(
      declarationsOf('.commit.working-tree.empty .subject'),
      /opacity: var\(--muted-opacity\);/,
    );
  });

  test('draws every bubble but the checked-out one alike, in the bubble colors, ringed inside in the bubble border color to stand apart from a selected row', () => {
    const badge = declarationsOf('.badge');
    assert.ok(badge.includes('color: var(--color-bubble-foreground);'));
    assert.ok(badge.includes('background: var(--color-bubble);'));
    assert.doesNotMatch(badge, /border:/);
    assert.ok(
      badge.includes('box-shadow: inset 0 0 0 1px var(--color-bubble-border);'),
    );
    assert.doesNotMatch(
      css,
      /\.badge\.(?!checked-out)[a-z-]+(\s*,[^{]*)?\s*\{[^}]*(color|background|border):/,
    );
  });

  test('draws the button that shows a large diff, and the edge of a notice, in the solid focus color', () => {
    const button = declarationsOf('.large-diff button');
    assert.ok(button.includes('color: var(--color-focus-foreground);'));
    assert.match(
      button,
      /background:\s*linear-gradient\(var\(--color-focus\), var\(--color-focus\)\),\s*var\(--color-panel-background\);/,
    );
    assert.ok(
      declarationsOf('.notice').includes(
        'border-left: 3px solid var(--color-focus);',
      ),
    );
  });

  test('fills the checked-out bubble with its own colors, and no bubble changes under the pointer', () => {
    const checkedOut = declarationsOf('.badge.checked-out');
    assert.ok(
      checkedOut.includes('color: var(--color-bubble-checked-out-foreground);'),
    );
    assert.ok(
      checkedOut.includes('background: var(--color-bubble-checked-out);'),
    );
    assert.ok(
      checkedOut.includes(
        'box-shadow: inset 0 0 0 1px var(--color-bubble-checked-out-border);',
      ),
    );
    assert.doesNotMatch(
      css,
      /\.badge[^{]*:hover|\.row(:hover|\.active) \.badge/,
    );
  });

  test('hides every column but the commits while no commit is selected', () => {
    assert.match(
      declarationsOf('.columns.nothing-selected > .column:not(:first-child)'),
      /visibility: hidden;/,
    );
  });

  test('grabs a column edge over the gap between the columns without painting it, even while dragging', () => {
    const resizer = declarationsOf('.resizer');
    assert.match(resizer, /width: 6px;/);
    assert.ok(resizer.includes('right: calc(-3px - var(--gutter-width) / 2);'));
    assert.match(resizer, /cursor: col-resize;/);
    assert.doesNotMatch(css, /\.resizer[^{]*\{[^}]*background/);
  });

  test('spins the icon of a running button', () => {
    assert.match(
      declarationsOf('.nav-button.running .spin-icon'),
      /animation: spin 1s linear infinite;/,
    );
  });

  test('draws a commit row and the one-line working tree row as tall as the list expects, as even lines of text', () => {
    const commit = /padding: (\d+)px \d+px (\d+)px;/.exec(
      declarationsOf('.commit'),
    );
    assert.ok(commit);
    const border = /border-bottom: (\d+)px/.exec(declarationsOf('.commit'));
    assert.ok(border);
    const line = /height: (\d+)px;/.exec(declarationsOf('.commit-line'));
    assert.ok(line);
    const lineHeight = Number(line[1]);
    const frame = Number(commit[1]) + Number(commit[2]) + Number(border[1]);
    assert.strictEqual(frame + lineHeight, workingTreeRowHeight);
    assert.strictEqual(frame + 2 * lineHeight, commitRowHeight);
    assert.doesNotMatch(
      declarationsOf('.commit-line.secondary'),
      /height|margin/,
    );
    assert.match(
      declarationsOf('.bubble-line'),
      new RegExp(`line-height: ${bubbleLineHeight}px;`),
    );
    assert.strictEqual(bubbleLineHeight, lineHeight);
  });

  test('draws bubbles as text in the flow of their line, starting where the other lines start, their pill around it taking no room', () => {
    const badge = declarationsOf('.bubble-line .badge');
    assert.match(badge, /display: inline;/);
    assert.match(badge, /line-height: inherit;/);
    assert.match(badge, /box-decoration-break: clone;/);
    assert.ok(
      badge.includes(
        'margin: 0 calc(4px + var(--bubble-inset)) 0 calc(-1 * var(--bubble-inset));',
      ),
    );
    assert.ok(badge.includes('padding: 1px var(--bubble-inset);'));
    const line = declarationsOf('.bubble-line');
    assert.ok(line.includes('margin-left: calc(-1 * var(--bubble-inset));'));
    assert.ok(line.includes('padding-left: var(--bubble-inset);'));
  });

  test("draws the bubbles of a commit a search found as in the commit list, cutting off only a ref that is a result's own row", () => {
    const commit = createElement(CommitRow, {
      commit: commitInfo('a'),
      selected: undefined,
      headCommit: undefined,
      refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
      detached: false,
      indent: 0,
      onSelect: () => undefined,
    });
    assert.deepStrictEqual(
      badgeRules(createElement('div', { className: 'locations-list' }, commit)),
      badgeRules(commit),
    );
    const ref = withClass(
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
    );
    assert.strictEqual(cascaded(ref, 'overflow'), 'hidden');
    assert.strictEqual(cascaded(ref, 'text-overflow'), 'ellipsis');
  });

  test('gives a row of the other columns the fixed height of a diff row, whatever the font, so the columns line up', () => {
    const row = declarationsOf('.row');
    assert.match(row, /box-sizing: border-box;/);
    assert.match(
      row,
      new RegExp(`height: ${rowHeight({ kind: 'hunk', file: 0 })}px;`),
    );
  });

  test('puts the dots of a hunk divider under the line numbers, in both of them inline and in the one of a side by side', () => {
    const number = /width: (\d+)px;/.exec(declarationsOf('.diff-line .number'));
    assert.ok(number);
    assert.match(
      declarationsOf('.hunk-dots'),
      new RegExp(`width: ${2 * Number(number[1])}px;`),
    );
    assert.match(
      declarationsOf('.side-by-side .hunk-dots'),
      new RegExp(`width: ${number[1]}px;`),
    );
  });

  test('cuts off every long name in a row with an ellipsis', () => {
    assert.match(declarationsOf('.row .path'), /text-overflow: ellipsis/);
  });

  test("lines a folder's name up with the names of the files beside it, leaving no gap after its twisty", () => {
    const folder = rendered(
      changesTreeElement(
        {
          kind: 'folder',
          name: 'src',
          path: 'src',
          depth: 0,
          open: true,
          changed: true,
        },
        {
          showsAll: false,
          onToggle: () => undefined,
          selected: undefined,
          onSelect: () => undefined,
          cursor: undefined,
        },
      ),
    );
    assert.strictEqual(cascaded(folder, 'gap'), undefined);
  });

  test('highlights no loading placeholder on hover', () => {
    for (const placeholder of [
      '.skeleton-row',
      '.commit.placeholder',
      '.hash-suggestion.empty',
    ]) {
      assert.match(
        declarationsOf(`${placeholder}:hover`),
        /background: none/,
        placeholder,
      );
    }
  });

  test('scrolls a submenu taller than the window, which lists every ref at a commit', () => {
    const submenu = declarationsOf('.menu.submenu');
    assert.ok(submenu.includes('box-sizing: border-box;'));
    assert.ok(submenu.includes('max-height: 100vh;'));
    assert.ok(submenu.includes('overflow-y: auto;'));
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
    assert.match(
      declarationsOf('.menu-item:hover:not(:disabled)'),
      /color: var\(--color-foreground\);/,
    );
    assert.doesNotMatch(css, /\.menu-item:hover\s*{/);
  });

  test('highlights the menu item the keys are on like the one under the pointer, without an outline', () => {
    assert.match(
      css,
      /\n\.menu-item:hover:not\(:disabled\),\s*\.menu-item:focus:not\(:disabled\) \{/,
    );
    assert.ok(declarationsOf('.menu-item').includes('outline: none;'));
  });

  test('edges a popup with an inset shadow rather than a border', () => {
    assert.match(
      css,
      /--popup-shadow:\s*inset 0 0 0 1px var\(--color-border\)/,
    );
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    assert.match(
      declarationsOf('.locations-list .tree-row.sticky:hover'),
      /background:\s*linear-gradient\(\s*var\(--hover-background\),\s*var\(--hover-background\)\s*\),\s*var\(--popup-background\);/,
    );
  });

  test('shows that nothing changed above the empty list, which still fills the column to take the keys', () => {
    const body = declarationsOf('.column-body:has(> .empty-state)');
    assert.match(body, /display: flex;/);
    assert.match(body, /flex-direction: column;/);
    assert.match(declarationsOf('.column-body > .empty-state'), /order: -1;/);
    const list = declarationsOf(
      '.column-body:has(> .empty-state) > .virtual-rows-frame',
    );
    assert.match(list, /flex: 1;/);
    assert.match(list, /min-height: 0;/);
  });

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    assert.match(css, /\nbody \{[^}]*user-select: none;/);
    assert.match(
      css,
      /\n\.diff-view,\s*\.error-message,\s*\.notice-message \{\s*user-select: text;\s*\}/,
    );
    assert.match(declarationsOf('.file-header'), /user-select: none;/);
  });

  test('draws an error notice by the notice rules alone, like any other notice but for its edge', () => {
    const notice = withClass(
      rendered(
        createElement(Notices, {
          notices: [{ id: 1, level: 'error', message: 'failed', shownAt: 0 }],
          onDismiss: () => undefined,
        }),
      ),
      'notice',
    );
    assert.deepStrictEqual(
      matchingRules(notice).map((rule) => rule.selector),
      ['.notice', '.notice.error'],
    );
    assert.match(
      declarationsOf('.notice.error'),
      /^\s*border-left-color: [^;]*;\s*$/,
    );
  });

  test('strikes a deleted file through, in the text color like the other changes', () => {
    const deleted = declarationsOf('.row .path.deleted');
    assert.match(deleted, /text-decoration: line-through;/);
    assert.doesNotMatch(deleted, /color:/);
  });

  test('sizes all text by the font size settings, buttons and inputs included', () => {
    assert.deepStrictEqual(
      [...css.matchAll(/font-size: ([^;]+);/g)].map((match) => match[1]),
      ['var(--font-size)', 'var(--monospace-font-size)'],
    );
    assert.match(declarationsOf('button'), /font: inherit;/);
  });

  test("centers the search field's text by its capitals and baseline, whatever the font's own spacing, clipping only sideways so the round tops of letters above the capitals show", () => {
    const text = declarationsOf('.address-text');
    assert.match(text, /text-box: trim-both cap alphabetic;/);
    assert.match(text, /overflow-x: clip;/);
    assert.match(text, /overflow-y: visible;/);
  });

  test('keeps one gutter at the left edge when the commits are hidden, the gap after their empty column', () => {
    const columns = declarationsOf('.columns');
    assert.ok(
      columns.includes('padding: 0 var(--gutter-width) var(--gutter-width);'),
    );
    assert.ok(columns.includes('gap: var(--gutter-width);'));
    assert.match(declarationsOf('.columns.commits-hidden'), /padding-left: 0;/);
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
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    assert.ok(body.includes('--muted-opacity: var(--color-foreground-muted);'));
    assert.ok(
      body.includes(
        '--muted-foreground: color-mix( in srgb, var(--color-foreground) var(--color-foreground-muted), transparent );',
      ),
      body,
    );
    assert.ok(
      declarationsOf('.commit-line.secondary').includes(
        'color: var(--muted-foreground);',
      ),
    );
  });

  test('dims close buttons, disabled controls and a gone bubble like muted text, keeping its own fade only for the loading placeholder', () => {
    for (const selector of [
      '.tab-close',
      '.notice-close',
      '.badge.missing',
      '.menu-item:disabled',
      '.nav-button:disabled',
    ]) {
      const own = new RegExp(
        `\\n${selector.replace(/[.:]/g, '\\$&')} \\{([^}]*)\\}`,
      ).exec(css);
      assert.ok(own?.[1].includes('opacity: var(--muted-opacity);'), selector);
    }
    assert.deepStrictEqual(
      [...css.matchAll(/opacity: (0\.\d+);/g)].map((match) => match[1]),
      ['0.15'],
    );
  });

  test('highlights what a search matched in the search match colors', () => {
    const match = declarationsOf('.locations-list .match');
    assert.ok(match.includes('color: var(--color-search-match-foreground);'));
    assert.ok(match.includes('background: var(--color-search-match);'));
  });

  test('highlights what a find in the diff matched in the search match colors, edging the current match, and ticks the minimap in them', () => {
    const match = declarationsOf('.diff-line .find-match');
    assert.ok(match.includes('color: var(--color-search-match-foreground);'));
    assert.ok(match.includes('background: var(--color-search-match);'));
    assert.ok(
      declarationsOf('.diff-line .find-match.current').includes(
        'box-shadow: 0 0 0 1px var(--color-search-match-foreground);',
      ),
    );
    assert.ok(
      declarationsOf('.minimap-mark.match').includes(
        'background: var(--color-search-match);',
      ),
    );
  });

  test('draws the find field like the resting search field, edged in the focus color while typing in it', () => {
    const field = declarationsOf('.diff-find');
    assert.ok(field.includes('background: var(--color-border);'));
    assert.ok(field.includes('border: 1px solid var(--color-border);'));
    assert.match(
      css,
      /\n\.diff-find:focus-within \{\s*border-color: var\(--color-focus\);\s*\}/,
    );
  });

  test('keeps the titles clear of the three buttons the Files column has on the left, and of the buttons and gaps the Diff column has on the left and the two on the right, its search field never squeezed out', () => {
    const files = columnTitle(
      createElement('div', { className: 'nav-buttons all-files' }),
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      4 + 3 * 26 + 2 * 2 + 8,
    );
    const diffOptions = createElement(DiffOptions, {
      entire: false,
      pinned: false,
      canShow: true,
      ignoreWhitespace: false,
      wordWrap: false,
      onEntire: () => undefined,
      onPin: () => undefined,
      onIgnoreWhitespace: () => undefined,
      onWordWrap: () => undefined,
      layout: 'inline',
      onLayout: () => undefined,
    });
    const options = renderToStaticMarkup(diffOptions);
    const slots = options.match(/class="nav-button[ "-]/g)?.length ?? 0;
    const diff = columnTitle(diffOptions);
    assert.strictEqual(
      pixels(cascaded(diff, 'padding-left')),
      4 + slots * 26 + (slots - 1) * 2 + 8,
    );
    assert.strictEqual(
      pixels(cascaded(diff, 'padding-right')),
      4 + 2 * 26 + 2 + 8,
    );
    const segmented = declarationsOf('.segmented');
    assert.ok(segmented.includes('gap: 2px;'));
    assert.doesNotMatch(segmented, /(^|\s)(border|padding):/);
    assert.match(
      declarationsOf('.segmented > .nav-button:hover:not(:disabled)'),
      /^\s*background: var\(--color-panel-background\);\s*$/,
    );
    assert.doesNotMatch(css, /\.pin-pair[^{]*\{[^}]*color:/);
    const pair = declarationsOf('.pin-pair');
    assert.ok(pair.includes('gap: 2px;'));
    assert.doesNotMatch(pair, /(^|\s)(border|padding):/);
    assert.match(
      declarationsOf('.pin-pair.pinned'),
      /background: var\(--toggle-on-background\);/,
    );
    assert.match(
      declarationsOf('.pin-pair.pinned > .nav-button.toggle.active'),
      /background: none;/,
    );
    assert.match(
      declarationsOf('.pin-pair.pinned > .nav-button:disabled'),
      /opacity: 1;/,
    );
    assert.match(
      declarationsOf('.segmented > .nav-button.toggle.active'),
      /var\(--color-panel-background\);/,
    );
    assert.ok(declarationsOf('.diff-find').includes('min-width: 100px;'));
  });

  test('divides the two sides with one line from top to bottom, across headers and hunk gaps, letting the pointer through', () => {
    const line = declarationsOf('.diff-view.side-by-side::after');
    for (const declaration of [
      'top: 0;',
      'bottom: 0;',
      'left: 50%;',
      'width: 1px;',
      'background: var(--color-border);',
      'pointer-events: none;',
    ]) {
      assert.ok(line.includes(declaration), declaration);
    }
    assert.ok(!css.includes('.split-side + .split-side'));
  });

  test('stripes the empty side of a change in the border color, in tiles that meet across rows', () => {
    const filler = declarationsOf('.split-side.filler').replace(/\s+/g, ' ');
    assert.match(filler, /linear-gradient\( -45deg, var\(--color-border\)/);
    const tile = /\/ (\d+)px (\d+)px;/.exec(filler);
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
    assert.strictEqual(cascaded(list, 'outline'), 'none');
    assert.doesNotMatch(css, /.list:focus/);
  });

  test('keeps the search fields clear of the active column edge, the title holding both fields at one height', () => {
    const edge = 2;
    const above =
      (variablePx('title-height') - 1 - variablePx('search-height')) / 2;
    assert.ok(above - edge >= 2, String(above));
    assert.ok(
      declarationsOf('.diff-find').includes('height: var(--search-height);'),
    );
    assert.ok(
      declarationsOf('.locations-search').includes(
        'height: var(--search-height);',
      ),
    );
  });

  test('draws the active column edge over the search popup that covers the column, but under menus and notices', () => {
    const edge = level(
      ".columns[data-active-column='commits'] > .column:nth-child(1)::after",
    );
    assert.ok(edge > level('.locations-popup'));
    for (const above of ['.menu', '.menu.context-menu', '.notices']) {
      assert.ok(level(above) > edge, above);
    }
  });

  test('draws a context menu, and so its submenus, over the notices, which take the pointer only on a notice, and both under the overlay scrollbars', () => {
    const notices = rendered(
      createElement(Notices, {
        notices: [{ id: 1, level: 'error', message: 'failed', shownAt: 0 }],
        onDismiss: () => undefined,
      }),
    );
    const menu = rendered(
      createElement(ContextMenu, {
        menu: { x: 0, y: 0, items: [{ label: 'Check out' }] },
        onClose: () => undefined,
      }),
    );
    const scrollbar = rendered(
      createElement('div', { className: overlayScrollbarClass }),
    );
    assert.strictEqual(cascaded(menu, 'position'), 'fixed');
    assert.ok(layer(menu) > layer(notices));
    assert.ok(layer(scrollbar) > layer(menu));
    assert.strictEqual(cascaded(notices, 'pointer-events'), 'none');
    assert.strictEqual(
      cascaded(withClass(notices, 'notice'), 'pointer-events'),
      'auto',
    );
  });

  test('edges the active column in the focus color, over its contents but letting the pointer through, and outlines nothing in it', () => {
    const edge = declarationsOf(
      ".columns[data-active-column='commits'] > .column:nth-child(1)::after",
    );
    assert.ok(edge.includes('box-shadow: inset 0 0 0 2px var(--color-focus);'));
    assert.ok(edge.includes('pointer-events: none;'));
    assert.ok(edge.includes('position: absolute;'));
    assert.match(
      css,
      /\.columns\[data-active-column='files'\] > \.column:nth-child\(2\)::after,\s*\.columns\[data-active-column='diff'\] > \.column:nth-child\(3\)::after/,
    );
    assert.ok(declarationsOf('[data-column-focus]').includes('outline: none;'));
  });

  test('mutes the search placeholders like other muted text', () => {
    assert.ok(
      declarationsOf('.address-text.empty').includes(
        'color: var(--muted-foreground);',
      ),
    );
    assert.ok(
      declarationsOf('.locations-search::placeholder').includes(
        'color: var(--muted-foreground);',
      ),
    );
  });
});
