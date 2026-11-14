import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import {
  decoratedCommits,
  decorations,
  detachedHead,
  fingerprint,
} from '../../../../../tools/git/main/refs';

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
      fingerprint({ commit: 'b' }, refs),
      fingerprint({ name: 'v1', commit: 'b' }, refs),
    );
  });

  test('changes when a branch takes another upstream or loses it, though no commit moves, so the page learns of it', () => {
    const head = { name: 'main', commit: 'a' };
    const tracking = (main: RefInfo['tracking']) =>
      fingerprint(head, [{ ...refs[0], tracking: main }, ...refs.slice(1)]);
    const before = tracking({ upstream: 'origin/main', ahead: 0, behind: 0 });
    for (const after of [
      undefined,
      { upstream: 'upstream/main', ahead: 0, behind: 0 },
      { upstream: 'origin/main', gone: true as const },
    ]) {
      assert.notStrictEqual(tracking(after), before);
    }
  });

  test('changes when a stash comes, goes or takes another place', () => {
    const head = { name: 'main', commit: 'a' };
    const stashes = [
      { name: 'stash@{0}', commit: 's0', message: 'On main: zero' },
      { name: 'stash@{1}', commit: 's1', message: 'On main: one' },
    ];
    const before = fingerprint(head, refs, stashes);
    assert.notStrictEqual(fingerprint(head, refs), before);
    assert.notStrictEqual(
      fingerprint(head, refs, [{ ...stashes[1], name: 'stash@{0}' }]),
      before,
    );
  });
});

suite('Decorated commits', () => {
  test('finds the commits with refs and places those shown in the list', () => {
    const decorated = decoratedCommits(refs);
    assert.deepStrictEqual([...decorated], ['a', 'b', 'c']);
    const positions = new Map([
      ['a', 0],
      ['b', 5],
    ]);
    assert.deepStrictEqual(decorations(decorated, positions), [0, 5]);
  });

  test('counts the bubble of a stash on its commit', () => {
    const decorated = decoratedCommits(refs, undefined, [
      { name: 'stash@{0}', commit: 's', message: 'On main: kept' },
    ]);
    assert.ok(decorated.has('s'));
  });
});

suite('Detached HEAD', () => {
  test('counts as a bubble on its commit', () => {
    const detached = { name: undefined, commit: 'd' };
    assert.ok(decoratedCommits(refs, detached).has('d'));
    assert.strictEqual(detachedHead(detached), 'd');
  });

  test('is nothing while a branch is checked out', () => {
    assert.ok(!decoratedCommits(refs, { name: 'main', commit: 'd' }).has('d'));
    assert.strictEqual(detachedHead({ name: 'main', commit: 'a' }), undefined);
  });
});
