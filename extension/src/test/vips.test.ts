import * as assert from 'node:assert';
import type { RefInfo, VipRef } from '../protocol';
import { compareVips, shownVips } from '../webview/vips';

const names = (vips: VipRef[]) => vips.map((vip) => vip.name);

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

suite('VIPs shown', () => {
  const refs: RefInfo[] = [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'branch', name: 'feature', commit: 'b' },
    { kind: 'remote', name: 'origin/feature', commit: 'b' },
    { kind: 'remote', name: 'fork/feature-work', commit: 'b' },
  ];
  const main: VipRef = { kind: 'branch', name: 'main' };

  test('adds the checked-out branch and the branch it tracks', () => {
    assert.deepStrictEqual(
      names(shownVips([main], refs, 'feature', 'fork/feature-work')),
      ['feature', 'fork/feature-work', 'main'],
    );
  });

  test('falls back to a remote branch of the same name', () => {
    assert.deepStrictEqual(
      names(shownVips([main], refs, 'feature', undefined)),
      ['feature', 'origin/feature', 'main'],
    );
  });

  test("doesn't repeat VIPs, or add refs that don't exist", () => {
    assert.deepStrictEqual(
      names(shownVips([main], refs, 'main', 'origin/gone')),
      ['main'],
    );
    assert.deepStrictEqual(
      names(shownVips([main], refs, undefined, undefined)),
      ['main'],
    );
  });
});
