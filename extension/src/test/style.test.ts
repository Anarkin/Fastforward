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
