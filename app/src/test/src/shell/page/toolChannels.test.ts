import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ToHost } from '../../../../shell/shared/protocol';
import { createShellStore } from '../../../../shell/page/store';

const commander = (id: string) =>
  ({ id, tool: 'commander', name: 'Commander' }) as const;

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

  test('keeps for every tool the view of each tab handed to the page, or kept by a tool, sending what a tool keeps', () => {
    const posted: ToHost[] = [];
    const store = createShellStore((message) => posted.push(message));
    const { channels, receive } = store.getState();
    receive({
      type: 'tabs',
      tabs: [commander('1'), commander('2')],
      active: '1',
    });
    receive({ type: 'view', tab: '1', view: 'handed' });
    channels.git.views.keep('2', 'kept');

    assert.deepStrictEqual(
      [channels.commander.views.of('1'), channels.terminal.views.of('2')],
      ['handed', 'kept'],
    );
    assert.deepStrictEqual(posted, [
      { type: 'keepView', tab: '2', view: 'kept' },
    ]);
    receive({ type: 'tabs', tabs: [commander('2')], active: '2' });
    assert.strictEqual(channels.commander.views.of('1'), undefined);
  });

  test('releases a tab by asking every tool for its view of it, sending the one a tool has, else the one the page was handed, else none, and letting go of it', () => {
    const posted: ToHost[] = [];
    const store = createShellStore((message) => posted.push(message));
    const { channels, receive } = store.getState();
    const asked: string[] = [];
    channels.terminal.views.onRelease((tab) => {
      asked.push(`terminal ${tab}`);
      return undefined;
    });
    const stop = channels.commander.views.onRelease((tab) => {
      asked.push(`commander ${tab}`);
      return tab === '1' ? 'from the tool' : undefined;
    });
    receive({ type: 'view', tab: '2', view: 'handed' });

    for (const tab of ['1', '2', '3']) {
      receive({ type: 'release', tab });
    }
    stop();
    receive({ type: 'release', tab: '1' });

    assert.deepStrictEqual(asked, [
      'terminal 1',
      'commander 1',
      'terminal 2',
      'commander 2',
      'terminal 3',
      'commander 3',
      'terminal 1',
    ]);
    assert.deepStrictEqual(posted, [
      { type: 'released', tab: '1', view: 'from the tool' },
      { type: 'released', tab: '2', view: 'handed' },
      { type: 'released', tab: '3', view: '' },
      { type: 'released', tab: '1', view: '' },
    ]);
    assert.strictEqual(channels.git.views.of('2'), undefined);
  });
});
