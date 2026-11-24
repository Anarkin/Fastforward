import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { DiffTool } from '../../../../../tools/diff/page/tool';
import { inTool } from '../../../../helpers/toolFixtures';

vi.mock('../../../../../components/syntax/page/colorer', () => ({
  startColorer: () => undefined,
  colorer: () => ({ colorParts: () => () => undefined }),
}));

suite('Refreshing the diff tab', () => {
  test('asks for the files compared to be compared again on F2 and on Ctrl+R, as the commander rereads its folders on them, for a change its watcher missed', () =>
    inTool('diff', DiffTool, async (tool) => {
      await tool.send({
        type: 'show',
        tab: 'D',
        settings: {
          diffLayout: 'sideBySide',
          ignoreWhitespace: true,
          showEntireFile: true,
        },
      });
      await tool.press('F2');
      await tool.press('r', { ctrlKey: true });
      assert.deepStrictEqual(tool.asked('refresh'), [
        { type: 'refresh' },
        { type: 'refresh' },
      ]);
    }));
});
