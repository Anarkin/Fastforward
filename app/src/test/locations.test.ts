import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RefInfo } from '../shared/protocol';
import {
  buildTree,
  currentActive,
  enterTarget,
  focusLeaves,
  foundCommits,
  indexRefs,
  itemKey,
  leafIndent,
  nextActive,
  popupKeyAction,
  resultItems,
  searchRefs,
  searchStashes,
  shownChildren,
  type Highlighted,
  stickyRowHeight,
} from '../webview/locations';
import { FolderRow } from '../webview/tree';
import { commitInfo, stylesheetPx } from './fixtures';

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

const manyBranches = (count: number) =>
  Array.from({ length: count }, (_, index) => branchNamed(`b${index}`));

const refsDrawn = (count: number) => {
  const [branches] = searchRefs(indexRefs(manyBranches(count)), 'b');
  return [branches.refs.length, branches.more];
};

const childrenDrawn = (count: number) => {
  const { shown, more } = shownChildren(
    buildTree(manyBranches(count)).children,
  );
  return [shown.length, more];
};

const focused = (inside: boolean, menu = false) => ({
  inside,
  closest: (selector: string) =>
    menu && selector === '.context-menu' ? {} : null,
});

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

const press = {
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  target: null,
};

suite('Locations search', () => {
  test('finds parts of names, ignoring case, in a group per kind', () => {
    assert.deepStrictEqual(names(searchRefs(indexRefs(refs), 'Epmaisa-798')), [
      ['Local branches', ['feat/epmaisa-798-drop']],
      ['Remote branches', ['origin/feat/EPMAISA-798-drop']],
      ['Tags', []],
    ]);
  });

  test('leaves out spaces around the search, as pasted text may have', () => {
    assert.deepStrictEqual(
      names(searchRefs(indexRefs(refs), ' Epmaisa-798 ')),
      names(searchRefs(indexRefs(refs), 'Epmaisa-798')),
    );
  });

  test('keeps every group, also one with no matches', () => {
    assert.deepStrictEqual(names(searchRefs(indexRefs(refs), 'v0.16')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', ['v0.16.4']],
    ]);
  });

  test('draws at most the limit per group and counts the rest', () => {
    const [branches, remotes] = searchRefs(indexRefs(refs), 'o', 1);
    assert.deepStrictEqual([branches.refs.length, branches.more], [1, 0]);
    assert.deepStrictEqual([remotes.refs.length, remotes.more], [1, 1]);
  });

  test('draws 200 refs per group unless told another limit', () => {
    assert.deepStrictEqual(refsDrawn(200), [200, 0]);
    assert.deepStrictEqual(refsDrawn(201), [200, 1]);
  });

  test('sorts matches by name before cutting them to the limit', () => {
    const [branches] = searchRefs(
      indexRefs([branchNamed('b1'), branchNamed('a1'), branchNamed('c1')]),
      '1',
      2,
    );
    assert.deepStrictEqual(
      branches.refs.map((ref) => ref.name),
      ['a1', 'b1'],
    );
    assert.strictEqual(branches.more, 1);
  });

  test('sorts the refs of each kind by name once, for every search after', () => {
    const index = indexRefs([
      branchNamed('b'),
      { kind: 'tag', name: 'v1', commit: 'c' },
      branchNamed('A'),
    ]);
    assert.deepStrictEqual(
      index.map((group) => [group.kind, group.refs.map((ref) => ref.name)]),
      [
        ['branch', ['A', 'b']],
        ['remote', []],
        ['tag', ['v1']],
      ],
    );
  });

  test('searches nothing without a query', () => {
    assert.deepStrictEqual(names(searchRefs(indexRefs(refs), '')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', []],
    ]);
  });

  test('puts the commits a typed hash may be before those found by text, each once', () => {
    const found = foundCommits(
      [commitInfo('a1')],
      [commitInfo('a1'), commitInfo('b2')],
    );
    assert.deepStrictEqual(
      found.map((commit) => commit.hash),
      ['a1', 'b2'],
    );
  });

  test('lists the found commits first, then the matching refs group after group', () => {
    const search = searchRefs(
      indexRefs([
        { kind: 'branch', name: 'main', commit: 'a' },
        { kind: 'tag', name: 'v1-main', commit: 'c' },
        { kind: 'branch', name: 'feat/main', commit: 'b' },
      ]),
      'main',
    );
    assert.deepStrictEqual(
      resultItems([commitInfo('f1'), commitInfo('f2')], search).map(itemKey),
      [
        'commit:f1',
        'commit:f2',
        'branch:feat/main',
        'branch:main',
        'tag:v1-main',
      ],
    );
  });

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

  test('jumps on Enter to the highlighted commit or ref', () => {
    const [commit, branch] = resultItems(
      [commitInfo('b'.repeat(40))],
      searchRefs(indexRefs([refs[3]]), 'feat'),
    );
    const found = { commits: [], more: 0 };
    assert.strictEqual(enterTarget('ab12', found, commit), 'b'.repeat(40));
    assert.strictEqual(enterTarget('ab12', found, branch), refs[3].commit);
    assert.strictEqual(enterTarget('feat', undefined, branch), refs[3].commit);
    assert.strictEqual(enterTarget('zz', undefined, undefined), undefined);
  });

  test('leaves Enter and the arrows to an input method composing text', () => {
    const key = { ...press, isComposing: false, keyCode: 13 };
    assert.strictEqual(popupKeyAction({ ...key, key: 'Enter' }, 'x'), 'enter');
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowDown' }, 'x'), 1);
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowUp' }, 'x'), -1);
    assert.strictEqual(
      popupKeyAction(
        { ...press, key: 'Enter', isComposing: true, keyCode: 13 },
        'x',
      ),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        { ...press, key: 'Enter', isComposing: false, keyCode: 229 },
        'x',
      ),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        { ...press, key: 'ArrowDown', isComposing: true, keyCode: 229 },
        'x',
      ),
      undefined,
    );
  });

  test('finds stashes by name or message, newest first', () => {
    const stashes = [
      { name: 'stash@{0}', commit: 's0', message: 'On main: With new.txt' },
      { name: 'stash@{1}', commit: 's1', message: 'WIP on main: 1a2b3c4 Fix' },
      { name: 'stash@{2}', commit: 's2', message: 'On main: New notes' },
    ];
    const found = (query: string, limit?: number) => {
      const search = searchStashes(stashes, query, limit);
      return [search.stashes.map((stash) => stash.name), search.more];
    };
    assert.deepStrictEqual(found(' NEW '), [['stash@{0}', 'stash@{2}'], 0]);
    assert.deepStrictEqual(found('stash@{1}'), [['stash@{1}'], 0]);
    assert.deepStrictEqual(found('on main', 1), [['stash@{0}'], 2]);
    assert.deepStrictEqual(found(''), [[], 0]);
  });

  test('lists the matching stashes after the refs, jumping to one on Enter', () => {
    const stash = { name: 'stash@{0}', commit: 's0', message: 'On main: x' };
    const items = resultItems(
      [],
      searchRefs(indexRefs([branchNamed('main')]), 'main'),
      searchStashes([stash], 'main'),
    );
    assert.deepStrictEqual(items.map(itemKey), [
      'branch:main',
      'stash:stash@{0}',
    ]);
    assert.strictEqual(enterTarget('main', undefined, items[1]), 's0');
  });

  test('jumps on Enter to a hash not looked up yet as typed', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('A1B2c3d4', undefined, branch), 'a1b2c3d4');
    assert.strictEqual(enterTarget(' AB12 ', undefined, branch), 'ab12');
  });

  test('jumps on Enter to the result picked with the arrows, though the typed text may be a hash not looked up yet', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(
      enterTarget('ab12', undefined, branch, true),
      refs[3].commit,
    );
  });

  test('keeps the highlight on its result while the results change, and otherwise starts at the first', () => {
    const highlight: Highlighted = { query: 'a', key: 'branch:feat/x' };
    assert.strictEqual(
      currentActive(resultsFor([], ['alpha', 'feat/x']), 'a', highlight),
      1,
    );
    assert.strictEqual(
      currentActive(
        resultsFor(['a1'], ['alpha', 'main', 'feat/x']),
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

  test('does nothing on Enter or the arrows without a search, which highlights no match', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('', undefined, branch), undefined);
    assert.strictEqual(
      popupKeyAction(
        { ...press, key: 'ArrowUp', isComposing: false, keyCode: 38 },
        '',
      ),
      undefined,
    );
  });

  test('takes a search of spaces alone as no search, moving no highlight and jumping nowhere', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('  ', undefined, branch), undefined);
    assert.strictEqual(
      popupKeyAction(
        { ...press, key: 'ArrowDown', isComposing: false, keyCode: 40 },
        ' ',
      ),
      undefined,
    );
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

  test('closes once the focus moves out of it, as Tab moves it to the next column, but not into its context menu, nor when nothing takes it', () => {
    const popup = {
      contains: (target: ReturnType<typeof focused>) => target.inside,
    };
    assert.strictEqual(focusLeaves(popup, focused(false)), true);
    assert.strictEqual(focusLeaves(popup, focused(true)), false);
    assert.strictEqual(focusLeaves(popup, focused(false, true)), false);
    assert.strictEqual(focusLeaves(popup, null), false);
  });

  test("stacks stuck folders at the height the stylesheet gives the popup's rows", () => {
    assert.strictEqual(
      stylesheetPx(/^\.locations-list \.row \{[^}]*?\sheight: (\d+)px/m),
      stickyRowHeight,
    );
  });

  test("lines a ref up with the heading, with its folder's name, and with the names past the twisty of the folders beside it", () => {
    assert.strictEqual(
      leafIndent(0, false),
      stylesheetPx(/^\.locations-heading \{[^}]*?\spadding: \d+px (\d+)px/m),
    );
    assert.strictEqual(leafIndent(1, false), folderNameStart(0));
    assert.strictEqual(leafIndent(0, true), folderNameStart(0));
    assert.strictEqual(leafIndent(1, true), folderNameStart(1));
  });
});
