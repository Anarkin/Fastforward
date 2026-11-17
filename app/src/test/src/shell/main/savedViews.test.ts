import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import {
  maxSavedViewChars,
  savedViewsOf,
  ViewSaver,
  viewsToSave,
  type ViewVersions,
} from '../../../../shell/main/savedViews';

const versions: ViewVersions = (tool) =>
  tool === 'viewer' ? 3 : tool === 'editor' ? 2 : 1;

suite('Views saved with the tabs', () => {
  test('saves the view of each tab with the version of its schema, leaving out a view over 64 KiB', () => {
    assert.deepStrictEqual(
      viewsToSave(
        [
          ['1', { tool: 'viewer', view: '{"place":7}' }],
          ['2', { tool: 'editor', view: 'x'.repeat(maxSavedViewChars + 1) }],
        ],
        versions,
      ),
      { 1: { version: 3, view: '{"place":7}' } },
    );
  });

  test('hands back the views saved for the tabs there are, of the version of their schema, leaving out those of another version, of tabs gone or not of their shape', () => {
    const tools = new Map([
      ['1', 'viewer'],
      ['2', 'editor'],
      ['3', 'git'],
    ] as const);
    assert.deepStrictEqual(
      [
        ...savedViewsOf(
          {
            1: { version: 3, view: '{"place":7}' },
            2: { version: 1, view: '{}' },
            3: { version: 1, view: 5 },
            4: { version: 1, view: '{}' },
          },
          tools,
          versions,
        ),
      ],
      [['1', '{"place":7}']],
    );
    assert.deepStrictEqual([...savedViewsOf('views', tools, versions)], []);
  });

  test('writes the views once a while after they change, and at once when flushed, as the app quits', () => {
    vi.useFakeTimers();
    try {
      let writes = 0;
      const saver = new ViewSaver(() => (writes += 1), 1000);
      saver.changed();
      saver.changed();
      vi.advanceTimersByTime(999);
      assert.strictEqual(writes, 0);
      vi.advanceTimersByTime(1);
      assert.strictEqual(writes, 1);
      saver.changed();
      saver.flush();
      saver.flush();
      assert.strictEqual(writes, 2);
      vi.advanceTimersByTime(2000);
      assert.strictEqual(writes, 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
