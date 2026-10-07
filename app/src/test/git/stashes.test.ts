import * as assert from 'node:assert';
import { parseStashes } from '../../git/stashes';

suite('Stash list parser', () => {
  test('reads each stash newest first, with the commit of its untracked files if it has one', () => {
    const output = [
      'stash@{0}\0s0\0b i0 u0\0On main: with new',
      'stash@{1}\0s1\0b i1\0WIP on main: 1a2b3c4 base',
      '',
    ].join('\n');
    assert.deepStrictEqual(parseStashes(output), [
      {
        name: 'stash@{0}',
        commit: 's0',
        message: 'On main: with new',
        untracked: 'u0',
      },
      {
        name: 'stash@{1}',
        commit: 's1',
        message: 'WIP on main: 1a2b3c4 base',
        untracked: undefined,
      },
    ]);
    assert.deepStrictEqual(parseStashes(''), []);
  });
});
