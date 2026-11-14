import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { buildTree, indexRefs } from '../../../../../tools/git/page/refIndex';

const refNamed = (kind: RefInfo['kind'], name: string): RefInfo => ({
  kind,
  name,
  commit: 'a',
});

suite('Ref index', () => {
  test('sorts the refs of each kind by name once, for every search after', () => {
    const index = indexRefs([
      refNamed('branch', 'b'),
      refNamed('tag', 'v1'),
      refNamed('branch', 'A'),
    ]);
    assert.deepStrictEqual(
      index.map((group) => [group.kind, group.refs.map((ref) => ref.name)]),
      [
        ['branch', ['A', 'b']],
        ['remote', []],
        ['tag', ['v1']],
      ],
    );
  });

  test('keeps the names of each kind folded as every find folds them, in the order of its refs', () => {
    const [branches] = indexRefs([
      refNamed('branch', 'Café'),
      refNamed('branch', 'ΟΔΟΣ'),
    ]);
    assert.deepStrictEqual(branches.names, ['café', 'οδοσ']);
  });

  test('lays the refs of each kind out as a tree, folders first', () => {
    const [branches] = indexRefs([
      refNamed('branch', 'main'),
      refNamed('branch', 'feat/a'),
    ]);
    assert.deepStrictEqual(
      branches.tree.children.map((node) => node.name),
      ['feat', 'main'],
    );
  });

  test('orders a tree folders first, then by name', () => {
    const tags = ['v2', 'v10', 'rel/a', 'alpha'].map((name) =>
      refNamed('tag', name),
    );
    assert.deepStrictEqual(
      buildTree(tags).children.map((node) => node.name),
      ['rel', 'alpha', 'v10', 'v2'],
    );
  });
});
