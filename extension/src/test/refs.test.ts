import * as assert from 'node:assert';
import { RefType } from '../git/refType';
import type { RefInfo } from '../shared/protocol';
import {
  countRefs,
  decorations,
  defaultBookmarks,
  checkedOutBranch,
  detachedHead,
  fingerprint,
} from '../refs';

const refs: RefInfo[] = [
  { kind: 'branch', name: 'main', commit: 'a' },
  { kind: 'remote', name: 'origin/main', commit: 'a' },
  { kind: 'remote', name: 'upstream/main', commit: 'b' },
  { kind: 'branch', name: 'feature', commit: 'c' },
  { kind: 'tag', name: 'v1', commit: 'b' },
];

suite('Fingerprint', () => {
  test('ignores the order of the refs', () => {
    assert.strictEqual(
      fingerprint({ name: 'main', commit: 'a' }, refs),
      fingerprint({ name: 'main', commit: 'a' }, refs.toReversed()),
    );
  });

  test('changes when HEAD or a ref moves, or a ref comes or goes', () => {
    const head = { name: 'main', commit: 'a' };
    const before = fingerprint(head, refs);
    assert.notStrictEqual(
      fingerprint({ name: 'main', commit: 'x' }, refs),
      before,
    );
    assert.notStrictEqual(
      fingerprint({ name: 'feature', commit: 'a' }, refs),
      before,
    );
    assert.notStrictEqual(
      fingerprint(head, [...refs.slice(1), { ...refs[0], commit: 'x' }]),
      before,
    );
    assert.notStrictEqual(fingerprint(head, refs.slice(1)), before);
    assert.notStrictEqual(
      fingerprint({ name: 'v1', commit: 'b', type: RefType.Tag }, refs),
      fingerprint({ name: 'v1', commit: 'b', type: RefType.Head }, refs),
    );
  });
});

suite('Ref counts', () => {
  test('counts the refs of each commit and places them in the list', () => {
    const counts = countRefs(refs);
    assert.deepStrictEqual(
      [...counts],
      [
        ['a', 2],
        ['b', 2],
        ['c', 1],
      ],
    );
    const positions = new Map([
      ['a', 0],
      ['b', 5],
    ]);
    assert.deepStrictEqual(decorations(counts, positions), [
      [0, 2],
      [5, 2],
    ]);
  });
});

suite('Default bookmarks', () => {
  test("picks the remote's default branch, local and remote", () => {
    assert.deepStrictEqual(defaultBookmarks(refs, ['origin/main']), [
      { kind: 'branch', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'remote', name: 'upstream/main' },
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
    assert.deepStrictEqual(
      defaultBookmarks(refs, ['origin/main', 'upstream/develop']),
      defaultBookmarks(refs, ['origin/main']),
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

suite('Detached HEAD', () => {
  test('counts as a bubble on its commit', () => {
    const counts = countRefs(refs, { name: undefined, commit: 'c' });
    assert.strictEqual(counts.get('c'), 2);
    assert.strictEqual(detachedHead({ name: undefined, commit: 'c' }), 'c');
  });

  test('is nothing while a branch is checked out', () => {
    assert.strictEqual(
      countRefs(refs, { name: 'main', commit: 'a' }).get('a'),
      2,
    );
    assert.strictEqual(detachedHead({ name: 'main', commit: 'a' }), undefined);
  });

  test('is at a tag the Git extension names HEAD after', () => {
    const head = { name: 'v1', commit: 'c', type: RefType.Tag };
    assert.strictEqual(checkedOutBranch(head), undefined);
    assert.strictEqual(detachedHead(head), 'c');
  });
});
