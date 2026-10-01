import * as assert from 'node:assert';
import {
  bubbleLineHeight,
  commitRowHeight,
  workingTreeRowHeight,
} from '../webview/commitList';
import { stylesheet } from './fixtures';

const css = stylesheet();

function declarationsOf(selector: string): string {
  const escaped = selector.replace(/[.()[\]]/g, '\\$&');
  const rule = new RegExp(`(^|,\\s*)${escaped}\\s*(,[^{]*)?{([^}]*)}`, 'm');
  const match = rule.exec(css);
  assert.ok(match, selector);
  return match[3];
}

function pixels(declarations: string, property: string): number {
  const match = new RegExp(`${property}: calc\\(([^;]*)\\);`).exec(
    declarations,
  );
  assert.ok(match, property);
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

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const edge = 4;
    const button = 26;
    const gap = 2;
    const clearance = 8;
    const buttons = (count: number) =>
      edge + count * button + (count - 1) * gap + clearance;
    const title = declarationsOf('.column-title:has(.column-start)');
    assert.strictEqual(pixels(title, 'padding-left'), buttons(3));
    assert.strictEqual(pixels(title, 'padding-right'), buttons(2));
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
    for (const selector of [
      '.tab-add:hover',
      '.notice-close:hover',
      '.nav-button:hover:not(:disabled)',
    ]) {
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

  test('tints added and removed diff lines as strongly as the theme says, in the colors their minimap marks are drawn in', () => {
    for (const [selector, color] of [
      ['.diff-line.added', 'added'],
      ['.diff-line.removed', 'deleted'],
    ]) {
      assert.ok(
        declarationsOf(selector)
          .replace(/\s+/g, ' ')
          .includes(
            `background: color-mix( in srgb, var(--color-${color}) var(--color-${color}-line), transparent );`,
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

  test('paints a column resizer no wider than the gap between columns, in the primary color', () => {
    const resizer = declarationsOf('.resizer');
    assert.match(resizer, /box-sizing: border-box;/);
    assert.match(resizer, /width: 6px;/);
    assert.match(
      resizer,
      /padding: 0 calc\(\(6px - var\(--gutter-width\)\) \/ 2\);/,
    );
    assert.match(resizer, /background-clip: content-box;/);
    assert.match(
      declarationsOf('.resizer:hover'),
      /background-color: var\(--color-focus\);/,
    );
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

  test('cuts off every long name in a row with an ellipsis', () => {
    assert.match(declarationsOf('.row .path'), /text-overflow: ellipsis/);
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

  test('highlights no disabled menu item on hover, whose text would vanish in the selection color', () => {
    assert.match(
      declarationsOf('.menu-item:hover:not(:disabled)'),
      /color: var\(--color-foreground\);/,
    );
    assert.doesNotMatch(css, /\.menu-item:hover\s*{/);
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

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    assert.match(css, /\nbody \{[^}]*user-select: none;/);
    assert.match(
      css,
      /\n\.diff-view,\s*\.error,\s*\.notice-message \{\s*user-select: text;\s*\}/,
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

  test('keeps the titles clear of the three buttons the Files column has on the left, and the four the Diff column has on each side', () => {
    const files = declarationsOf('.column-title:has(.all-files)');
    assert.strictEqual(pixels(files, 'padding-left'), 4 + 3 * 26 + 2 * 2 + 8);
    const diff = declarationsOf('.column-title:has(.diff-options)');
    assert.strictEqual(pixels(diff, 'padding-right'), 4 + 4 * 26 + 3 * 2 + 8);
  });

  test('draws no focus outline around the commit list, whose selected row shows where the keys go', () => {
    assert.ok(declarationsOf('.list').includes('outline: none;'));
    assert.doesNotMatch(css, /.list:focus/);
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
