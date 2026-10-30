import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { confirmsClose, tools } from '../../../shell/shared/tools';
import { defaultSettings } from '../../fixtures';

suite('Tools', () => {
  test('orders the tools Terminal, Commander, Git, as the + menu, the Open With popup and the settings show them', () => {
    assert.deepStrictEqual(tools, ['terminal', 'commander', 'git']);
    assert.deepStrictEqual(Object.keys(defaultSettings().tools), tools);
  });

  test('asks before closing a tab of the Terminal, whose shell goes with it, and closes those of the other tools at once', () => {
    assert.deepStrictEqual(confirmsClose, {
      terminal: true,
      commander: false,
      git: false,
    });
  });
});
