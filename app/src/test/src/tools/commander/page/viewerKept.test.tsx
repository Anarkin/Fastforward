import * as assert from 'node:assert';
import { CommanderTool } from '../../../../../tools/commander/page/tool';
import { suite, test, vi } from 'vitest';
import {
  commanderSettings,
  inCommanderTool,
  listingOf,
  viewedTextOf,
  type ShownTool,
} from './commanderToolFixtures';

const colored: string[] = [];

vi.mock('../../../../../lib/page/syntax', () => ({
  startColorer: () => undefined,
  colorer: () => ({
    colorParts: (
      language: string,
      code: string,
      part: (colors: unknown) => void,
    ) => {
      colored.push(language);
      part({
        from: 0,
        ends: new Uint32Array(code.split(String.fromCharCode(10)).length),
        ranges: new Uint32Array(0),
        done: true,
      });
      return () => undefined;
    },
  }),
}));

const longFile = viewedTextOf(
  Array.from({ length: 200 }, (_, index) => `line ${index}`),
);

const viewing = (tab: string, version = '1') =>
  ({ type: 'viewing', tab, size: longFile.size, version }) as const;

const rowsShown = ({ document }: ShownTool) =>
  [...document.querySelectorAll('.viewer-rows .viewer-row')].map(
    (row) => row.textContent,
  );

const asksSince = (tool: ShownTool, since: number) =>
  tool.posted
    .slice(since)
    .filter(({ type }) =>
      ['readRows', 'readText', 'findText', 'readBytes'].includes(type),
    );

async function awayAndBack(
  tool: ShownTool,
  file = 'C:\\work\\long.txt',
): Promise<void> {
  await tool.send({ type: 'show', tab: 'C' });
  await tool.send(listingOf('C', 'left', 'C:\\', ['a.txt']));
  await tool.send(listingOf('C', 'right', 'C:\\work', ['long.txt']));
  await tool.send({ type: 'show', tab: 'V', file });
}

suite('What a viewer tab keeps', () => {
  test('shows the rows it showed at once once shown again, asking for nothing before the main process views its file anew, as what it asks meanwhile is dropped', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      await tool.send({ type: 'show', tab: 'V', file: 'C:\\work\\long.txt' });
      await tool.send(viewing('V'));
      await tool.answerRows(longFile);
      await tool.press('PageDown');
      await tool.answerRows(longFile);
      const left = rowsShown(tool);
      assert.strictEqual(left[0], 'line 9');

      await awayAndBack(tool);
      const since = tool.posted.length;
      assert.deepStrictEqual(rowsShown(tool), left);
      await tool.settle();
      assert.deepStrictEqual(asksSince(tool, since), []);

      await tool.send(viewing('V'));
      assert.ok(asksSince(tool, since).length > 0, 'asked once viewed anew');
      await tool.answerRows(longFile);
      assert.deepStrictEqual(rowsShown(tool), left);
    }));

  test('reads the file anew once the main process says it changed while its tab was away', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      await tool.send({ type: 'show', tab: 'V', file: 'C:\\work\\long.txt' });
      await tool.send(viewing('V'));
      await tool.answerRows(longFile);

      await awayAndBack(tool);
      const changed = viewedTextOf(
        Array.from({ length: 200 }, (_, index) => `changed ${index}`),
      );
      await tool.send(viewing('V', '2'));
      await tool.answerRows(changed);
      assert.strictEqual(rowsShown(tool)[0], 'changed 0');
    }));

  test('keeps the whole text it read and the colors of its language once shown again, reading and coloring the file anew only once it changed', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      const show = () =>
        tool.send({ type: 'show', tab: 'V', file: 'C:\\work\\long.ts' });
      const wholeText = async () => {
        for (const ask of tool.asked('readText')) {
          await tool.send({
            type: 'text',
            tab: ask.tab,
            request: ask.request,
            text: longFile.rows
              .map((row) => row.text)
              .join(String.fromCharCode(10)),
          });
        }
      };
      await show();
      await tool.send(viewing('V'));
      await tool.answerRows(longFile);
      await wholeText();
      const reads = () =>
        tool.posted.filter(({ type }) => type === 'readText').length;
      assert.strictEqual(reads(), 1);
      assert.deepStrictEqual(colored, ['typescript']);

      await awayAndBack(tool, 'C:\\work\\long.ts');
      await tool.send(viewing('V'));
      await tool.answerRows(longFile);
      await tool.settle();
      assert.strictEqual(reads(), 1, 'the text kept');
      assert.deepStrictEqual(colored, ['typescript'], 'the colors kept');

      await tool.send(viewing('V', '2'));
      await tool.settle();
      assert.strictEqual(reads(), 2, 'the text read anew once changed');
    }));

  test('shows the bytes it showed in hex at once once shown again, reading none before the main process views its file anew', () =>
    inCommanderTool(CommanderTool, async (tool) => {
      await tool.send(commanderSettings);
      const bytes = Array.from(
        { length: longFile.size },
        (_, index) => index % 256,
      );
      await tool.send({ type: 'show', tab: 'V', file: 'C:\\work\\long.txt' });
      await tool.send(viewing('V'));
      await tool.answerRows(longFile);
      await tool.press('1');
      await tool.answerBytes(bytes);
      const hexRows = () =>
        [...tool.document.querySelectorAll('.hex-row')].map(
          (row) => row.textContent,
        );
      const left = hexRows();
      assert.ok(left.length > 1 && left.every((row) => row !== ''));

      await awayAndBack(tool);
      assert.deepStrictEqual(hexRows(), left);
      await tool.send(viewing('V'));
      await tool.settle();
      assert.deepStrictEqual(tool.asked('readBytes'), []);
      assert.deepStrictEqual(hexRows(), left);
    }));
});
