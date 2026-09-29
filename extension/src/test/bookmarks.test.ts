import * as assert from 'node:assert';
import type { RefInfo, Bookmark, BookmarkRef } from '../shared/protocol';
import {
  bubbleRow,
  compareBookmarks,
  bookmarkOptions,
  pinnedRefs,
} from '../webview/bookmarks';

const names = (bookmarks: Bookmark[]) =>
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
    assert.deepStrictEqual(
      bookmarks.toSorted(compareBookmarks).map((bookmark) => bookmark.name),
      [
        'feature/x',
        'origin/feature/x',
        'Main',
        'origin/main',
        'upstream/main',
        'v1.0',
      ],
    );
  });
});

suite('Bubbles row', () => {
  const refs: RefInfo[] = [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'branch', name: 'feature', commit: 'b' },
    { kind: 'remote', name: 'fork/feature-work', commit: 'b' },
    { kind: 'tag', name: 'v1', commit: 'a' },
  ];
  const main: BookmarkRef = { kind: 'branch', name: 'main' };
  const v1: BookmarkRef = { kind: 'tag', name: 'v1' };

  test('pairs the checked-out branch with the branch it tracks', () => {
    const row = bubbleRow([main, v1], refs, 'feature', 'fork/feature-work');
    assert.deepStrictEqual(row.branch, { kind: 'branch', name: 'feature' });
    assert.deepStrictEqual(row.upstream, {
      kind: 'remote',
      name: 'fork/feature-work',
    });
    assert.deepStrictEqual(names(row.bookmarks), ['main', 'v1']);
  });

  test('keeps a checked-out bookmark in its place, without its upstream', () => {
    const origin: BookmarkRef = { kind: 'remote', name: 'origin/main' };
    const row = bubbleRow([v1, origin, main], refs, 'main', 'origin/main');
    assert.deepStrictEqual(row.branch, main);
    assert.deepStrictEqual(names(row.bookmarks), ['main', 'v1']);
  });

  test('pairs nothing without an upstream, or with a detached HEAD', () => {
    assert.strictEqual(
      bubbleRow([], refs, 'feature', undefined).upstream,
      undefined,
    );
    const detached = bubbleRow([main], refs, undefined, undefined);
    assert.strictEqual(detached.branch, undefined);
    assert.deepStrictEqual(names(detached.bookmarks), ['main']);
  });

  test('knows whether what is checked out is a bookmark', () => {
    assert.strictEqual(
      bubbleRow([v1], refs, 'main', 'origin/main').checkedOutIsBookmark,
      false,
    );
    assert.strictEqual(
      bubbleRow([main], refs, 'main', 'origin/main').checkedOutIsBookmark,
      true,
    );
    const commit: Bookmark = { kind: 'commit', name: 'c1' };
    assert.strictEqual(
      bubbleRow([commit], refs, undefined, undefined, 'c1')
        .checkedOutIsBookmark,
      true,
    );
    assert.strictEqual(
      bubbleRow([main], refs, undefined, undefined, 'c2').checkedOutIsBookmark,
      false,
    );
  });

  test('puts commits after the refs', () => {
    const first: Bookmark = { kind: 'commit', name: 'c1' };
    const second: Bookmark = { kind: 'commit', name: 'b2' };
    const row = bubbleRow([second, v1, first, main], refs, 'main', undefined);
    assert.deepStrictEqual(names(row.bookmarks), ['main', 'v1', 'b2', 'c1']);
    const detached = bubbleRow(
      [second, first],
      refs,
      undefined,
      undefined,
      'c1',
    );
    assert.deepStrictEqual(names(detached.bookmarks), ['b2', 'c1']);
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
});

suite('Pinned refs of the search', () => {
  const refs: RefInfo[] = [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'tag', name: 'v1', commit: 'b' },
  ];
  const bookmarks: Bookmark[] = [
    { kind: 'tag', name: 'v1' },
    { kind: 'commit', name: 'c1' },
    { kind: 'branch', name: 'main' },
  ];

  test('lists the checked-out branch with its upstream, and every bookmark in order', () => {
    const pinned = pinnedRefs(
      bookmarks,
      refs,
      'main',
      'origin/main',
      undefined,
      '',
    );
    assert.deepStrictEqual(names([...pinned.checkedOut]), [
      'main',
      'origin/main',
    ]);
    assert.deepStrictEqual(names([...pinned.bookmarks]), ['main', 'v1', 'c1']);
  });

  test('lists a detached HEAD as the commit checked out', () => {
    assert.deepStrictEqual(
      pinnedRefs(bookmarks, refs, undefined, undefined, 'c9', '').checkedOut,
      [{ kind: 'commit', name: 'c9' }],
    );
  });

  test('keeps only what matches the search, ignoring case', () => {
    const pinned = pinnedRefs(
      bookmarks,
      refs,
      'main',
      'origin/main',
      undefined,
      'ORIGIN',
    );
    assert.deepStrictEqual(names([...pinned.checkedOut]), ['origin/main']);
    assert.deepStrictEqual(pinned.bookmarks, []);
  });
});
