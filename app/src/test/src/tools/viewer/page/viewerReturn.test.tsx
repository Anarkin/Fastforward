import { ViewerTool } from '../../../../../tools/viewer/page/tool';
import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import {
  inViewerTool,
  viewedTextOf,
  type ShownViewer as ShownTool,
} from './viewerToolFixtures';

vi.mock('../../../../../lib/page/syntax', () => ({
  startColorer: () => undefined,
  colorer: () => ({ colorParts: () => () => undefined }),
}));

const envFile = viewedTextOf(
  Array.from({ length: 60 }, (_, index) =>
    index % 6 === 3 ? `ADAM_${index}=adam` : `KEY_${index}=value`,
  ),
);

const viewing = (tab: string) =>
  ({ type: 'viewing', tab, size: envFile.size, version: '1' }) as const;

async function viewed(tool: ShownTool, tab = 'V'): Promise<void> {
  await tool.send({ type: 'show', tab, file: 'C:\\work\\.env' });
  await tool.send(viewing(tab));
  await tool.answerRows(envFile);
}

async function foundSecond(tool: ShownTool): Promise<void> {
  await tool.press('f', { ctrlKey: true });
  await tool.type('adam');
  await tool.answerFinds(envFile);
  await tool.press('Enter');
  await tool.answerRows(envFile);
  assert.strictEqual(countShown(tool), '2 of 10');
}

const findBox = ({ document }: ShownTool) =>
  document.querySelector<HTMLInputElement>('.viewer .search-box-input');

async function caretAt(tool: ShownTool, at: number): Promise<void> {
  const box = findBox(tool);
  assert.ok(box);
  box.setSelectionRange(at, at);
  await tool.keyUp('ArrowLeft');
}

const countShown = ({ document }: ShownTool) =>
  document.querySelector('.viewer .search-count')?.textContent;

const currentRow = ({ document }: ShownTool) =>
  document.querySelector('.viewer-row:has(.find-match.current)')?.textContent;

const marked = ({ document }: ShownTool) =>
  document.querySelectorAll('.viewer .find-match').length;

function assertFindAsLeft(tool: ShownTool): void {
  const box = findBox(tool);
  assert.ok(box, 'the find bar open');
  assert.strictEqual(box.value, 'adam');
  assert.strictEqual(countShown(tool), '2 of 10');
  assert.strictEqual(currentRow(tool), 'ADAM_9=adam');
  assert.ok(marked(tool) > 1, 'every match on screen marked');
  assert.ok(tool.document.activeElement === box, 'the focus in the box');
  assert.deepStrictEqual([box.selectionStart, box.selectionEnd], [2, 2]);
}

suite('A viewer tab shown again', () => {
  test('comes back from the tab of another tool with its find bar open, its query, the match it was at counted and marked, and the caret where it was in the box, without searching the file again', () =>
    inViewerTool(ViewerTool, async (tool) => {
      await viewed(tool);
      await foundSecond(tool);
      await caretAt(tool, 2);
      const finds = tool.posted.filter(({ type }) => type === 'findText');

      await tool.shown(false);
      await tool.send({ type: 'hide' });
      await tool.shown(true);
      await viewed(tool);

      assertFindAsLeft(tool);
      assert.deepStrictEqual(
        tool.posted.filter(({ type }) => type === 'findText'),
        finds,
      );
    }));

  test('comes back from a tab of another tool with its find as it was left, and leaves no find in a viewer tab of another file', () =>
    inViewerTool(ViewerTool, async (tool) => {
      await viewed(tool);
      await foundSecond(tool);
      await caretAt(tool, 2);

      await tool.send({ type: 'hide' });
      assert.strictEqual(findBox(tool), null);
      await viewed(tool, 'W');
      assert.strictEqual(findBox(tool), null, 'no find in another viewer');
      assert.strictEqual(marked(tool), 0);
      await viewed(tool);

      assertFindAsLeft(tool);
    }));
});
