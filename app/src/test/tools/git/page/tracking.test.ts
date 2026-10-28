import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../tools/git/shared/protocol';
import { trackingOf } from '../../../../tools/git/page/tracking';

suite('Tracking', () => {
  test('finds how far a branch is from its upstream, by the branch, not a remote or tag of its name', () => {
    const tracking = { upstream: 'origin/main', ahead: 1, behind: 2 };
    const refs: RefInfo[] = [
      { kind: 'tag', name: 'main', commit: 'a' },
      { kind: 'branch', name: 'main', commit: 'a', tracking },
      { kind: 'branch', name: 'alone', commit: 'a' },
    ];
    assert.deepStrictEqual(trackingOf(refs, 'main'), tracking);
    assert.strictEqual(trackingOf(refs, 'alone'), undefined);
    assert.strictEqual(trackingOf(refs, 'missing'), undefined);
    assert.strictEqual(trackingOf(refs, undefined), undefined);
  });
});
