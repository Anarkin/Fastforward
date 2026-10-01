import * as assert from 'node:assert';
import type { RefInfo, Bookmark, BookmarkRef } from '../shared/protocol';
import {
  compareBookmarks,
  bookmarkOptions,
  pinnedRefs,
  toggleBookmark,
} from '../webview/bookmarks';

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
});

suite('Pinned refs of the search', () => {
  const refs: RefInfo[] = [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'branch', name: 'feature', commit: 'b' },
    { kind: 'remote', name: 'fork/feature-work', commit: 'b' },
    { kind: 'tag', name: 'v1', commit: 'b' },
  ];
  const checkedOut = (head: string) =>
    names(pinnedRefs([], refs, head, undefined, '').checkedOut);
  const bookmarks: Bookmark[] = [
    { kind: 'tag', name: 'v1' },
    { kind: 'commit', name: 'c1' },
    { kind: 'branch', name: 'main' },
  ];

  test('lists only the checked-out branch, not its upstream, and every bookmark in order', () => {
    const pinned = pinnedRefs(bookmarks, refs, 'main', undefined, '');
    assert.deepStrictEqual(names(pinned.checkedOut), ['main']);
    assert.deepStrictEqual(names(pinned.bookmarks), ['main', 'v1', 'c1']);
  });

  test('shows no branch before its first commit', () => {
    assert.deepStrictEqual(checkedOut('unborn'), []);
  });

  test('lists a detached HEAD as the commit checked out', () => {
    assert.deepStrictEqual(
      pinnedRefs(bookmarks, refs, undefined, 'c9', '').checkedOut,
      [{ kind: 'commit', name: 'c9' }],
    );
  });

  test('keeps only what matches the search, ignoring case and spaces around it', () => {
    const pinned = pinnedRefs(bookmarks, refs, 'main', undefined, ' MAI ');
    assert.deepStrictEqual(names(pinned.checkedOut), ['main']);
    assert.deepStrictEqual(names(pinned.bookmarks), ['main']);
    assert.deepStrictEqual(
      names(pinnedRefs(bookmarks, refs, 'main', undefined, 'V1').checkedOut),
      [],
    );
  });
});
