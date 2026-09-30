import * as assert from 'node:assert';
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
      /background: color-mix\(\s*in srgb,\s*var\(--vscode-focusBorder\)/,
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
      /background: color-mix\(\s*in srgb,\s*var\(--vscode-button-background\) 25%/,
    );
    const checkedOut = declarationsOf('.badge.checked-out');
    assert.match(checkedOut, /color: var\(--vscode-button-foreground\);/);
    assert.match(checkedOut, /background: var\(--vscode-button-background\);/);
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

  test('outlines no loading placeholder on hover in high contrast themes', () => {
    assert.match(
      declarationsOf(
        ':is(.vscode-high-contrast, .vscode-high-contrast-light)\n  :is(.skeleton-row, .commit.placeholder, .hash-suggestion.empty):hover',
      ),
      /outline: none/,
    );
  });

  test('writes tag badges in the text color, like branch badges', () => {
    assert.match(
      declarationsOf('.badge.tag'),
      /color: var\(--vscode-foreground\)/,
    );
  });
});
