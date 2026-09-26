import * as assert from 'node:assert';
import type { RefInfo } from '../protocol';
import { checkoutOptions, checkoutRef } from '../webview/checkout';

const refs: RefInfo[] = [
  { kind: 'branch', name: 'main', commit: 'aaaaaaaa' },
  { kind: 'remote', name: 'origin/main', commit: 'aaaaaaaa' },
  { kind: 'remote', name: 'origin/feature', commit: 'aaaaaaaa' },
  { kind: 'tag', name: 'v1', commit: 'aaaaaaaa' },
  { kind: 'branch', name: 'fix', commit: 'bbbbbbbb' },
  { kind: 'remote', name: 'origin/fix', commit: 'aaaaaaaa' },
];

const labels = (options: ReturnType<typeof checkoutOptions>) =>
  options.map((option) => [option.label, option.disabled]);

suite('Checkout options', () => {
  test('lists branches, remotes without a local branch here, tags and the commit', () => {
    assert.deepStrictEqual(
      labels(checkoutOptions('aaaaaaaa', refs, 'main', undefined)),
      [
        ['main (checked out)', true],
        ['origin/feature (new branch feature)', false],
        ['origin/fix (switches to fix)', false],
        ['v1 (detached HEAD)', false],
        ['Commit aaaaaaa (detached HEAD)', false],
      ],
    );
  });

  test('offers just the commit when no refs point at it', () => {
    assert.deepStrictEqual(
      labels(checkoutOptions('cccccccc', refs, 'main', 'cccccccc')),
      [['Commit ccccccc (checked out)', true]],
    );
  });

  test('checks out a bubble the same way', () => {
    const option = checkoutRef(
      { kind: 'remote', name: 'origin/feature' },
      refs,
      'main',
    );
    assert.deepStrictEqual(option.target, {
      kind: 'remote',
      name: 'origin/feature',
    });
    assert.strictEqual(option.disabled, false);
  });
});
