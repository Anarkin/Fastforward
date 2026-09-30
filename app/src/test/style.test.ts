import * as assert from 'node:assert';
import {
  bubbleLineHeight,
  commitRowHeight,
  workingTreeRowHeight,
} from '../webview/commitList';
import { stylesheet } from './fixtures';

const css = stylesheet();

function declarationsOf(selector: string): string {
  const escaped = selector.replace(/[.()]/g, '\\$&');
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
      /\nbody \{[^}]*--hover-background: color-mix\(in srgb, var\(--color-focus\) 8%, transparent\);/,
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
        '--toggle-on-background: color-mix( in srgb, var(--color-focus) 18%, transparent );',
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

  test("edges the popup's search box in the border color, and tints the hovered search field like anything else hovered", () => {
    const box = declarationsOf('.locations-search');
    assert.ok(box.includes('background: var(--color-panel-background);'));
    assert.ok(box.includes('border: 1px solid var(--color-border);'));
    assert.match(
      declarationsOf('.address-bar:hover'),
      /background:\s*linear-gradient\(var\(--hover-background\), var\(--hover-background\)\),\s*var\(--color-border\);/,
    );
  });

  test('draws the scrollbars and the minimap viewport in the one scrollbar color, less see-through when hovered and more when dragged', () => {
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    for (const [name, percent] of <[string, number][]>[
      ['scrollbar-background', 75],
      ['scrollbar-hover-background', 82],
      ['scrollbar-active-background', 88],
    ]) {
      assert.ok(
        body.includes(
          `--${name}: color-mix( in srgb, var(--color-scrollbar) ${percent}%, transparent );`,
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

  test('tints added and removed diff lines with a see-through touch of the colors their minimap marks are drawn in', () => {
    assert.ok(
      declarationsOf('.diff-line.added').includes(
        'background: color-mix(in srgb, var(--color-added) 20%, transparent);',
      ),
    );
    assert.ok(
      declarationsOf('.diff-line.removed').includes(
        'background: color-mix(in srgb, var(--color-deleted) 20%, transparent);',
      ),
    );
  });

  test('tints a selected row, the active search result and the active hash suggestion alike, with the focus color', () => {
    const body = (/\nbody \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(
      /\s+/g,
      ' ',
    );
    assert.ok(
      body.includes(
        '--selection-background: color-mix( in srgb, var(--color-focus) 18%, var(--color-panel-background) );',
      ),
      body,
    );
    for (const selector of [
      '.row.selected,\n.commit.selected',
      '.locations-list .row.result.active',
      '.hash-suggestion.active',
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

  test('draws the checked-out branch in the solid color a branch is tinted with, in the text color made for it', () => {
    assert.match(
      declarationsOf('.badge.branch'),
      /background: color-mix\(\s*in srgb,\s*var\(--color-accent\) 25%/,
    );
    const checkedOut = declarationsOf('.badge.checked-out');
    assert.match(checkedOut, /color: var\(--color-accent-foreground\);/);
    assert.match(checkedOut, /background: var\(--color-accent\);/);
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
      /background-color: var\(--color-accent\);/,
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
      /--popup-shadow:\s*inset 0 0 0 1px var\(--color-widget-border\)/,
    );
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    assert.match(
      declarationsOf('.locations-list .tree-row.sticky:hover'),
      /background:\s*linear-gradient\(\s*var\(--hover-background\),\s*var\(--hover-background\)\s*\),\s*var\(--popup-background\);/,
    );
  });

  test('writes tag badges in the text color, like branch badges', () => {
    assert.match(
      declarationsOf('.badge.tag'),
      /color: var\(--color-foreground\)/,
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
    assert.ok(body.includes('--muted-opacity: 0.45;'));
    assert.ok(
      body.includes(
        '--muted-foreground: color-mix( in srgb, var(--color-foreground) calc(var(--muted-opacity) * 100%), transparent );',
      ),
      body,
    );
    assert.ok(
      declarationsOf('.commit-line.secondary').includes(
        'color: var(--muted-foreground);',
      ),
    );
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
