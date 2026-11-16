import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { KeptGitTabs } from '../../../../../tools/git/main/keptGitTabs';
import {
  unattachedShell,
  type Page,
  type Tab,
} from '../../../../../shell/main/toolContract';

const pageOf = (): Page => ({ post: () => {}, disposed: false });

function windows() {
  const first = pageOf();
  const second = pageOf();
  const tabs: Tab[] = [
    { id: '1', tool: 'git', root: '/repo' },
    { id: '2', tool: 'git', root: '/other' },
    { id: '3', tool: 'git', compare: { old: '/a.txt', new: '/b.txt' } },
    { id: '4', tool: 'commander', root: '/repo' },
    { id: '5', tool: 'git', compare: { old: '/c.txt', new: '/d.txt' } },
  ];
  const held = new Map<Page, string[]>([
    [first, ['1', '2', '3']],
    [second, ['4', '5']],
  ]);
  const kept = new KeptGitTabs(() => ({
    ...unattachedShell,
    tabs: () => tabs,
    tabsOf: (page) =>
      tabs.filter((tab) => held.get(page)?.includes(tab.id) === true),
  }));
  kept.ready(first);
  kept.ready(second);
  const move = (tab: string, to: Page) => {
    for (const [page, ids] of held) {
      held.set(
        page,
        page === to ? [...ids, tab] : ids.filter((id) => id !== tab),
      );
    }
  };
  return { first, second, kept, move };
}

suite('What git pages keep of their tabs', () => {
  test('keeps what a page sends of a worktree of any git tab of its window, not only the one shown, handing it to a page that did not keep it last', () => {
    const { first, second, kept } = windows();
    kept.keepWorktree(first, '/other', '/other-worktree', { column: 'diff' });
    kept.keepCompare(first, '3', { find: 1 });
    assert.strictEqual(
      kept.worktreeHandedTo(first, '/other-worktree'),
      undefined,
    );
    assert.deepStrictEqual(kept.worktreeHandedTo(second, '/other-worktree'), {
      column: 'diff',
    });
    assert.deepStrictEqual(kept.compareHandedTo(second, '3'), { find: 1 });
    assert.strictEqual(kept.compareHandedTo(first, '3'), undefined);
  });

  test('refuses what a page sends of a repository no git tab of its window holds, and of a compare tab of another window or of another tool, as the page is not trusted', () => {
    const { first, second, kept } = windows();
    kept.keepWorktree(second, '/repo', '/repo', { column: 'diff' });
    kept.keepCompare(first, '5', { find: 1 });
    kept.keepCompare(second, '4', { find: 1 });
    kept.keepCompare(first, '1', { find: 1 });
    assert.deepStrictEqual(
      [
        kept.worktreeHandedTo(first, '/repo'),
        kept.compareHandedTo(second, '5'),
        kept.compareHandedTo(first, '4'),
        kept.compareHandedTo(second, '1'),
      ],
      [undefined, undefined, undefined, undefined],
    );
  });

  test('takes what a page sends of a tab it showed just before, as a window a tab moved out of sends what it kept of it once it shows another', () => {
    const { first, second, kept, move } = windows();
    kept.showing(first, '1');
    move('1', second);
    kept.showing(first, '2');
    kept.keepWorktree(first, '/repo', '/repo', { column: 'files' });
    move('3', second);
    kept.keepCompare(first, '3', { find: 1 });
    assert.deepStrictEqual(kept.worktreeHandedTo(second, '/repo'), {
      column: 'files',
    });
    assert.strictEqual(kept.compareHandedTo(second, '3'), undefined);
  });

  test('hands a tab back to the page of the window it moved out of should it come back, as that page let go of what it kept of it', () => {
    const { first, second, kept, move } = windows();
    kept.keepWorktree(first, '/repo', '/repo', { column: 'diff' });
    kept.keepCompare(first, '3', { find: 1 });
    kept.showing(first, '3');
    move('3', second);
    kept.keepCompare(first, '3', { find: 2 });
    kept.leftWorktree(first, '/repo');
    assert.deepStrictEqual(
      [kept.worktreeHandedTo(first, '/repo'), kept.compareHandedTo(first, '3')],
      [{ column: 'diff' }, { find: 2 }],
    );
  });

  test('refuses what is too large to keep, and forgets what a closed tab kept', () => {
    const { first, second, kept } = windows();
    kept.keepWorktree(first, '/repo', '/repo', 'x'.repeat(2 * 1024 * 1024));
    assert.strictEqual(kept.worktreeHandedTo(second, '/repo'), undefined);
    kept.keepWorktree(first, '/repo', '/repo', { column: 'diff' });
    kept.keepCompare(first, '3', { find: 1 });
    kept.forgetWorktree('/repo');
    kept.forgetCompare('3');
    assert.deepStrictEqual(
      [
        kept.worktreeHandedTo(second, '/repo'),
        kept.compareHandedTo(second, '3'),
      ],
      [undefined, undefined],
    );
  });
});
