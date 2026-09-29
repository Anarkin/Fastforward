import * as assert from 'node:assert';
import type { RefInfo } from '../shared/protocol';
import { enterTarget, searchRefs } from '../webview/locations';

const refs: RefInfo[] = [
  { kind: 'remote', name: 'origin/feat/EPMAISA-798-drop', commit: 'a' },
  { kind: 'branch', name: 'main', commit: 'b' },
  { kind: 'tag', name: 'v0.16.4', commit: 'c' },
  { kind: 'branch', name: 'feat/epmaisa-798-drop', commit: 'a' },
  { kind: 'remote', name: 'origin/fix/typo', commit: 'd' },
];

const names = (groups: ReturnType<typeof searchRefs>) =>
  groups.map((group) => [group.title, group.refs.map((ref) => ref.name)]);

suite('Locations search', () => {
  test('finds parts of names, ignoring case, in a group per kind', () => {
    assert.deepStrictEqual(names(searchRefs(refs, 'Epmaisa-798')), [
      ['Branches', ['feat/epmaisa-798-drop']],
      ['Remotes', ['origin/feat/EPMAISA-798-drop']],
      ['Tags', []],
    ]);
  });

  test('keeps every group, as each has its own column', () => {
    assert.deepStrictEqual(names(searchRefs(refs, 'v0.16')), [
      ['Branches', []],
      ['Remotes', []],
      ['Tags', ['v0.16.4']],
    ]);
  });

  test('draws at most the limit per group and counts the rest', () => {
    const [branches, remotes] = searchRefs(refs, 'o', 1);
    // feat/epmaisa-798-drop matches among the branches, both remotes match
    assert.deepStrictEqual([branches.refs.length, branches.more], [1, 0]);
    assert.deepStrictEqual([remotes.refs.length, remotes.more], [1, 1]);
  });

  test('jumps on Enter to a typed commit, then to the highlighted match', () => {
    const branch = refs[3];
    const commit = 'b'.repeat(40);
    assert.strictEqual(
      enterTarget(
        'ab12',
        { kind: 'found', hash: commit, subject: 's' },
        branch,
      ),
      commit,
    );
    assert.strictEqual(
      enterTarget('ab12', { kind: 'none' }, branch),
      branch.commit,
    );
    assert.strictEqual(enterTarget('feat', undefined, branch), branch.commit);
  });

  test('jumps on Enter to a hash not looked up yet as typed', () => {
    assert.strictEqual(enterTarget('A1B2c3d4', undefined, refs[3]), 'a1b2c3d4');
  });

  test('does nothing on Enter without a search, which highlights no match', () => {
    assert.strictEqual(enterTarget('', undefined, refs[3]), undefined);
  });
});
