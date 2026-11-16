import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  mostWorktrees,
  TabWorktrees,
} from '../../../../../tools/git/page/tabWorktrees';

suite('Worktrees of the tabs a page showed', () => {
  test('keeps the worktrees each tab showed, the last shown last, as many as its view holds', () => {
    const worktrees = new TabWorktrees();
    for (let index = 0; index <= mostWorktrees; index++) {
      worktrees.shown('1', `/w${index}`);
    }
    worktrees.shown('1', '/w5');
    worktrees.shown('2', '/other');

    assert.strictEqual(worktrees.of('1').length, mostWorktrees);
    assert.deepStrictEqual(worktrees.of('1').slice(0, 2), ['/w1', '/w2']);
    assert.strictEqual(worktrees.of('1').at(-1), '/w5');
    assert.deepStrictEqual(
      [
        worktrees.tabOf('/w5'),
        worktrees.tabOf('/other'),
        worktrees.tabOf('/w0'),
      ],
      ['1', '2', undefined],
    );
  });

  test('knows the compare tabs apart, and forgets a tab let go', () => {
    const worktrees = new TabWorktrees();
    worktrees.compared('7');
    worktrees.shown('1', '/repo');

    assert.deepStrictEqual(
      [
        worktrees.isCompare('7'),
        worktrees.isCompare('1'),
        worktrees.knows('7'),
      ],
      [true, false, true],
    );
    worktrees.forget('7');
    worktrees.forget('1');
    assert.deepStrictEqual(
      [worktrees.knows('7'), worktrees.knows('1'), worktrees.tabOf('/repo')],
      [false, false, undefined],
    );
  });
});
