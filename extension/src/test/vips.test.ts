import * as assert from 'node:assert';
import type { RefInfo, Vip, VipRef } from '../protocol';
import { bubbleRow, compareVips, vipOptions } from '../webview/vips';

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
    assert.deepStrictEqual(names(row.vips), ['main', 'v1']);
  });

  test('keeps a checked-out VIP in its place, without its upstream', () => {
    const origin: VipRef = { kind: 'remote', name: 'origin/main' };
    const row = bubbleRow([v1, origin, main], refs, 'main', 'origin/main');
    assert.deepStrictEqual(row.branch, main);
    assert.deepStrictEqual(names(row.vips), ['main', 'v1']);
  });

  test('pairs nothing without an upstream, or with a detached HEAD', () => {
    assert.strictEqual(
      bubbleRow([], refs, 'feature', undefined).upstream,
      undefined,
    );
    const detached = bubbleRow([main], refs, undefined, undefined);
    assert.strictEqual(detached.branch, undefined);
    assert.deepStrictEqual(names(detached.vips), ['main']);
  });

  test('knows whether what is checked out is a VIP', () => {
    assert.strictEqual(
      bubbleRow([v1], refs, 'main', 'origin/main').checkedOutIsVip,
      false,
    );
    assert.strictEqual(
      bubbleRow([main], refs, 'main', 'origin/main').checkedOutIsVip,
      true,
    );
    const commit: Vip = { kind: 'commit', name: 'c1' };
    assert.strictEqual(
      bubbleRow([commit], refs, undefined, undefined, 'c1').checkedOutIsVip,
      true,
    );
    assert.strictEqual(
      bubbleRow([main], refs, undefined, undefined, 'c2').checkedOutIsVip,
      false,
    );
  });

  test('puts commits after the refs', () => {
    const first: Vip = { kind: 'commit', name: 'c1' };
    const second: Vip = { kind: 'commit', name: 'b2' };
    const row = bubbleRow([second, v1, first, main], refs, 'main', undefined);
    assert.deepStrictEqual(names(row.vips), ['main', 'v1', 'b2', 'c1']);
    const detached = bubbleRow(
      [second, first],
      refs,
      undefined,
      undefined,
      'c1',
    );
    assert.deepStrictEqual(names(detached.vips), ['b2', 'c1']);
  });
});

suite('VIP options', () => {
  test("lists a commit's refs in VIP order, then the commit", () => {
    const refs: RefInfo[] = [
      { kind: 'tag', name: 'v2', commit: 'abcdef123' },
      { kind: 'remote', name: 'origin/feature', commit: 'abcdef123' },
      { kind: 'branch', name: 'other', commit: 'fedcba' },
      { kind: 'branch', name: 'feature', commit: 'abcdef123' },
    ];
    assert.deepStrictEqual(
      vipOptions('abcdef123', refs).map((option) => option.label),
      ['feature', 'origin/feature', 'v2', 'abcdef1'],
    );
  });
});
