import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { indexRefs } from '../../../../../tools/git/page/refIndex';
import { refs } from './locationsFixtures';
import {
  itemKey,
  pinnedResults,
  resultItems,
  searchRefs,
  searchStashes,
  shownStashes,
} from '../../../../../tools/git/page/locationResults';
import { enterTarget } from '../../../../../tools/git/page/locationKeys';
import { commitInfo } from '../../../../helpers/gitValues';

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

suite('Locations search', () => {
  test('finds parts of names, ignoring case, in a group per kind', () => {
    assert.deepStrictEqual(names(searchRefs(indexRefs(refs), 'Epmaisa-798')), [
      ['Local branches', ['feat/epmaisa-798-drop']],
      ['Remote branches', ['origin/feat/EPMAISA-798-drop']],
      ['Tags', []],
    ]);
  });

  test('folds the search and the names as every find does, so a letter finds its accented letter and either sigma the other', () => {
    const folding: RefInfo[] = [
      branchNamed('feature/café'),
      { kind: 'tag', name: 'ΛΟΓΟΣ', commit: 'c' },
    ];
    assert.deepStrictEqual(names(searchRefs(indexRefs(folding), 'CAFE')), [
      ['Local branches', ['feature/café']],
      ['Remote branches', []],
      ['Tags', []],
    ]);
    assert.deepStrictEqual(names(searchRefs(indexRefs(folding), 'λογοσ')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', ['ΛΟΓΟΣ']],
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

  test('searches nothing without a query', () => {
    assert.deepStrictEqual(names(searchRefs(indexRefs(refs), '')), [
      ['Local branches', []],
      ['Remote branches', []],
      ['Tags', []],
    ]);
  });

  test('lists the pinned rows first, then the matching refs group after group and the stashes, and the found commits last, as they come later and may be many', () => {
    const matching: RefInfo[] = [
      { kind: 'branch', name: 'main', commit: 'a' },
      { kind: 'tag', name: 'v1-main', commit: 'c' },
      { kind: 'branch', name: 'feat/main', commit: 'b' },
    ];
    const stash = { name: 'stash@{0}', commit: 's0', message: 'On main: x' };
    const pinned = pinnedResults([{ kind: 'tag', name: 'v1-main' }], matching);
    assert.deepStrictEqual(
      resultItems(
        [commitInfo('f1'), commitInfo('f2')],
        searchRefs(indexRefs(matching), 'main'),
        searchStashes([stash], 'main'),
        pinned,
      ).map(itemKey),
      [
        'pinned:tag:v1-main',
        'branch:feat/main',
        'branch:main',
        'tag:v1-main',
        'stash:stash@{0}',
        'commit:f1',
        'commit:f2',
      ],
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

  test('folds the search of stashes as every find does', () => {
    const stashes = [
      { name: 'stash@{0}', commit: 's0', message: 'On main: Café' },
      { name: 'stash@{1}', commit: 's1', message: 'On main: ΟΔΟΣ' },
    ];
    const found = (query: string) =>
      searchStashes(stashes, query).stashes.map((stash) => stash.name);
    assert.deepStrictEqual(found('cafe'), ['stash@{0}']);
    assert.deepStrictEqual(found('οδοσ'), ['stash@{1}']);
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
});
