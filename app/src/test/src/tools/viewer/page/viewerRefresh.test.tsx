import { ViewerTool } from '../../../../../tools/viewer/page/tool';
import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { inViewerTool, viewedTextOf } from './viewerToolFixtures';

vi.mock('../../../../../components/syntax/page/colorer', () => ({
  startColorer: () => undefined,
  colorer: () => ({ colorParts: () => () => undefined }),
}));

const notes = viewedTextOf(['plain notes']);

suite('Refreshing the viewer', () => {
  test('asks for the file viewed to be read again on F2 and on Ctrl+R, as the commander rereads its folders on them, for a change its watcher missed', () =>
    inViewerTool(ViewerTool, async (tool) => {
      await tool.send({ type: 'show', tab: 'V', file: 'C:\\work\\notes.txt' });
      await tool.send({
        type: 'viewing',
        tab: 'V',
        size: notes.size,
        version: '1',
      });
      await tool.answerRows(notes);
      await tool.press('F2');
      await tool.press('r', { ctrlKey: true });
      assert.deepStrictEqual(tool.asked('refresh'), [
        { type: 'refresh', tab: 'V' },
        { type: 'refresh', tab: 'V' },
      ]);
    }));
});
