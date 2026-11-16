import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  confirmsClose,
  folderTools,
  tools,
} from '../../../../shell/shared/tools';

suite('Tools', () => {
  test('orders the tools Terminal, Commander, Git, as the + menu and the Open With popup show them, leaving out the Viewer, the Editor and the Diff, which open files rather than a folder', () => {
    assert.deepStrictEqual(folderTools, ['terminal', 'commander', 'git']);
    assert.deepStrictEqual(tools, [...folderTools, 'viewer', 'editor', 'diff']);
  });

  test('asks before closing a tab of the Terminal, whose shell goes with it, and closes those of the other tools at once', () => {
    assert.deepStrictEqual(confirmsClose, {
      terminal: true,
      commander: false,
      git: false,
      viewer: false,
      editor: false,
      diff: false,
    });
  });
});
