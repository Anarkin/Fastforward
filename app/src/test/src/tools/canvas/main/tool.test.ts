import * as assert from 'node:assert';
import * as path from 'node:path';
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

const link = (id: string, url: string) => ({
  id,
  type: 'link',
  url,
  x: 0,
  y: 0,
  width: 70,
  height: 36,
});

interface Gates {
  saving?: Promise<void> | undefined;
  reading?: Promise<void> | undefined;
  saves: number;
  refused?: boolean;
}

function gate(): { readonly closed: Promise<void>; readonly open: () => void } {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return { closed: promise, open: () => resolve(undefined) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function canvas(
  files: Record<string, string>,
  sizes: Record<string, number> = {},
  readOnly: readonly string[] = [],
  gates: Gates = { saves: 0 },
) {
  const saved: [string, string][] = [];
  const watched = new Map<string, () => void>();
  let made = 0;
  const titled: string[] = [];
  const tool = new CanvasTool({
    files: {
      realPath: (name) => Promise.resolve(name),
      isFolder: () => Promise.resolve(false),
      readHead: (name, bytes) => {
        const text = files[name];
        return text === undefined
          ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }))
          : Promise.resolve(Buffer.from(text).subarray(0, bytes));
      },
      codePage: () => Promise.resolve('utf-8'),
    },
    titleOf: (url) => {
      titled.push(url);
      return Promise.resolve(
        url.includes('nameless') ? undefined : `Title of ${url}`,
      );
    },
    watch: (name, onChange) => {
      watched.set(name, onChange);
      return () => watched.delete(name);
    },
    saveFile: async (name, bytes) => {
      gates.saves++;
      await gates.saving;
      if (readOnly.includes(name)) {
        throw new ReadOnly(name);
      }
      const text = new TextDecoder().decode(bytes);
      saved.push([name, text]);
      files[name] = text;
    },
    readOnly: (error) => error instanceof ReadOnly,
    newId: () => (++made === 1 ? 'made' : `made${made}`),
    sizeOf: (name) =>
      name in files
        ? Promise.resolve(sizes[name] ?? files[name]?.length ?? 0)
        : Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })),
    readFile: async (name) => {
      await gates.reading;
      const text = files[name];
      if (text === undefined) {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      }
      return Buffer.from(text);
    },
  });
  const page = new CanvasPage();
  const shell = fakeShell(page);
  tool.attach({
    ...shell.shell,
    holds: (shownIn, held) =>
      gates.refused !== true && shell.shell.holds(shownIn, held),
  });
  const changed = async (name: string) => {
    watched.get(name)?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { tool, page, saved, watched, changed, titled, ...shell };
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

  test('says why it draws no canvas of a file too large, of no JSON or of JSON without a canvas', async () => {
    const large = '/boards/large.canvas';
    const text = '/boards/text.canvas';
    const list = '/boards/list.canvas';
    const { tool, page } = canvas(
      { [large]: '{}', [text]: 'nodes', [list]: '[]' },
      { [large]: maxBoardBytes + 1 },
    );
    const errors = [];
    for (const shown of [large, text, list]) {
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

  test('draws an empty canvas for a file not there yet, writing it on its first save though nothing was added to it, as the editor makes a new file', async () => {
    const made = '/boards/new.canvas';
    const files: Record<string, string> = {};
    const { tool, page, saved } = canvas(files);
    await tool.show(page, { id: '9', tool: 'canvas', root: made });
    assert.deepStrictEqual(board(page).board, { nodes: [], edges: [] });
    assert.strictEqual(board(page).error, undefined);
    await tool.receive(page, { type: 'save', tab: '9' });
    await tool.receive(page, { type: 'save', tab: '9' });
    assert.deepStrictEqual(saved, [[made, '{}']]);
  });

  test('places the files dropped on a canvas as file nodes from where they fell, one below the other, by their paths from the folder of its vault, as one change, and leaves out a file outside that folder, saying so', async () => {
    const note = path.resolve('/boards/notes/a.md');
    const other = path.resolve('/boards/b.txt');
    const outside = path.resolve('/elsewhere/c.txt');
    const files = { [file]: '{}', [note]: 'A', [other]: 'B' };
    const { tool, page, notices } = canvas(files);
    await tool.show(page, tab);
    const box = { x: 14, y: 36, width: 210, height: 144 };
    await tool.dropped(page, [note, other, outside], { tab: '7', box });
    const shown = page.messages.filter((each) => each.type === 'board').at(-1);
    assert.deepStrictEqual(shown?.type === 'board' && shown.board?.nodes, [
      { id: 'made', type: 'file', file: 'notes/a.md', ...box },
      { id: 'made2', type: 'file', file: 'b.txt', ...box, y: 180 },
    ]);
    assert.deepStrictEqual(shown?.type === 'board' && shown.made, 'made');
    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        message: strings.canvas.outsideVault([outside], path.dirname(file)),
      },
    ]);
    await tool.receive(page, { type: 'undo', tab: '7' });
    const undone = page.messages.filter((each) => each.type === 'board').at(-1);
    assert.deepStrictEqual(undone?.type === 'board' && undone.board?.nodes, []);
  });

  test('takes a drop on a canvas only with paths, a tab it holds and a box whole and in bounds, as the page is not trusted', async () => {
    const note = path.resolve('/boards/a.md');
    const gates: Gates = { saves: 0 };
    const { tool, page } = canvas({ [file]: '{}', [note]: 'A' }, {}, [], gates);
    await tool.show(page, tab);
    const before = page.messages.length;
    const box = { x: 0, y: 0, width: 70, height: 36 };
    for (const [files, message] of [
      [[note], { tab: '7', box: { ...box, width: 'wide' } }],
      [[note], { tab: '8', box }],
      [[7], { tab: '7', box }],
      ['a.md', { tab: '7', box }],
      [[note], undefined],
    ] as const) {
      await tool.dropped(page, files, message);
    }
    gates.refused = true;
    await tool.dropped(page, [note], { tab: '7', box });
    assert.strictEqual(page.messages.length, before);
    assert.strictEqual(tool.unsaved(tab), false);
  });

  test('tells the page where the file of each file node is and the head of its text, read again each time its tab shows', async () => {
    const note = path.resolve('/boards/note.md');
    const files = {
      [file]: JSON.stringify({
        nodes: [
          {
            id: 'n',
            type: 'file',
            file: 'note.md',
            x: 0,
            y: 0,
            width: 70,
            height: 36,
          },
        ],
      }),
      [note]: 'Hello\n',
    };
    const { tool, page } = canvas(files);
    const told = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return page.messages.filter((each) => each.type === 'files').at(-1);
    };
    await tool.show(page, tab);
    assert.deepStrictEqual(await told(), {
      type: 'files',
      tab: '7',
      files: { 'note.md': { path: note, text: 'Hello\n' } },
    });
    files[note] = 'Changed\n';
    await tool.show(page, tab);
    assert.deepStrictEqual(await told(), {
      type: 'files',
      tab: '7',
      files: { 'note.md': { path: note, text: 'Changed\n' } },
    });
  });

  test('tells the page the title of the page of a link node placed', async () => {
    const { tool, page, titled } = canvas({ [file]: '{}' });
    await tool.show(page, tab);
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: {
        kind: 'link',
        url: 'https://example.com/placed',
        box: { x: 0, y: 0, width: 70, height: 36 },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(titled, ['https://example.com/placed']);
    assert.deepStrictEqual(
      page.messages.filter((each) => each.type === 'titles').at(-1),
      {
        type: 'titles',
        titles: {
          'https://example.com/placed': 'Title of https://example.com/placed',
        },
      },
    );
  });

  test('tells the page the title of the page each link node points to, read once a page while the app runs, and only from the web', async () => {
    const { tool, page, titled } = canvas({
      [file]: JSON.stringify({
        nodes: [
          link('a', 'https://example.com/a'),
          link('b', 'https://example.com/a'),
          link('c', 'https://example.com/nameless'),
          link('d', 'file:///etc/passwd'),
          link('e', 'http://example.com/plain'),
        ],
      }),
    });
    await tool.show(page, tab);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tool.show(page, tab);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(titled, [
      'https://example.com/a',
      'https://example.com/nameless',
    ]);
    assert.deepStrictEqual(
      page.messages.filter((each) => each.type === 'titles'),
      [
        {
          type: 'titles',
          titles: { 'https://example.com/a': 'Title of https://example.com/a' },
        },
        {
          type: 'titles',
          titles: { 'https://example.com/a': 'Title of https://example.com/a' },
        },
      ],
    );
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

  test('keeps an edit made while the canvas is saved unsaved, writing what it held once the save began, never taking its own save for a change from outside, and saving a tab one save at a time', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const gates: Gates = { saves: 0 };
    const { tool, page, saved, changed, notices } = canvas(
      files,
      {},
      [],
      gates,
    );
    await tool.show(page, tab);
    const placed = (y: number) =>
      tool.receive(page, {
        type: 'edit',
        tab: '7',
        edit: { kind: 'place', boxes: [{ ...node, y }] },
      });
    const written = (y: number) => JSON.stringify({ nodes: [{ ...node, y }] });
    await placed(18);
    const first = gate();
    gates.saving = first.closed;
    const saving = tool.receive(page, { type: 'save', tab: '7' });
    await tick();
    await placed(36);
    first.open();
    await saving;
    assert.deepStrictEqual(saved, [[file, written(18)]]);
    assert.strictEqual(tool.unsaved(tab), true);
    assert.strictEqual(board(page).changed, true);
    await changed(file);
    assert.deepStrictEqual(board(page).board?.nodes, [{ ...node, y: 36 }]);
    assert.deepStrictEqual(notices, []);

    const second = gate();
    gates.saving = second.closed;
    gates.saves = 0;
    const both = [
      tool.receive(page, { type: 'save', tab: '7' }),
      tool.saveUnsaved(page, tab),
    ];
    await tick();
    assert.strictEqual(gates.saves, 1);
    second.open();
    await Promise.all(both);
    assert.deepStrictEqual(saved, [
      [file, written(18)],
      [file, written(36)],
    ]);
    assert.strictEqual(tool.unsaved(tab), false);
  });

  test('keeps an edit made to a canvas while its file is read again as its tab shows again, rather than the board read over it', async () => {
    const files = { [file]: JSON.stringify({ nodes: [node] }) };
    const gates: Gates = { saves: 0 };
    const { tool, page } = canvas(files, {}, [], gates);
    await tool.show(page, tab);
    const reading = gate();
    gates.reading = reading.closed;
    const showing = tool.show(page, tab);
    await tick();
    await tool.receive(page, {
      type: 'edit',
      tab: '7',
      edit: { kind: 'place', boxes: [{ ...node, y: 18 }] },
    });
    reading.open();
    await showing;
    assert.deepStrictEqual(board(page).board?.nodes, [{ ...node, y: 18 }]);
    assert.strictEqual(tool.unsaved(tab), true);
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
