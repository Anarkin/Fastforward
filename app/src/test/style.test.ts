import * as assert from 'node:assert';
import { commitRowHeight, workingTreeRowHeight } from '../webview/commitList';
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

  test('tints a selection with the accent color, apart from the shaded background', () => {
    const selected = declarationsOf('.row.selected,\n.commit.selected');
    assert.match(
      selected,
      /background: color-mix\(\s*in srgb,\s*var\(--color-focus-border\)/,
    );
    assert.doesNotMatch(selected, /shade-background/);
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

  test('draws a commit row and the one-line working tree row as tall as the list expects', () => {
    const commit = /padding: (\d+)px \d+px (\d+)px;/.exec(
      declarationsOf('.commit'),
    );
    assert.ok(commit);
    const border = /border-bottom: (\d+)px/.exec(declarationsOf('.commit'));
    assert.ok(border);
    const line = /height: (\d+)px;/.exec(declarationsOf('.commit-line'));
    assert.ok(line);
    const secondary = declarationsOf('.commit-line.secondary');
    const second = /height: (\d+)px;/.exec(secondary);
    const gap = /margin-top: (\d+)px;/.exec(secondary);
    assert.ok(second && gap);
    const frame = Number(commit[1]) + Number(commit[2]) + Number(border[1]);
    const oneLine = frame + Number(line[1]);
    assert.strictEqual(oneLine, workingTreeRowHeight);
    assert.strictEqual(
      oneLine + Number(gap[1]) + Number(second[1]),
      commitRowHeight,
    );
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
      /color: var\(--color-menu-selection-foreground\);/,
    );
    assert.doesNotMatch(css, /\.menu-item:hover\s*{/);
  });

  test('spaces the mode switch and its pill with transparent borders, which Chromium snaps evenly on both sides at any scale', () => {
    const track = declarationsOf('.switch');
    assert.match(
      declarationsOf('.column-footer'),
      /height: var\(--title-height\);/,
    );
    assert.match(track, /height: 100%;/);
    assert.match(track, /border: [\d.]+px solid transparent;/);
    assert.match(track, /background-clip: padding-box;/);
    assert.doesNotMatch(track, /padding:/);
    const option = declarationsOf('.switch-option');
    assert.match(option, /height: 100%;/);
    assert.match(option, /border: \d+px solid transparent;/);
    assert.match(option, /position: relative;/);
    assert.doesNotMatch(declarationsOf('.switch-option.active'), /background/);
    const pill = declarationsOf('.switch-option.active::before');
    assert.match(pill, /position: absolute;/);
    assert.match(pill, /inset: 0;/);
    assert.match(pill, /background: var\(--color-background\);/);
  });

  test('edges a popup with an inset shadow rather than a border', () => {
    assert.match(
      css,
      /--popup-shadow:\s*inset 0 0 0 1px var\(--color-widget-border\)/,
    );
  });

  test("sits a shortcut's key on the text baseline without VS Code's shadow, its top padding making up for the thicker bottom border", () => {
    const key = declarationsOf('.shortcuts-list kbd');
    assert.match(key, /vertical-align: baseline;/);
    assert.match(key, /box-shadow: none;/);
    assert.match(key, /padding: 1px 6px 0;/);
    assert.match(key, /border: 1px solid/);
    assert.match(key, /border-bottom: 2px solid/);
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    assert.match(
      declarationsOf('.locations-list .tree-row.sticky:hover'),
      /background:\s*linear-gradient\(\s*var\(--color-list-hover-background\),\s*var\(--color-list-hover-background\)\s*\),\s*var\(--popup-background\);/,
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
});
