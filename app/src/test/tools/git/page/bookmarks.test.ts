import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type {
  RefInfo,
  Bookmark,
  BookmarkRef,
} from '../../../../tools/git/shared/protocol';
import {
  compareBookmarks,
  bookmarkOptions,
  searchedBookmarks,
  toggleBookmark,
} from '../../../../tools/git/page/bookmarks';

const names = (bookmarks: readonly Bookmark[]) =>
  bookmarks.map((bookmark) => bookmark.name);

suite('Bookmark order', () => {
  test('puts remote branches next to the local ones of the same name', () => {
    const bookmarks: BookmarkRef[] = [
      { kind: 'remote', name: 'origin/main' },
      { kind: 'branch', name: 'feature/x' },
      { kind: 'tag', name: 'v1.0' },
      { kind: 'remote', name: 'origin/feature/x' },
      { kind: 'branch', name: 'Main' },
      { kind: 'remote', name: 'upstream/main' },
    ];
    assert.deepStrictEqual(names(bookmarks.toSorted(compareBookmarks)), [
      'feature/x',
      'origin/feature/x',
      'Main',
      'origin/main',
      'upstream/main',
      'v1.0',
    ]);
  });

  test('puts remote branches next to the local ones of the same name, also of a remote with a slash in its name', () => {
    const refs: RefInfo[] = [
      {
        kind: 'remote',
        name: 'team/fork/main',
        remote: 'team/fork',
        commit: 'a',
      },
      { kind: 'branch', name: 'hotfix', commit: 'a' },
      { kind: 'remote', name: 'origin/main', remote: 'origin', commit: 'a' },
      { kind: 'branch', name: 'main', commit: 'a' },
    ];
    assert.deepStrictEqual(names(refs.toSorted(compareBookmarks)), [
      'hotfix',
      'main',
      'origin/main',
      'team/fork/main',
    ]);
  });

  test("puts each remote's tag right after the local tag of its name, as its bubbles are, also of a remote with a slash in its name", () => {
    const refs: RefInfo[] = [
      {
        kind: 'remote-tag',
        name: 'origin/v20.0.0',
        remote: 'origin',
        commit: 'a',
      },
      { kind: 'tag', name: 'v20.0.0', commit: 'a' },
      {
        kind: 'remote-tag',
        name: 'team/fork/v1',
        remote: 'team/fork',
        commit: 'a',
      },
      { kind: 'tag', name: 'v1', commit: 'a' },
    ];
    assert.deepStrictEqual(names(refs.toSorted(compareBookmarks)), [
      'v1',
      'team/fork/v1',
      'v20.0.0',
      'origin/v20.0.0',
    ]);
  });

  test('puts commits after the refs, in the order they were bookmarked', () => {
    const bookmarks: Bookmark[] = [
      { kind: 'commit', name: 'c1' },
      { kind: 'tag', name: 'v1' },
      { kind: 'commit', name: 'b2' },
      { kind: 'branch', name: 'main' },
    ];
    assert.deepStrictEqual(names(bookmarks.toSorted(compareBookmarks)), [
      'main',
      'v1',
      'c1',
      'b2',
    ]);
  });
});

suite('Bookmark toggling', () => {
  test('adds a bookmark, and removes only the one of the same kind and name', () => {
    const branch: Bookmark = { kind: 'branch', name: 'v1' };
    const tag: Bookmark = { kind: 'tag', name: 'v1' };
    const removed = toggleBookmark([branch, tag], tag);
    assert.deepStrictEqual(removed, [branch]);
    assert.deepStrictEqual(toggleBookmark(removed, tag), [branch, tag]);
  });
});

suite('Bookmark options', () => {
  test("lists a commit's refs in bookmark order, then the commit", () => {
    const refs: RefInfo[] = [
      { kind: 'tag', name: 'v2', commit: 'abcdef123' },
      { kind: 'remote', name: 'origin/feature', commit: 'abcdef123' },
      { kind: 'branch', name: 'other', commit: 'fedcba' },
      { kind: 'branch', name: 'feature', commit: 'abcdef123' },
    ];
    assert.deepStrictEqual(
      bookmarkOptions('abcdef123', refs).map((option) => option.label),
      ['feature', 'origin/feature', 'v2', 'abcdef1'],
    );
  });

  test("offers a commit's tag before the same tag on a remote, then the commit", () => {
    const refs: RefInfo[] = [
      {
        kind: 'remote-tag',
        name: 'origin/v20.0.0',
        remote: 'origin',
        commit: 'abcdef123',
      },
      { kind: 'tag', name: 'v20.0.0', commit: 'abcdef123' },
    ];
    assert.deepStrictEqual(
      bookmarkOptions('abcdef123', refs).map((option) => option.label),
      ['v20.0.0', 'origin/v20.0.0', 'abcdef1'],
    );
  });

  test("knows the remote of a commit's remote branches, also one with a slash in its name", () => {
    const refs: RefInfo[] = [
      {
        kind: 'remote',
        name: 'team/fork/main',
        remote: 'team/fork',
        commit: 'a',
      },
      { kind: 'branch', name: 'hotfix', commit: 'a' },
      { kind: 'branch', name: 'main', commit: 'a' },
    ];
    assert.deepStrictEqual(
      bookmarkOptions('a', refs).map((option) => option.bookmark),
      [
        { kind: 'branch', name: 'hotfix' },
        { kind: 'branch', name: 'main' },
        { kind: 'remote', name: 'team/fork/main' },
        { kind: 'commit', name: 'a' },
      ],
    );
  });
});

suite('Bookmarks of the search', () => {
  const refs: RefInfo[] = [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'branch', name: 'feature', commit: 'b' },
    { kind: 'remote', name: 'fork/feature-work', commit: 'b' },
    { kind: 'tag', name: 'v1', commit: 'b' },
  ];
  const bookmarks: Bookmark[] = [
    { kind: 'tag', name: 'v1' },
    { kind: 'commit', name: 'c1' },
    { kind: 'branch', name: 'main' },
  ];

  test('lists every bookmark in order, and nothing else, not the checked-out branch', () => {
    assert.deepStrictEqual(names(searchedBookmarks(bookmarks, refs, '')), [
      'main',
      'v1',
      'c1',
    ]);
    assert.deepStrictEqual(searchedBookmarks([], refs, ''), []);
  });

  test('orders a bookmarked remote tag right after the local tag of its name, knowing the remote it is on, also one with a slash in its name', () => {
    const tagged: RefInfo[] = [
      { kind: 'tag', name: 'v1', commit: 'a' },
      {
        kind: 'remote-tag',
        name: 'team/fork/v1',
        remote: 'team/fork',
        commit: 'a',
      },
      { kind: 'tag', name: 'u2', commit: 'a' },
    ];
    const found = searchedBookmarks(
      [
        { kind: 'remote-tag', name: 'team/fork/v1' },
        { kind: 'tag', name: 'v1' },
        { kind: 'tag', name: 'u2' },
      ],
      tagged,
      '',
    );
    assert.deepStrictEqual(names(found), ['u2', 'v1', 'team/fork/v1']);
  });

  test('orders bookmarked remote branches by the remote they are on, also one with a slash in its name', () => {
    const forked: RefInfo[] = [
      ...refs,
      {
        kind: 'remote',
        name: 'team/fork/main',
        remote: 'team/fork',
        commit: 'a',
      },
    ];
    const found = searchedBookmarks(
      [
        { kind: 'remote', name: 'team/fork/main' },
        { kind: 'branch', name: 'hotfix' },
        { kind: 'branch', name: 'main' },
      ],
      forked,
      '',
    );
    assert.deepStrictEqual(names(found), ['hotfix', 'main', 'team/fork/main']);
  });

  test('keeps only what matches the search, ignoring case and spaces around it', () => {
    assert.deepStrictEqual(names(searchedBookmarks(bookmarks, refs, ' MAI ')), [
      'main',
    ]);
    assert.deepStrictEqual(names(searchedBookmarks(bookmarks, refs, 'V1')), [
      'v1',
    ]);
  });

  test('folds the search and the names as every find does, so a letter finds its accented letter and either sigma the other', () => {
    const folding: RefInfo[] = [
      { kind: 'branch', name: 'feature/café', commit: 'a' },
      { kind: 'tag', name: 'ΛΟΓΟΣ', commit: 'b' },
    ];
    const found = (query: string) =>
      names(
        searchedBookmarks(
          [
            { kind: 'branch', name: 'feature/café' },
            { kind: 'tag', name: 'ΛΟΓΟΣ' },
          ],
          folding,
          query,
        ),
      );
    assert.deepStrictEqual(found('CAFE'), ['feature/café']);
    assert.deepStrictEqual(found('λογοσ'), ['ΛΟΓΟΣ']);
  });
});
