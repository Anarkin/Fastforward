import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { defaultBookmarks } from '../../../../../tools/git/main/bookmarks';

const refs: RefInfo[] = [
  { kind: 'branch', name: 'main', commit: 'a' },
  { kind: 'remote', name: 'origin/main', commit: 'a' },
  { kind: 'remote', name: 'upstream/main', commit: 'b' },
  { kind: 'branch', name: 'feature', commit: 'c' },
  { kind: 'tag', name: 'v1', commit: 'b' },
];

suite('Default bookmarks', () => {
  test("picks the remote's default branch, local and remote", () => {
    assert.deepStrictEqual(defaultBookmarks(refs, ['origin/main']), [
      { kind: 'branch', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'remote', name: 'upstream/main' },
    ]);
  });

  test('bookmarks the main branch of a remote with a slash in its name', () => {
    const forked: RefInfo[] = [
      { kind: 'branch', name: 'trunk', commit: 'a' },
      {
        kind: 'remote',
        name: 'team/fork/trunk',
        remote: 'team/fork',
        commit: 'a',
      },
    ];
    assert.deepStrictEqual(defaultBookmarks(forked, ['team/fork/trunk']), [
      { kind: 'branch', name: 'trunk' },
      { kind: 'remote', name: 'team/fork/trunk' },
    ]);
  });

  test('falls back to a local main, master or trunk', () => {
    const local: RefInfo[] = [
      { kind: 'branch', name: 'develop', commit: 'a' },
      { kind: 'branch', name: 'master', commit: 'b' },
    ];
    assert.deepStrictEqual(defaultBookmarks(local, []), [
      { kind: 'branch', name: 'master' },
    ]);
  });

  test('prefers main to master in the fallback', () => {
    const local: RefInfo[] = [
      { kind: 'branch', name: 'master', commit: 'a' },
      { kind: 'branch', name: 'main', commit: 'b' },
    ];
    assert.deepStrictEqual(defaultBookmarks(local, []), [
      { kind: 'branch', name: 'main' },
    ]);
  });

  test('adds the remote branches of the fallback', () => {
    const local: RefInfo[] = [
      { kind: 'branch', name: 'master', commit: 'a' },
      { kind: 'remote', name: 'origin/master', commit: 'a' },
    ];
    assert.deepStrictEqual(defaultBookmarks(local, []), [
      { kind: 'branch', name: 'master' },
      { kind: 'remote', name: 'origin/master' },
    ]);
  });

  test("picks only the first remote's default branch", () => {
    const withDevelop: RefInfo[] = [
      ...refs,
      { kind: 'branch', name: 'develop', commit: 'd' },
      { kind: 'remote', name: 'upstream/develop', commit: 'd' },
    ];
    assert.deepStrictEqual(
      defaultBookmarks(withDevelop, ['origin/main', 'upstream/develop']),
      [
        { kind: 'branch', name: 'main' },
        { kind: 'remote', name: 'origin/main' },
        { kind: 'remote', name: 'upstream/main' },
      ],
    );
  });

  test('picks nothing without a main branch', () => {
    assert.deepStrictEqual(
      defaultBookmarks([{ kind: 'branch', name: 'develop', commit: 'a' }], []),
      [],
    );
  });

  test('leaves out the local branch when only the remote one exists', () => {
    assert.deepStrictEqual(
      defaultBookmarks(
        [{ kind: 'remote', name: 'origin/main', commit: 'a' }],
        ['origin/main'],
      ),
      [{ kind: 'remote', name: 'origin/main' }],
    );
  });
});
