import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { confirmsClose, tools } from '../../../../shell/shared/tools';

suite('Tools', () => {
  test('orders the tools Terminal, Commander, Git, as the + menu and the Open With popup show them', () => {
    assert.deepStrictEqual(tools, ['terminal', 'commander', 'git']);
  });

  test('asks before closing a tab of the Terminal, whose shell goes with it, and closes those of the other tools at once', () => {
    assert.deepStrictEqual(confirmsClose, {
      terminal: true,
      commander: false,
      git: false,
    });
  });
});
