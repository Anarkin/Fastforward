import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { FolderRow } from '../../../../../tools/git/page/tree';
import { buildTree, indexRefs } from '../../../../../tools/git/page/refIndex';
import { renderToStaticMarkup } from './locationsFixtures';
import {
  currentActive,
  leafIndent,
  nextActive,
  shownChildren,
  type Highlighted,
  stuckRowTop,
} from '../../../../../tools/git/page/locationRows';
import {
  resultItems,
  searchRefs,
} from '../../../../../tools/git/page/locationResults';
import { commitInfo } from '../../../../helpers/gitValues';
import { stylesheetPx } from '../../../../helpers/pageSources';

const branchNamed = (name: string): RefInfo => ({
  kind: 'branch',
  name,
  commit: 'a',
});

const manyBranches = (count: number) =>
  Array.from({ length: count }, (_, index) => branchNamed(`b${index}`));

const childrenDrawn = (count: number) => {
  const { shown, more } = shownChildren(
    buildTree(manyBranches(count)).children,
  );
  return [shown.length, more];
};

const resultsFor = (commits: string[], branches: string[]) =>
  resultItems(
    commits.map((hash) => commitInfo(hash)),
    searchRefs(indexRefs(branches.map(branchNamed)), 'a'),
  );

const folderNameStart = (depth: number) => {
  const html = renderToStaticMarkup(
    FolderRow({
      path: 'f',
      depth,
      open: false,
      className: 'sticky',
      onToggle: () => {},
      children: 'f',
    }),
  );
  const padding = /padding-left:(\d+)px/.exec(html);
  assert.ok(padding, html);
  return (
    Number(padding[1]) + stylesheetPx(/^\.twisty \{[^}]*?\swidth: (\d+)px/m)
  );
};

suite('Locations search', () => {
  test('moves the highlight one result at a time, stopping at either end', () => {
    const items = resultItems(
      [commitInfo('f1')],
      searchRefs(indexRefs([branchNamed('main')]), 'main'),
    );
    assert.strictEqual(nextActive(items, 0, 1), 1);
    assert.strictEqual(nextActive(items, 1, 1), 1);
    assert.strictEqual(nextActive(items, 1, -1), 0);
    assert.strictEqual(nextActive(items, 0, -1), 0);
  });

  test('keeps the highlight on its result while the results change, and otherwise starts at the first', () => {
    const highlight: Highlighted = { query: 'a', key: 'branch:feat/x' };
    assert.strictEqual(
      currentActive(resultsFor([], ['alpha', 'feat/x']), 'a', highlight),
      1,
    );
    assert.strictEqual(
      currentActive(
        resultsFor(['a1'], ['alpha', 'ab', 'feat/x']),
        'a',
        highlight,
      ),
      2,
    );
    assert.strictEqual(
      currentActive(resultsFor(['a1'], ['main']), 'a', highlight),
      0,
    );
    assert.strictEqual(
      currentActive(resultsFor([], ['alpha', 'feat/x']), 'al', highlight),
      0,
    );
  });
});

suite('Locations popup', () => {
  test('draws at most the limit of folders and refs under a folder together, counting the rest', () => {
    const tree = buildTree(['a/1', 'b/1', 'c/1', 'd', 'e'].map(branchNamed));
    const { shown, more } = shownChildren(tree.children, 2);
    assert.deepStrictEqual(
      shown.map((node) => node.name),
      ['a', 'b'],
    );
    assert.strictEqual(more, 3);
  });

  test('draws 200 folders and refs under a folder unless told another limit', () => {
    assert.deepStrictEqual(childrenDrawn(200), [200, 0]);
    assert.deepStrictEqual(childrenDrawn(201), [200, 1]);
  });

  test("stacks stuck folders a line of the line height of the settings apart, as tall as the popup's rows", () => {
    assert.deepStrictEqual([0, 1, 2].map(stuckRowTop), [
      'calc(0 * var(--row-line-height))',
      'calc(1 * var(--row-line-height))',
      'calc(2 * var(--row-line-height))',
    ]);
  });

  test("lines a ref up with the heading, with its folder's name, and with the names past the twisty of the folders beside it", () => {
    assert.strictEqual(
      leafIndent(0, false),
      stylesheetPx(/^\.locations-heading \{[^}]*?\spadding: 0 (\d+)px/m),
    );
    assert.strictEqual(leafIndent(1, false), folderNameStart(0));
    assert.strictEqual(leafIndent(0, true), folderNameStart(0));
    assert.strictEqual(leafIndent(1, true), folderNameStart(1));
  });
});
