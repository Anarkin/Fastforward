import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type {
  Bookmark,
  RefInfo,
  RepositoryState,
} from '../../../../tools/git/shared/protocol';
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
  pinnedResults,
  popupKeyAction,
  resultItems,
  searchRefs,
  searchStashes,
  shownChildren,
  shownStashes,
  startAfter,
  type Highlighted,
  stickyRowHeight,
} from '../../../../tools/git/page/locations';
import { FolderRow } from '../../../../tools/git/page/tree';
import {
  commitInfo,
  keyPress,
  noop,
  renderedBy,
  stylesheet,
  stylesheetPx,
  tagsWith,
  tagWith,
} from '../../../fixtures';

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

  test('draws 200 refs per group unless told another limit, as repositories can have thousands of refs', () => {
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

  test('lists the pinned rows first, then the matching refs group after group and the stashes, and the found commits last, as they come later and may be many', () => {
    const matching: RefInfo[] = [
      { kind: 'branch', name: 'main', commit: 'a' },
      { kind: 'tag', name: 'v1-main', commit: 'c' },
      { kind: 'branch', name: 'feat/main', commit: 'b' },
    ];
    const stash = { name: 'stash@{0}', commit: 's0', message: 'On main: x' };
    const pinned = pinnedResults(
      {
        checkedOut: [{ kind: 'branch', name: 'main' }],
        bookmarks: [{ kind: 'tag', name: 'v1-main' }],
      },
      matching,
    );
    assert.deepStrictEqual(
      resultItems(
        [commitInfo('f1'), commitInfo('f2')],
        searchRefs(indexRefs(matching), 'main'),
        searchStashes([stash], 'main'),
        pinned,
      ).map(itemKey),
      [
        'pinned:checkedOut:branch:main',
        'pinned:bookmarks:tag:v1-main',
        'branch:feat/main',
        'branch:main',
        'tag:v1-main',
        'stash:stash@{0}',
        'commit:f1',
        'commit:f2',
      ],
    );
  });

  test('jumps on Enter to the commit of a pinned row, or nowhere for a bookmark that is gone', () => {
    const [main, gone, hash] = pinnedResults(
      {
        checkedOut: [{ kind: 'branch', name: 'main' }],
        bookmarks: [
          { kind: 'branch', name: 'gone' },
          { kind: 'commit', name: 'e'.repeat(40) },
        ],
      },
      refs,
    );
    assert.strictEqual(enterTarget('main', undefined, main), 'b');
    assert.strictEqual(enterTarget('gone', undefined, gone), undefined);
    assert.strictEqual(
      enterTarget('eeee', undefined, hash, true),
      'e'.repeat(40),
    );
  });

  test('jumps on Enter to the bookmark named as typed, though its name may be a hash not looked up yet', () => {
    const [bookmark] = pinnedResults(
      { checkedOut: [], bookmarks: [{ kind: 'tag', name: '2024' }] },
      [{ kind: 'tag', name: '2024', commit: 'e' }],
    );
    assert.strictEqual(enterTarget(' 2024 ', undefined, bookmark), 'e');
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
    const [branch, commit] = resultItems(
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
    assert.strictEqual(popupKeyAction({ ...key, key: 'Enter' }), 'enter');
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowDown' }), 1);
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowUp' }), -1);
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: true, keyCode: 13 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: false, keyCode: 229 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        keyPress('ArrowDown', { isComposing: true, keyCode: 229 }),
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

  test('draws at most 200 stashes, searched or not, counting the rest', () => {
    const stashes = Array.from({ length: 250 }, (_, index) => ({
      name: `stash@{${index}}`,
      commit: `s${index}`,
      message: 'On main: wip',
    }));
    assert.deepStrictEqual(shownStashes(stashes, ''), {
      stashes: stashes.slice(0, 200),
      more: 50,
    });
    assert.deepStrictEqual(shownStashes(stashes, 'wip'), {
      stashes: stashes.slice(0, 200),
      more: 50,
    });
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

  test('jumps nowhere on Enter without a search, which highlights no match', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('', undefined, branch), undefined);
  });

  test('takes a search of spaces alone as no search, jumping nowhere', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('  ', undefined, branch), undefined);
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
      onSearchCommits={() => noop}
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

const headings = (html: string) =>
  [...html.matchAll(/class="locations-heading">([^<]*)</g)].map(
    (match) => match[1],
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
      /<div [^>]*class="commit selected" style="padding-left:8px">.*?subject 0/,
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

  test('searches commits by text only from three characters, as each search walks every commit, saying so until the results come, and only then that nothing matches', () => {
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

  test('searches commits after a pause, stopping the search once the text changes or the popup closes, unless it never started', async () => {
    const asked: string[] = [];
    const search = () => {
      asked.push('search');
      return () => asked.push('stop');
    };
    startAfter(0, search)();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(asked, []);
    const cleanUp = startAfter(0, search);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(asked, ['search']);
    cleanUp();
    assert.deepStrictEqual(asked, ['search', 'stop']);
  });

  test('lists the commits a search finds after the pinned rows, the refs and the stashes, highlighting the first of those, as the commits come later and may be many', () => {
    const html = popup('main', undefined, {
      repository: {
        head: 'main',
        headCommit: first,
        refs: [
          { kind: 'branch', name: 'main', commit: first },
          { kind: 'remote', name: 'origin/main', commit: first },
          { kind: 'tag', name: 'v1-main', commit: first },
        ],
        stashes: [{ name: 'stash@{0}', commit: second, message: 'On main' }],
      },
      bookmarks: [{ kind: 'tag', name: 'v1-main' }],
      commitSearch: {
        type: 'commitSearch',
        query: 'main',
        result: {
          commits: [commitInfo(second, { subject: "Merge branch 'main'" })],
          capped: false,
        },
      },
    });
    assert.deepStrictEqual(headings(html), [
      'Checked out',
      'Bookmarks',
      'Local branches',
      'Remote branches',
      'Tags',
      'Stashes',
      'Commits',
    ]);
    const active = tagsWith(html, 'row', 'result', 'active');
    assert.strictEqual(active.length, 1);
    assert.match(active[0], /pinned/);
    assert.strictEqual(tagsWith(html, 'commit', 'selected').length, 0);
  });

  test('says it is looking for a hash or searching commits below the refs that match', () => {
    const html = popup('abcd', undefined, {
      repository: repository(['branch', 'fix/abcd']),
    });
    assert.deepStrictEqual(headings(html), ['Local branches']);
    assert.match(
      html,
      /fix\/<mark class="match">abcd<\/mark>.*Looking for commit abcd/,
    );
  });

  test('looks up no hash shorter than 4 hex digits, searching 3 only by text, and offers nothing for what is no hash', () => {
    assert.doesNotMatch(popup('ab'), /hash-suggestion|Commits/);
    assert.doesNotMatch(popup('abc'), /Looking for commit|Commits/);
    assert.match(popup('abc'), /Searching commits…/);
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
      onSearchCommits: () => noop,
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

async function browsed(
  props: Partial<Parameters<typeof LocationsPopup>[0]>,
  check: (page: {
    readonly document: Document;
    readonly field: HTMLInputElement;
    readonly press: (key: string) => Promise<void>;
    readonly active: () => Element | null;
  }) => void | Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  dom.window.HTMLElement.prototype.scrollIntoView = noop;
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    const main = document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    await act(async () => {
      root.render(
        <LocationsPopup
          bookmarks={[]}
          repository={undefined}
          anchor={{ current: null }}
          lookup={undefined}
          onLookup={noop}
          commitSearch={undefined}
          onSearchCommits={() => noop}
          onJump={noop}
          onClose={noop}
          query=""
          onQuery={noop}
          {...props}
        />,
      );
    });
    const field = document.querySelector<HTMLInputElement>('input');
    assert.ok(field);
    await check({
      document,
      field,
      press: (key) =>
        act(async () => {
          field.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        }),
      active: () => {
        const id = field.getAttribute('aria-activedescendant');
        return id === null ? null : document.getElementById(id);
      },
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const browsedState: RepositoryState = {
  ...repository(['branch', 'main'], ['branch', 'feat/a'], ['remote', 'o/x']),
  head: 'main',
  stashes: [{ name: 'stash@{0}', commit: 'f'.repeat(40), message: 'wip' }],
};

const bookmarked: Bookmark[] = [{ kind: 'commit', name: 'e'.repeat(40) }];

suite('Browsing the locations by keyboard', () => {
  test('tells assistive technology the field picks from the rows below it, and which of them is picked', async () => {
    await browsed({ repository: browsedState }, async ({ field, press }) => {
      assert.strictEqual(field.getAttribute('role'), 'combobox');
      assert.strictEqual(field.getAttribute('aria-expanded'), 'true');
      const results = field.ownerDocument.getElementById(
        field.getAttribute('aria-controls') ?? '',
      );
      assert.strictEqual(results?.getAttribute('role'), 'tree');
      assert.strictEqual(field.getAttribute('aria-activedescendant'), null);
      await press('ArrowDown');
      assert.ok(
        results.contains(
          field.ownerDocument.getElementById(
            field.getAttribute('aria-activedescendant') ?? '',
          ),
        ),
      );
    });
  });

  test('moves through the pinned rows, the trees and the stashes with the arrows for no search, and jumps to the picked one on Enter', async () => {
    const jumped: string[] = [];
    let closed = 0;
    await browsed(
      {
        repository: browsedState,
        bookmarks: bookmarked,
        onJump: (commit) => jumped.push(commit),
        onClose: () => closed++,
      },
      async ({ press, active }) => {
        const seen: (string | null | undefined)[] = [];
        for (let step = 0; step < 7; step++) {
          await press('ArrowDown');
          const row = active();
          assert.strictEqual(row?.getAttribute('aria-selected'), 'true');
          seen.push(row?.textContent);
        }
        assert.deepStrictEqual(seen, [
          'main',
          'e'.repeat(7),
          '▸feat',
          'main',
          '▾o',
          'x',
          'stash@{0}wip',
        ]);
        for (let step = 0; step < 5; step++) {
          await press('ArrowUp');
        }
        await press('Enter');
        assert.deepStrictEqual(jumped, ['e'.repeat(40)]);
        assert.strictEqual(closed, 1);
      },
    );
  });

  test('opens and closes a folder on Enter, telling assistive technology its level and whether it is open', async () => {
    const jumped: string[] = [];
    await browsed(
      { repository: browsedState, onJump: (commit) => jumped.push(commit) },
      async ({ press, active }) => {
        await press('ArrowDown');
        await press('ArrowDown');
        const folder = active();
        assert.strictEqual(folder?.getAttribute('role'), 'treeitem');
        assert.strictEqual(folder.getAttribute('aria-level'), '1');
        assert.strictEqual(folder.getAttribute('aria-expanded'), 'false');
        await press('Enter');
        assert.strictEqual(active()?.getAttribute('aria-expanded'), 'true');
        await press('ArrowDown');
        const leaf = active();
        assert.strictEqual(leaf?.textContent, 'a');
        assert.strictEqual(leaf.getAttribute('aria-level'), '2');
        assert.strictEqual(leaf.getAttribute('aria-expanded'), null);
        await press('Enter');
        assert.deepStrictEqual(jumped, ['c'.repeat(40)]);
      },
    );
  });

  test('marks the row the arrows reach in a tree as a picked result is marked', () => {
    assert.match(
      stylesheet(),
      /^\.locations-list \.row\.result\.active,\n\.locations-list \.row\.tree-row\.active \{[^}]*background: var\(--selection-background\)/m,
    );
  });

  test('moves through the pinned rows, the refs, the stashes and the commits with the arrows for a search, and jumps to the picked one on Enter', async () => {
    const jumped: string[] = [];
    const [main, maint, merge] = ['a', 'b', 'd'].map((c) => c.repeat(40));
    await browsed(
      {
        repository: {
          head: 'main',
          headCommit: main,
          refs: [
            { kind: 'branch', name: 'main', commit: main },
            { kind: 'branch', name: 'maint', commit: maint },
            { kind: 'remote', name: 'o/main', commit: main },
            { kind: 'tag', name: 'main-1', commit: main },
          ],
          stashes: [
            { name: 'stash@{0}', commit: 'f'.repeat(40), message: 'On main' },
          ],
        },
        bookmarks: [{ kind: 'branch', name: 'maint' }],
        query: 'main',
        commitSearch: {
          type: 'commitSearch',
          query: 'main',
          result: {
            commits: [commitInfo(merge, { subject: "Merge branch 'main'" })],
            capped: false,
          },
        },
        onJump: (commit) => jumped.push(commit),
      },
      async ({ field, press, active }) => {
        const base = (field.getAttribute('aria-controls') ?? '').replace(
          /results$/,
          '',
        );
        const seen: (string | undefined)[] = [];
        for (let step = 0; step < 8; step++) {
          const row = active();
          assert.strictEqual(row?.getAttribute('role'), 'option');
          assert.strictEqual(row.getAttribute('aria-selected'), 'true');
          seen.push(row.id.slice(base.length));
          await press('ArrowDown');
        }
        assert.deepStrictEqual(seen, [
          'pinned:checkedOut:branch:main',
          'pinned:bookmarks:branch:maint',
          'branch:main',
          'branch:maint',
          'remote:o/main',
          'tag:main-1',
          'stash:stash@{0}',
          `commit:${merge}`,
        ]);
        for (let step = 0; step < 6; step++) {
          await press('ArrowUp');
        }
        await press('Enter');
        assert.deepStrictEqual(jumped, [maint]);
      },
    );
  });

  test('lists the results of a search as options of a list box', async () => {
    await browsed(
      { repository: browsedState, query: 'ma' },
      ({ field, active }) => {
        const results = field.ownerDocument.getElementById(
          field.getAttribute('aria-controls') ?? '',
        );
        assert.strictEqual(results?.getAttribute('role'), 'listbox');
        const row = active();
        assert.strictEqual(row?.getAttribute('role'), 'option');
        assert.strictEqual(row.getAttribute('aria-selected'), 'true');
        assert.strictEqual(row.textContent, 'main');
      },
    );
  });
});
