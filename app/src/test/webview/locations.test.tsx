import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RefInfo, RepositoryState } from '../../shared/protocol';
import {
  buildTree,
  currentActive,
  enterTarget,
  focusLeaves,
  foundCommits,
  indexRefs,
  itemKey,
  leafIndent,
  LocationsPopup,
  nextActive,
  popupKeyAction,
  resultItems,
  searchRefs,
  searchStashes,
  shownChildren,
  type Highlighted,
  stickyRowHeight,
} from '../../webview/locations';
import { FolderRow } from '../../webview/tree';
import {
  commitInfo,
  keyPress,
  noop,
  renderedBy,
  stylesheetPx,
  tagsWith,
  tagWith,
} from '../fixtures';

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
    const key = keyPress('', { isComposing: false, keyCode: 13 });
    assert.strictEqual(popupKeyAction({ ...key, key: 'Enter' }, 'x'), 'enter');
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowDown' }, 'x'), 1);
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowUp' }, 'x'), -1);
    assert.strictEqual(
      popupKeyAction(
        keyPress('Enter', { isComposing: true, keyCode: 13 }),
        'x',
      ),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        keyPress('Enter', { isComposing: false, keyCode: 229 }),
        'x',
      ),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        keyPress('ArrowDown', { isComposing: true, keyCode: 229 }),
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

  test('jumps on Enter to the ref named as typed, though its name may be a hash not looked up yet', () => {
    const [tag] = resultItems(
      [],
      searchRefs(
        indexRefs([{ kind: 'tag', name: '2024', commit: 'e' }]),
        '2024',
      ),
    );
    assert.strictEqual(enterTarget(' 2024 ', undefined, tag), 'e');
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
        keyPress('ArrowUp', { isComposing: false, keyCode: 38 }),
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
        keyPress('ArrowDown', { isComposing: false, keyCode: 40 }),
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

const popup = (
  query: string,
  result?: Parameters<typeof LocationsPopup>[0]['lookup'],
  props: Partial<Parameters<typeof LocationsPopup>[0]> = {},
) =>
  renderToStaticMarkup(
    <LocationsPopup
      bookmarks={[]}
      repository={undefined}
      anchor={{ current: null }}
      lookup={result}
      onLookup={noop}
      commitSearch={undefined}
      onSearchCommits={noop}
      onJump={noop}
      onClose={noop}
      query={query}
      onQuery={noop}
      {...props}
    />,
  );

const found = (
  commits: string[],
  more = 0,
  query = 'abcd',
): Parameters<typeof LocationsPopup>[0]['lookup'] => ({
  type: 'hashLookup',
  query,
  result: {
    commits: commits.map((hash) =>
      commitInfo(hash, { subject: `subject ${hash.at(-1) ?? ''}` }),
    ),
    more,
  },
});

const searched = (
  query: string,
): Partial<Parameters<typeof LocationsPopup>[0]> => ({
  commitSearch: {
    type: 'commitSearch',
    query,
    result: { commits: [], capped: false },
  },
});

const counts = (html: string) =>
  [...html.matchAll(/class="locations-count">(\d+)</g)].map((match) =>
    Number(match[1]),
  );

suite('Locations tree', () => {
  test('draws at most a few hundred refs side by side, counting the rest', () => {
    const tags = Array.from({ length: 300 }, (_, index): RefInfo => ({
      kind: 'tag',
      name: `v${String(index).padStart(3, '0')}`,
      commit: 'a',
    }));
    const html = popup('', undefined, {
      repository: {
        head: undefined,
        headCommit: undefined,
        refs: tags,
        stashes: [],
      },
    });
    assert.strictEqual(tagsWith(html, 'row', 'tree-row', 'leaf').length, 200);
    assert.match(html, /100 more; type to narrow them down/);
  });

  test('marks a stash a search finds among the commits as a stash, which offers no menu', () => {
    const html = popup('abcd', found(['abcd1', 'abcd2']), {
      repository: {
        head: undefined,
        headCommit: undefined,
        refs: [],
        stashes: [
          { name: 'stash@{0}', commit: 'abcd1', message: 'On main: wip' },
        ],
      },
    });
    assert.strictEqual(
      [...html.matchAll(/<span class="badge stash">stash<\/span>/g)].length,
      1,
    );
  });

  test('lists the stashes newest first with their messages, those a search finds, and no group without any', () => {
    const stashes = [
      { name: 'stash@{0}', commit: 'a', message: 'On main: With new.txt' },
      { name: 'stash@{1}', commit: 'b', message: 'On main: Tidy up' },
    ];
    const shown = (query: string, listed = stashes) =>
      popup(query, undefined, {
        repository: {
          head: undefined,
          headCommit: undefined,
          refs: [],
          stashes: listed,
        },
      });
    const all = shown('');
    assert.match(all, /Stashes<span class="locations-count">2<\/span>/);
    assert.deepStrictEqual(
      [...all.matchAll(/<span class="badge stash">([^<]*)<\/span>/g)].map(
        (match) => match[1],
      ),
      ['stash@{0}', 'stash@{1}'],
    );
    assert.match(all, /<span class="stash-message">On main: Tidy up<\/span>/);
    const tidy = shown('tidy');
    assert.match(tidy, /Stashes<span class="locations-count">1<\/span>/);
    assert.doesNotMatch(tidy, /stash@\{0\}/);
    assert.doesNotMatch(shown('', []), /Stashes/);
  });
});

suite('Commit results', () => {
  const first = 'abcd'.padEnd(40, '0');
  const second = 'abcd'.padEnd(40, '1');

  test('lists the commits a typed hash may be as commit rows, the first highlighted, with their bubbles', () => {
    const html = popup('ABCD', found([first, second], 3), {
      repository: {
        head: 'main',
        headCommit: second,
        refs: [{ kind: 'branch', name: 'main', commit: second }],
        stashes: [],
      },
    });
    assert.deepStrictEqual(counts(html), [5]);
    assert.match(html, /<header class="locations-heading">Commits/);
    assert.strictEqual(tagsWith(html, 'commit', 'selected').length, 1);
    assert.match(
      html,
      /<div class="commit selected" style="padding-left:8px">.*?subject 0/,
    );
    assert.match(html, /class="commit checked-out".*subject 1/);
    assert.match(html, /<span class="badge branch[^>]*>main<\/span>/);
    assert.match(html, /3 more; type more to narrow it down/);
  });

  test('says when no commit starts with it, or that it is still looking', () => {
    assert.match(
      popup('abcd', found([]), searched('abcd')),
      /No commit starts with abcd/,
    );
    assert.match(popup('abcd'), /Looking for commit abcd/);
  });

  test('waits for the lookup of what is typed now, not an earlier prefix', () => {
    const html = popup('abcde', found([first]));
    assert.match(html, /Looking for commit abcde/);
    assert.strictEqual(tagsWith(html, 'commit').length, 0);
  });

  test('lists the commits whose author, committer or message matches after those a typed hash may be, marking the match', () => {
    const byText = (query: string, capped = false) => ({
      commitSearch: {
        type: 'commitSearch' as const,
        query,
        result: {
          commits: [
            commitInfo(first, { subject: 'subject 0' }),
            commitInfo('e'.repeat(40), {
              subject: 'Fix the abcd parser',
              authorName: 'Abcd Author',
            }),
          ],
          capped,
        },
      },
    });
    const html = popup('abcd', found([first]), byText('abcd'));
    assert.deepStrictEqual(counts(html), [2]);
    assert.match(html, /subject 0<\/span><\/div>/);
    assert.match(
      html,
      /Fix the <mark class="match">abcd<\/mark> parser<\/span><\/div>/,
    );
    assert.match(html, /<mark class="match">Abcd<\/mark> Author/);
    assert.doesNotMatch(html, /Searching commits/);
    assert.match(
      popup('abcd', found([first]), byText('abcd', true)),
      /More commits match; type more to narrow it down/,
    );
  });

  test('searches commits by text from three characters, saying so until the results come, and only then that nothing matches', () => {
    assert.match(popup('parser'), /Searching commits…/);
    assert.doesNotMatch(popup('parser'), /No matches/);
    const none = popup('parser', undefined, {
      commitSearch: {
        type: 'commitSearch',
        query: 'parser',
        result: { commits: [], capped: false },
      },
    });
    assert.doesNotMatch(none, /Searching commits/);
    assert.match(none, /No matches/);
    assert.match(popup('par'), /Searching commits…/);
    assert.doesNotMatch(popup('pa'), /Searching commits/);
    assert.match(popup('pa'), /No matches/);
  });

  test('offers nothing for what is no hash, or too short', () => {
    assert.doesNotMatch(popup('ab'), /hash-suggestion|Commits/);
    assert.doesNotMatch(popup('abc'), /Looking for commit|Commits/);
    assert.doesNotMatch(popup('feature'), /Looking for commit|Commits/);
  });
});

const repository = (
  ...named: [RefInfo['kind'], string][]
): RepositoryState => ({
  head: undefined,
  headCommit: undefined,
  refs: named.map(([kind, name]) => ({ kind, name, commit: 'c'.repeat(40) })),
  stashes: [],
});

const refState = repository(
  ['branch', 'main'],
  ['branch', 'feat/a'],
  ['branch', 'feat/b'],
  ['remote', 'origin/main'],
  ['tag', 'v1'],
);

suite('Search', () => {
  test('offers a way back out beside its field', () => {
    let closed = 0;
    const element = renderedBy(LocationsPopup, {
      bookmarks: [],
      repository: undefined,
      anchor: { current: null },
      lookup: undefined,
      onLookup: noop,
      commitSearch: undefined,
      onSearchCommits: noop,
      onJump: noop,
      onClose: () => closed++,
      query: '',
      onQuery: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(element));
    const row = element.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(row));
    const back = row.props.children[0];
    assert.ok(isValidElement<{ title: string; onClick: () => void }>(back));
    assert.strictEqual(back.props.title, 'Close');
    back.props.onClick();
    assert.strictEqual(closed, 1);
  });

  test('shows refs as trees, folders first, opening a lone folder', () => {
    const html = popup('', undefined, { repository: refState });
    assert.deepStrictEqual(counts(html), [3, 1, 1]);
    assert.match(
      html,
      /tree-row folder[^>]*><span class="twisty">▸<\/span>feat<\/div><\/div><div[^>]*title="main"/,
    );
    assert.match(
      tagWith(html, 'title="main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, true)}px`),
    );
    assert.match(
      tagWith(html, 'title="origin/main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(1, false)}px`),
    );
    assert.match(
      tagWith(html, 'title="v1"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, false)}px`),
    );
  });

  test('keeps several folders closed and says when a kind has none', () => {
    const html = popup('', undefined, {
      repository: repository(
        ['branch', 'main'],
        ['remote', 'origin/a'],
        ['remote', 'upstream/b'],
      ),
    });
    assert.deepStrictEqual(counts(html), [1, 2, 0]);
    const folders = tagsWith(html, 'row', 'tree-row', 'folder', 'sticky');
    assert.strictEqual(folders.length, 2);
    for (const folder of folders) {
      assert.match(folder, /z-index:100/);
      assert.ok(!folder.includes('title='));
    }
    assert.match(html, /<\/span>origin<\/div>/);
    assert.match(html, /<\/span>upstream<\/div>/);
    assert.strictEqual(html.match(/class="twisty">▸</g)?.length, 2);
    assert.match(html, /<div class="locations-empty">None<\/div>/);
  });

  test('marks what matches, counting only the matches and leaving out the groups without any', () => {
    const html = popup('fe', undefined, { repository: refState });
    assert.match(html, /<mark class="match">fe<\/mark>at\/a/);
    assert.deepStrictEqual(counts(html), [2]);
    assert.doesNotMatch(html, /No matches/);
  });

  test('shows the trees for a search of spaces alone, as for no search', () => {
    const html = popup(' ', undefined, { repository: refState });
    assert.deepStrictEqual(counts(html), [3, 1, 1]);
    assert.doesNotMatch(html, /No matches/);
    assert.strictEqual(tagsWith(html, 'row', 'tree-row', 'leaf').length, 3);
  });

  test('says there are no matches once, when nothing matches', () => {
    const html = popup('nothing like it', undefined, {
      repository: refState,
      ...searched('nothing like it'),
    });
    assert.deepStrictEqual(counts(html), []);
    assert.strictEqual(
      html.match(/<div class="locations-empty">No matches<\/div>/g)?.length,
      1,
    );
  });

  test('marks a match ignoring case, and highlights the first one, skipping groups without any', () => {
    assert.match(
      popup('MAI', undefined, { repository: refState }),
      /<mark class="match">mai<\/mark>n/,
    );
    const html = popup('v1', undefined, { repository: refState });
    const active = tagsWith(html, 'row', 'result', 'active');
    assert.strictEqual(active.length, 1);
    assert.match(active[0], /title="v1"/);
  });

  test('pins the checked-out branch and bookmarks, showing one that is gone as such', () => {
    const html = popup('', undefined, {
      repository: { ...refState, head: 'main' },
      bookmarks: [{ kind: 'branch', name: 'gone' }],
    });
    assert.match(
      html,
      /<header class="locations-heading">Checked out<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]*"[^>]*>main</,
    );
    assert.match(
      html,
      /<header class="locations-heading">Bookmarks<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]* missing[^"]*"[^>]*>gone</,
    );
  });

  test('says how many more match than it shows', () => {
    const many = repository(
      ...Array.from({ length: 201 }, (_, index): [RefInfo['kind'], string] => [
        'branch',
        `b${index}`,
      ]),
    );
    const html = popup('b', undefined, { repository: many });
    assert.match(html, /1 more; type more to narrow it down/);
    assert.strictEqual(counts(html)[0], 201);
  });
});
