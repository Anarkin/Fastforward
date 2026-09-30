import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RefInfo } from '../shared/protocol';
import {
  buildTree,
  currentActive,
  enterTarget,
  leafIndent,
  nextActive,
  searchRefs,
  type Highlighted,
  stickyRowHeight,
} from '../webview/locations';
import { treeIndent, twistyWidth } from '../webview/tree';

const refs: RefInfo[] = [
  { kind: 'remote', name: 'origin/feat/EPMAISA-798-drop', commit: 'a' },
  { kind: 'branch', name: 'main', commit: 'b' },
  { kind: 'tag', name: 'v0.16.4', commit: 'c' },
  { kind: 'branch', name: 'feat/epmaisa-798-drop', commit: 'a' },
  { kind: 'remote', name: 'origin/fix/typo', commit: 'd' },
];

const branchNamed = (name: string): RefInfo => ({
  kind: 'branch',
  name,
  commit: 'a',
});

const names = (groups: ReturnType<typeof searchRefs>) =>
  groups.map((group) => [group.title, group.refs.map((ref) => ref.name)]);

suite('Locations search', () => {
  test('finds parts of names, ignoring case, in a group per kind', () => {
    assert.deepStrictEqual(names(searchRefs(refs, 'Epmaisa-798')), [
      ['Local branches', ['feat/epmaisa-798-drop']],
      ['Remote branches', ['origin/feat/EPMAISA-798-drop']],
      ['Tags', []],
    ]);
  });

  test('keeps every group, also one with no matches', () => {
    assert.deepStrictEqual(names(searchRefs(refs, 'v0.16')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', ['v0.16.4']],
    ]);
  });

  test('draws at most the limit per group and counts the rest', () => {
    const [branches, remotes] = searchRefs(refs, 'o', 1);
    assert.deepStrictEqual([branches.refs.length, branches.more], [1, 0]);
    assert.deepStrictEqual([remotes.refs.length, remotes.more], [1, 1]);
  });

  test('sorts matches by name before cutting them to the limit', () => {
    const [branches] = searchRefs(
      [branchNamed('b1'), branchNamed('a1'), branchNamed('c1')],
      '1',
      2,
    );
    assert.deepStrictEqual(
      branches.refs.map((ref) => ref.name),
      ['a1', 'b1'],
    );
    assert.strictEqual(branches.more, 1);
  });

  test('searches nothing without a query', () => {
    assert.deepStrictEqual(names(searchRefs(refs, '')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', []],
    ]);
  });

  test('moves the highlight through the groups one after another, skipping empty ones', () => {
    const search = searchRefs(
      [
        { kind: 'branch', name: 'main', commit: 'a' },
        { kind: 'branch', name: 'feat/main', commit: 'b' },
        { kind: 'tag', name: 'v1-main', commit: 'c' },
      ],
      'main',
    );
    assert.deepStrictEqual(
      search.map((group) => group.refs.length),
      [2, 0, 1],
    );
    assert.deepStrictEqual(nextActive(search, { column: 0, index: 0 }, 1), {
      column: 0,
      index: 1,
    });
    assert.deepStrictEqual(nextActive(search, { column: 0, index: 1 }, 1), {
      column: 2,
      index: 0,
    });
    assert.deepStrictEqual(nextActive(search, { column: 2, index: 0 }, -1), {
      column: 0,
      index: 1,
    });
    assert.deepStrictEqual(nextActive(search, { column: 2, index: 0 }, 1), {
      column: 2,
      index: 0,
    });
    assert.deepStrictEqual(nextActive(search, { column: 0, index: 0 }, -1), {
      column: 0,
      index: 0,
    });
  });

  test('jumps on Enter to a typed commit, then to the highlighted match', () => {
    const branch = refs[3];
    const commit = 'b'.repeat(40);
    assert.strictEqual(
      enterTarget(
        'ab12',
        { kind: 'found', hash: commit, subject: 's' },
        branch,
      ),
      commit,
    );
    assert.strictEqual(
      enterTarget('ab12', { kind: 'none' }, branch),
      branch.commit,
    );
    assert.strictEqual(enterTarget('feat', undefined, branch), branch.commit);
  });

  test('jumps on Enter to a hash not looked up yet as typed', () => {
    assert.strictEqual(enterTarget('A1B2c3d4', undefined, refs[3]), 'a1b2c3d4');
    assert.strictEqual(enterTarget(' AB12 ', undefined, refs[3]), 'ab12');
  });

  test('keeps the highlight on its ref while the refs change, and otherwise starts at the first match', () => {
    const highlight: Highlighted = {
      query: 'a',
      ref: { kind: 'branch', name: 'feat/x' },
    };
    const before = searchRefs(
      [branchNamed('main'), branchNamed('feat/x')],
      'a',
    );
    assert.deepStrictEqual(currentActive(before, 'a', highlight), {
      column: 0,
      index: 0,
    });
    const shifted = searchRefs(
      [branchNamed('alpha'), branchNamed('main'), branchNamed('feat/x')],
      'a',
    );
    assert.deepStrictEqual(currentActive(shifted, 'a', highlight), {
      column: 0,
      index: 1,
    });
    const gone = searchRefs(
      [branchNamed('main'), { kind: 'tag', name: 'va', commit: 'b' }],
      'a',
    );
    assert.deepStrictEqual(currentActive(gone, 'a', highlight), {
      column: 0,
      index: 0,
    });
    assert.deepStrictEqual(currentActive(shifted, 'al', highlight), {
      column: 0,
      index: 0,
    });
    const tagsOnly = searchRefs(
      [{ kind: 'tag', name: 'va', commit: 'b' }],
      'a',
    );
    assert.deepStrictEqual(currentActive(tagsOnly, 'a', undefined), {
      column: 2,
      index: 0,
    });
  });

  test('does nothing on Enter without a search, which highlights no match', () => {
    assert.strictEqual(enterTarget('', undefined, refs[3]), undefined);
  });
});

suite('Locations popup', () => {
  test('orders a tree folders first, then by name', () => {
    const tags = ['v2', 'v10', 'rel/a', 'alpha'].map((name): RefInfo => ({
      kind: 'tag',
      name,
      commit: 'a',
    }));
    assert.deepStrictEqual(
      buildTree(tags).children.map((node) => node.name),
      ['rel', 'alpha', 'v10', 'v2'],
    );
  });

  test("stacks stuck folders at the height the stylesheet gives the popup's rows", () => {
    const css = readFileSync(
      path.join(__dirname, '../../src/webview/style.css'),
      'utf8',
    );
    const match = /^\.locations-list \.row \{[^}]*?\sheight: (\d+)px/m.exec(
      css,
    );
    assert.ok(match);
    assert.strictEqual(Number(match[1]), stickyRowHeight);
  });

  test('lines a ref up with the heading, leaving room for a twisty only beside a folder', () => {
    assert.strictEqual(leafIndent(0, false), treeIndent(0));
    assert.strictEqual(leafIndent(0, true), treeIndent(0) + twistyWidth);
    assert.strictEqual(leafIndent(1, false), treeIndent(1));
  });
});
