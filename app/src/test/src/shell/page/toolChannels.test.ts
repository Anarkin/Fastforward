import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ToHost } from '../../../../shell/shared/protocol';
import { createShellStore } from '../../../../shell/page/store';

suite('Tool channels', () => {
  test('hands each tool the messages meant for it, and posts what a tool asks under its name', () => {
    const posted: ToHost[] = [];
    const store = createShellStore((message) => posted.push(message));
    const { channels, receive } = store.getState();
    const toGit: unknown[] = [];
    const toTerminal: unknown[] = [];
    const stop = channels.git.listen((message) => toGit.push(message));
    channels.terminal.listen((message) => toTerminal.push(message));
    const worktrees = {
      type: 'worktrees',
      worktree: '/repo',
      worktrees: [],
    } as const;
    receive({ type: 'tool', tool: 'git', message: worktrees });
    assert.deepStrictEqual(toGit, [worktrees]);
    assert.deepStrictEqual(toTerminal, []);
    stop();
    receive({ type: 'tool', tool: 'git', message: worktrees });
    assert.strictEqual(toGit.length, 1);
    channels.terminal.post({ type: 'newTab' });
    assert.deepStrictEqual(posted, [
      { type: 'tool', tool: 'terminal', message: { type: 'newTab' } },
    ]);
  });
});
