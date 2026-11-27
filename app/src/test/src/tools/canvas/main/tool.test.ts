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

class ReadOnly extends Error {}

function canvas(
  files: Record<string, string>,
  sizes: Record<string, number> = {},
  readOnly: readonly string[] = [],
) {
  const saved: [string, string][] = [];
  const watched = new Map<string, () => void>();
  const tool = new CanvasTool({
    watch: (name, onChange) => {
      watched.set(name, onChange);
      return () => watched.delete(name);
    },
    saveFile: (name, bytes) => {
      if (readOnly.includes(name)) {
        return Promise.reject(new ReadOnly(name));
      }
      const text = new TextDecoder().decode(bytes);
      saved.push([name, text]);
      files[name] = text;
      return Promise.resolve();
    },
    readOnly: (error) => error instanceof ReadOnly,
    newId: () => 'made',
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
  const changed = async (name: string) => {
    watched.get(name)?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { tool, page, saved, watched, changed, ...shell };
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

const board = (page: CanvasPage) => {
  const last = page.messages.findLast((each) => each.type === 'board');
  assert.ok(last?.type === 'board');
  return last;
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

  test('applies the edits the page sends to the canvas it holds, marking the tab unsaved, and takes back and does again each by undo and redo', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }, null, '	') };
    const { tool, page, tabsPosted } = canvas(files);
    await tool.show(page, tab);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, x: 14 }] },
    });
    assert.deepStrictEqual(
      [board(page).board?.nodes[0]?.x, board(page).changed],
      [14, true],
    );
    assert.deepStrictEqual(tool.names([tab]).get('7'), {
      name: 'plan.canvas',
      unsaved: true,
    });
    assert.strictEqual(tabsPosted.length, 1);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: {
        kind: 'add',
        node: { type: 'text', x: 0, y: 72, width: 70, height: 54 },
      },
    });
    assert.strictEqual(board(page).made, 'made');
    await tool.receive(page, { type: 'undo', tab: '7' });
    await tool.receive(page, { type: 'undo', tab: '7' });
    assert.deepStrictEqual(
      [board(page).board?.nodes.map((each) => each.x), board(page).changed],
      [[0], undefined],
    );
    assert.strictEqual(tool.unsaved(tab), false);
    await tool.receive(page, { type: 'redo', tab: '7' });
    assert.strictEqual(board(page).board?.nodes[0]?.x, 14);
  });

  test('keeps the edits not saved while its tab is away, reading the file anew only once nothing is unsaved', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page } = canvas(files);
    await tool.show(page, tab);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, x: 14 }] },
    });
    files[file] = JSON.stringify({ nodes: [{ ...node, x: 700 }] });
    await tool.show(page, tab);
    assert.strictEqual(board(page).board?.nodes[0]?.x, 14);
    await tool.receive(page, { type: 'undo', tab: '7' });
    await tool.show(page, tab);
    assert.strictEqual(board(page).board?.nodes[0]?.x, 700);
  });

  test('reads its file anew once it changes while its tab shows and nothing of it is unsaved, as the editor follows its file, and takes no change for its own save', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page, changed } = canvas(files);
    await tool.show(page, tab);
    files[file] = JSON.stringify({ nodes: [{ ...node, x: 700 }] });
    await changed(file);
    assert.strictEqual(board(page).board?.nodes[0]?.x, 700);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, x: 14 }] },
    });
    await tool.receive(page, { type: 'save', tab: '7' });
    const boards = page.messages.filter((each) => each.type === 'board').length;
    await changed(file);
    assert.strictEqual(
      page.messages.filter((each) => each.type === 'board').length,
      boards,
    );
  });

  test('keeps its edits not saved once its file changes while its tab shows, saying that saving writes over the change', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page, changed, notices } = canvas(files);
    await tool.show(page, tab);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, x: 14 }] },
    });
    files[file] = JSON.stringify({ nodes: [{ ...node, x: 700 }] });
    await changed(file);
    assert.strictEqual(board(page).board?.nodes[0]?.x, 14);
    assert.deepStrictEqual(
      notices.map(({ message }) => message),
      [strings.editor.changedOutside(file)],
    );
  });

  test('watches its file only while its tab shows', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page, watched } = canvas(files);
    await tool.show(page, tab);
    assert.deepStrictEqual([...watched.keys()], [file]);
    tool.hide(page);
    assert.deepStrictEqual([...watched.keys()], []);
    await tool.show(page, tab);
    tool.closed(page, tab);
    assert.deepStrictEqual([...watched.keys()], []);
  });

  test('saves the canvas in the layout of its file, the tab no longer unsaved, and a save asked for with nothing to save writes nothing', async () => {
    const written = JSON.stringify({ nodes: [node], edges: [] }, null, 2);
    const files = { [file]: written };
    const { tool, page, saved } = canvas(files);
    await tool.show(page, tab);
    await tool.receive(page, { type: 'save', tab: '7' });
    assert.deepStrictEqual(saved, []);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, y: 18 }] },
    });
    assert.strictEqual(await tool.saveUnsaved(page, tab), true);
    assert.deepStrictEqual(saved, [
      [
        file,
        JSON.stringify({ nodes: [{ ...node, y: 18 }], edges: [] }, null, 2),
      ],
    ]);
    assert.strictEqual(tool.unsaved(tab), false);
    assert.strictEqual(board(page).changed, undefined);
  });

  test('says why it saves no canvas that is read-only, keeping its edits unsaved', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page, notices } = canvas(files, {}, [file]);
    await tool.show(page, tab);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'delete', nodes: ['a'], edges: [] },
    });
    assert.strictEqual(await tool.saveUnsaved(page, tab), false);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.canvas.readOnly(file) },
    ]);
    assert.strictEqual(tool.unsaved(tab), true);
  });

  test('takes no edit that is not whole, as the page is not trusted', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const { tool, page } = canvas(files);
    await tool.show(page, tab);
    const before = page.messages.length;
    await tool.receive(
      page,
      JSON.parse(
        '{"type":"edit","tab":"7","edit":{"kind":"place","boxes":[{"id":"a","x":"1","y":0,"width":70,"height":36}]}}',
      ),
    );
    await tool.receive(page, JSON.parse('{"type":"edit","tab":9,"edit":{}}'));
    assert.strictEqual(page.messages.length, before);
    assert.strictEqual(tool.unsaved(tab), false);
  });
});
