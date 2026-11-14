import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { suite, test } from 'vitest';
import type {
  GitToWebviewOf,
  RefInfo,
} from '../../../../../tools/git/shared/protocol';
import {
  leafIndent,
  LocationsPopup,
} from '../../../../../tools/git/page/locations';
import {
  commitInfo,
  renderedBy,
  tagsWith,
  tagWith,
} from '../../../../helpers/fixtures';
import { GitStore } from '../../../../../tools/git/page/store';
import { startAfter } from '../../../../../tools/git/page/startAfter';
import {
  renderToStaticMarkup,
  type Shown,
  locationsStore,
  repository,
} from './locationsFixtures';

const popup = (query: string, result?: Shown['lookup'], shown: Shown = {}) =>
  renderToStaticMarkup(
    <GitStore value={locationsStore({ ...shown, query, lookup: result })}>
      <LocationsPopup anchor={{ current: null }} />
    </GitStore>,
  );

const found = (
  commits: string[],
  more = 0,
  query = 'abcd',
): GitToWebviewOf<'hashLookup'> => ({
  type: 'hashLookup',
  query,
  result: {
    commits: commits.map((hash) =>
      commitInfo(hash, { subject: `subject ${hash.at(-1) ?? ''}` }),
    ),
    more,
  },
});

const searched = (query: string): Shown => ({
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
    assert.match(
      html,
      /<span class="badge branch[^>]*>(?:<span class="bubble-name">)?main<\/span>/,
    );
    assert.match(html, /3 more; type more to narrow it down/);
  });

  test('says when no commit starts with it, or that it is still looking', () => {
    assert.match(
      popup('abcd', found([]), searched('abcd')),
      /No commit starts with <code class="name"><span>abcd<\/span><\/code>/,
    );
    assert.match(
      popup('abcd'),
      /Looking for commit <code class="name"><span>abcd<\/span><\/code>…/,
    );
  });

  test('waits for the lookup of what is typed now, not an earlier prefix', () => {
    const html = popup('abcde', found([first]));
    assert.match(
      html,
      /Looking for commit <code class="name"><span>abcde<\/span><\/code>/,
    );
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
      /fix\/<mark class="match">abcd<\/mark>.*Looking for commit <code class="name"><span>abcd<\/span>/,
    );
  });

  test('looks up no hash shorter than 4 hex digits, searching 3 only by text, and offers nothing for what is no hash', () => {
    assert.doesNotMatch(popup('ab'), /hash-suggestion|Commits/);
    assert.doesNotMatch(popup('abc'), /Looking for commit|Commits/);
    assert.match(popup('abc'), /Searching commits…/);
    assert.doesNotMatch(popup('feature'), /Looking for commit|Commits/);
  });
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
    const element = renderedBy(
      LocationsPopup,
      { anchor: { current: null } },
      { git: locationsStore({ onClose: () => closed++ }) },
    );
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

  test('pins the bookmarks, showing one that is gone as such, and not the checked-out branch, which its group shows', () => {
    const html = popup('', undefined, {
      repository: { ...refState, head: 'main' },
      bookmarks: [{ kind: 'branch', name: 'gone' }],
    });
    assert.deepStrictEqual(headings(html)[0], 'Bookmarks');
    assert.doesNotMatch(html, /Checked out/);
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
