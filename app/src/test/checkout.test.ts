import * as assert from 'node:assert';
import type { RefInfo } from '../shared/protocol';
import {
  checkoutCommit,
  checkoutOptions,
  checkoutRef,
} from '../webview/checkout';

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

  test('knows the local branch of a remote branch of a remote with a slash in its name', () => {
    const forked: RefInfo[] = [
      { kind: 'branch', name: 'main', commit: 'aaaaaaaa' },
      {
        kind: 'remote',
        name: 'team/fork/main',
        remote: 'team/fork',
        commit: 'aaaaaaaa',
      },
    ];
    assert.strictEqual(
      checkoutRef(remote('team/fork/main'), forked, 'main').disabled,
      true,
    );
  });

  test('checks out a ref by its kind and name', () => {
    for (const ref of [
      { kind: 'branch' as const, name: 'main' },
      remote('origin/feature'),
      { kind: 'tag' as const, name: 'v1' },
    ]) {
      assert.deepStrictEqual(checkoutRef(ref, refs, 'main').target, ref);
    }
  });

  test('checks out a commit unless it is the detached HEAD', () => {
    assert.deepStrictEqual(checkoutCommit('cccccccc', undefined), {
      label: 'ccccccc',
      target: { kind: 'commit', hash: 'cccccccc' },
      disabled: false,
    });
    assert.strictEqual(checkoutCommit('cccccccc', 'cccccccc').disabled, true);
  });

  test("greys out a bookmarked ref that doesn't exist anymore", () => {
    for (const ref of [
      { kind: 'branch' as const, name: 'deleted' },
      remote('origin/deleted'),
      { kind: 'tag' as const, name: 'v0' },
    ]) {
      assert.strictEqual(checkoutRef(ref, refs, 'main').disabled, true);
    }
  });
});
