import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { confirmsClose } from '../../../shell/shared/tools';

suite('Tools', () => {
  test('asks before closing a tab of the Terminal, whose shell goes with it, and closes those of the other tools at once', () => {
    assert.deepStrictEqual(confirmsClose, {
      git: false,
      files: false,
      terminal: true,
    });
  });
});
