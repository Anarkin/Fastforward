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

const remote = (name: string) => ({ kind: 'remote' as const, name });

const labels = (options: ReturnType<typeof checkoutOptions>) =>
  options.map((option) => [option.label, option.disabled]);

suite('Checkout options', () => {
  test('lists branches, remotes, tags and the commit', () => {
    assert.deepStrictEqual(
      labels(checkoutOptions('aaaaaaaa', refs, 'main', undefined)),
      [
        ['main', true],
        ['origin/feature', false],
        ['origin/fix', false],
        ['origin/main', true],
        ['v1', false],
        ['aaaaaaa', false],
      ],
    );
  });

  test('offers just the commit when no refs point at it', () => {
    assert.deepStrictEqual(
      labels(checkoutOptions('cccccccc', refs, 'main', 'cccccccc')),
      [['ccccccc', true]],
    );
  });

  test('offers a remote branch whose checked-out local branch is elsewhere', () => {
    assert.strictEqual(
      checkoutRef(remote('origin/fix'), refs, 'fix').disabled,
      false,
    );
    assert.strictEqual(
      checkoutRef(remote('origin/main'), refs, 'main').disabled,
      true,
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
