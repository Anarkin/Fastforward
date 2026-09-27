import * as assert from 'node:assert';
import type { RefInfo, Vip, VipRef } from '../protocol';
import { bubbleRow, compareVips } from '../webview/vips';

const names = (vips: Vip[]) => vips.map((vip) => vip.name);

suite('VIP order', () => {
  test('puts remote branches next to the local ones of the same name', () => {
    const vips: VipRef[] = [
      { kind: 'remote', name: 'origin/main' },
      { kind: 'branch', name: 'feature/x' },
      { kind: 'tag', name: 'v1.0' },
      { kind: 'remote', name: 'origin/feature/x' },
      { kind: 'branch', name: 'Main' },
      { kind: 'remote', name: 'upstream/main' },
    ];
    assert.deepStrictEqual(
      vips.toSorted(compareVips).map((vip) => vip.name),
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
  const main: VipRef = { kind: 'branch', name: 'main' };
  const v1: VipRef = { kind: 'tag', name: 'v1' };

  test('pairs the checked-out branch with the branch it tracks', () => {
    const row = bubbleRow([main, v1], refs, 'feature', 'fork/feature-work');
    assert.deepStrictEqual(row.branch, { kind: 'branch', name: 'feature' });
    assert.deepStrictEqual(row.upstream, {
      kind: 'remote',
      name: 'fork/feature-work',
    });
    assert.deepStrictEqual(names(row.others), ['main', 'v1']);
  });

  test('shows a VIP that is in the pair only once', () => {
    const row = bubbleRow([main, v1], refs, 'main', 'origin/main');
    assert.deepStrictEqual(row.branch, main);
    assert.deepStrictEqual(names(row.others), ['v1']);
  });

  test('pairs nothing without an upstream, or with a detached HEAD', () => {
    assert.strictEqual(
      bubbleRow([], refs, 'feature', undefined).upstream,
      undefined,
    );
    const detached = bubbleRow([main], refs, undefined, undefined);
    assert.strictEqual(detached.branch, undefined);
    assert.deepStrictEqual(names(detached.others), ['main']);
  });

  test('puts commits after the refs, leaving out the detached HEAD', () => {
    const first: Vip = { kind: 'commit', name: 'c1' };
    const second: Vip = { kind: 'commit', name: 'b2' };
    const row = bubbleRow([second, v1, first, main], refs, 'main', undefined);
    assert.deepStrictEqual(names(row.others), ['v1', 'b2', 'c1']);
    const detached = bubbleRow(
      [second, first],
      refs,
      undefined,
      undefined,
      'c1',
    );
    assert.deepStrictEqual(names(detached.others), ['b2']);
  });
});
