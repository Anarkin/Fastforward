import * as assert from 'node:assert';
import { CommanderTool } from '../../../../../tools/commander/page/tool';
import { suite, test } from 'vitest';
import {
  commanderSettings,
  inCommanderTool,
  listingOf,
  type ShownTool,
} from './commanderToolFixtures';

async function sidesShown(tool: ShownTool, tab: string): Promise<void> {
  await tool.send({ type: 'show', tab });
  await tool.send(listingOf(tab, 'left', 'C:\\', ['a.txt', 'b.txt']));
  await tool.send(listingOf(tab, 'right', 'C:\\work', ['c.txt', 'd.txt']));
}

const lists = ({ document }: ShownTool) =>
  [...document.querySelectorAll('.commander-pane')].map((pane) =>
    pane.querySelector('[data-column-focus]'),
  );

const focused = (
  { document }: ShownTool,
  element: Element | null | undefined,
) =>
  element !== null &&
  element !== undefined &&
  document.activeElement === element;

const filterBox = ({ document }: ShownTool, side: number) =>
  [...document.querySelectorAll('.commander-pane')]
    .at(side)
    ?.querySelector<HTMLInputElement>('.search-box-input');

async function filtered(
  tool: ShownTool,
  side: number,
  typed: string,
  caret: number,
): Promise<void> {
  await tool.focus(lists(tool)[side]);
  await tool.press('f', { ctrlKey: true });
  await tool.type(typed);
  const box = filterBox(tool, side);
  assert.ok(box);
  box.setSelectionRange(caret, caret);
  await tool.keyUp('ArrowLeft');
}

suite('A commander tab shown again', () => {
  test('gives the focus back to the filter of the side that had it, with its caret, rather than to the list, and the list its focus in a tab that had it there', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      await sidesShown(tool, 'A');
      await filtered(tool, 1, 'txt', 1);

      await sidesShown(tool, 'B');
      assert.ok(focused(tool, lists(tool)[1]), 'the list focused');
      await tool.shown(false);
      await tool.send({ type: 'hide' });
      await tool.shown(true);
      await sidesShown(tool, 'A');

      const box = filterBox(tool, 1);
      assert.ok(box);
      assert.ok(focused(tool, box), 'the filter focused');
      assert.deepStrictEqual([box.selectionStart, box.selectionEnd], [1, 1]);
      await sidesShown(tool, 'B');
      assert.ok(focused(tool, lists(tool)[1]), 'the list focused');
    }));

  test('puts the caret of each tab back in the filter of a side both filter, rather than carrying the caret of one tab into the other', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      await sidesShown(tool, 'A');
      await filtered(tool, 0, 'a.txt', 1);
      await sidesShown(tool, 'B');
      await filtered(tool, 0, 'b.txt', 4);

      await sidesShown(tool, 'A');
      const box = filterBox(tool, 0);
      assert.ok(box);
      assert.strictEqual(box.value, 'a.txt');
      assert.ok(focused(tool, box), 'the filter focused');
      assert.deepStrictEqual([box.selectionStart, box.selectionEnd], [1, 1]);
      await sidesShown(tool, 'B');
      assert.strictEqual(box.value, 'b.txt');
      assert.deepStrictEqual([box.selectionStart, box.selectionEnd], [4, 4]);
    }));
});
