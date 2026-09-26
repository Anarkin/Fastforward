import * as assert from 'node:assert';
import type { VipRef } from '../protocol';
import { compareVips } from '../webview/vips';

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
