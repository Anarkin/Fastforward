import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import type { Page, Tab } from '../../../../../shell/main/toolContract';
import { strings } from '../../../../../lib/shared/strings';
import {
  CanvasTool,
  maxBoardBytes,
} from '../../../../../tools/canvas/main/tool';
import type { CanvasToWebview } from '../../../../../tools/canvas/shared/protocol';
import { fakeShell } from '../../commander/main/fakeShell';

class CanvasPage implements Page {
  readonly messages: CanvasToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'canvas') {
      this.messages.push(message.message);
    }
  }
}

const file = '/boards/plan.canvas';

function canvas(
  files: Record<string, string>,
  sizes: Record<string, number> = {},
) {
  const tool = new CanvasTool({
    sizeOf: (name) =>
      name in files
        ? Promise.resolve(sizes[name] ?? files[name]?.length ?? 0)
        : Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })),
    readFile: (name) => {
      const text = files[name];
      return text === undefined
        ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }))
        : Promise.resolve(Buffer.from(text));
    },
  });
  const page = new CanvasPage();
  const shell = fakeShell(page);
  tool.attach(shell.shell);
  return { tool, page, ...shell };
}

const tab: Tab = { id: '7', tool: 'canvas', root: file };

const node = {
  id: 'a',
  type: 'text',
  x: 0,
  y: 0,
  width: 70,
  height: 36,
  text: 'Idea',
};

suite('Canvas tool', () => {
  test('shows the canvas of the file of its tab, read anew each time the tab shows, as nothing of it is edited yet', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page } = canvas(files);
    await tool.show(page, tab);
    assert.deepStrictEqual(page.messages, [
      { type: 'show', tab: '7', file },
      { type: 'board', tab: '7', file, board: { nodes: [node], edges: [] } },
    ]);
    files[file] = '{}';
    await tool.show(page, tab);
    assert.deepStrictEqual(page.messages.at(-1), {
      type: 'board',
      tab: '7',
      file,
      board: { nodes: [], edges: [] },
    });
  });

  test('says why it draws no canvas of a file too large, of no JSON, of JSON without a canvas or that is gone', async () => {
    const large = '/boards/large.canvas';
    const text = '/boards/text.canvas';
    const list = '/boards/list.canvas';
    const gone = '/boards/gone.canvas';
    const { tool, page } = canvas(
      { [large]: '{}', [text]: 'nodes', [list]: '[]' },
      { [large]: maxBoardBytes + 1 },
    );
    const errors = [];
    for (const shown of [large, text, list, gone]) {
      await tool.show(page, { id: shown, tool: 'canvas', root: shown });
      errors.push(page.messages.at(-1));
    }
    assert.deepStrictEqual(errors, [
      {
        type: 'board',
        tab: large,
        file: large,
        error: strings.canvas.tooLarge(large),
      },
      {
        type: 'board',
        tab: text,
        file: text,
        error: strings.canvas.notJson(text),
      },
      {
        type: 'board',
        tab: list,
        file: list,
        error: strings.canvas.notBoard(list),
      },
      {
        type: 'board',
        tab: gone,
        file: gone,
        error: strings.textFile.couldNotRead(gone, strings.commander.gone),
      },
    ]);
  });

  test('tells in a notice how many nodes and edges it leaves out, once while its tab is open', async () => {
    const { tool, page, notices } = canvas({
      [file]: JSON.stringify({
        nodes: [node, { id: 'b' }],
        edges: [{ id: 'e' }],
      }),
    });
    await tool.show(page, tab);
    await tool.show(page, tab);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.canvas.skipped(file, 2) },
    ]);
    tool.closed(page, tab);
    await tool.show(page, tab);
    assert.strictEqual(notices.length, 2);
  });

  test('opens a file in a canvas tab of its own, or the tab drawing it already, named after the file', async () => {
    const { tool, page, tabsOpened } = canvas({});
    await tool.open(page, [file]);
    assert.deepStrictEqual(tabsOpened, [['canvas', [file], true]]);
    assert.deepStrictEqual(
      tool.names([tab]),
      new Map([['7', { name: 'plan.canvas' }]]),
    );
    assert.strictEqual(tool.folderOf(tab), '/boards');
  });
});
