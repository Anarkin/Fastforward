import * as assert from 'node:assert';
import type { RefInfo } from '../protocol';
import {
  countRefs,
  decorations,
  defaultVips,
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

suite('fingerprint', () => {
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
  });
});

suite('ref counts', () => {
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
    // c isn't shown, so it has no row to size
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

suite('default VIPs', () => {
  test("picks the remote's default branch, local and remote", () => {
    assert.deepStrictEqual(defaultVips(refs, ['origin/main']), [
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
    assert.deepStrictEqual(defaultVips(local, []), [
      { kind: 'branch', name: 'master' },
    ]);
  });

  test('picks nothing without a main branch', () => {
    assert.deepStrictEqual(
      defaultVips([{ kind: 'branch', name: 'develop', commit: 'a' }], []),
      [],
    );
  });

  test('leaves out the local branch when only the remote one exists', () => {
    assert.deepStrictEqual(
      defaultVips(
        [{ kind: 'remote', name: 'origin/main', commit: 'a' }],
        ['origin/main'],
      ),
      [{ kind: 'remote', name: 'origin/main' }],
    );
  });
});

suite('detached HEAD', () => {
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
});
