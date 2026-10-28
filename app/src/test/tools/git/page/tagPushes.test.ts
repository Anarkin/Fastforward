import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../tools/git/shared/protocol';
import { tagsOnRemote } from '../../../../tools/git/page/tagPushes';

suite('Tag pushes', () => {
  test('knows the tags a remote has by their names there, whatever commit each points at, apart from the tags of other remotes', () => {
    const refs: RefInfo[] = [
      { kind: 'tag', name: 'v1', commit: 'a' },
      { kind: 'remote-tag', name: 'origin/v1', commit: 'b', remote: 'origin' },
      { kind: 'remote-tag', name: 'origin/v2', commit: 'a', remote: 'origin' },
      {
        kind: 'remote-tag',
        name: 'team/fork/v3',
        commit: 'a',
        remote: 'team/fork',
      },
      { kind: 'remote', name: 'origin/main', commit: 'a', remote: 'origin' },
    ];
    assert.deepStrictEqual(tagsOnRemote(refs, 'origin'), new Set(['v1', 'v2']));
    assert.deepStrictEqual(tagsOnRemote(refs, 'team/fork'), new Set(['v3']));
  });
});
