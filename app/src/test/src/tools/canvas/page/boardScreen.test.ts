import * as assert from 'node:assert';
import { beforeAll, suite, test } from 'vitest';
import {
  boundsOf,
  colorKind,
  screenOf,
} from '../../../../../tools/canvas/page/boardScreen';
import { screenRows } from '../../../../../tools/canvas/page/seenScreen';
import { boardOf } from '../../../../../tools/canvas/main/reading';
import { boxOf } from '../../../../../tools/canvas/page/grid';
import {
  obsidianCanvasesLoaded,
  type ObsidianCanvases,
} from '../../../../helpers/playgroundCanvases';
import type {
  Board,
  BoardEdge,
  BoardNode,
} from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

const text = (
  id: string,
  column: number,
  row: number,
  columns: number,
  rows: number,
  words: string,
  more: { readonly color?: string } = {},
): BoardNode => ({
  id,
  type: 'text',
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: rows * unit.height,
  text: words,
  ...more,
});

const placedAt = (column: number, row: number, columns: number) => ({
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: 3 * unit.height,
});

const labelled = (label: string): BoardNode => ({
  id: 'g',
  type: 'group',
  ...placedAt(0, 0, 10),
  label,
});

const labelTypedAt = (head: number) =>
  screenRows(
    screenOf({
      board: { nodes: [labelled('Long plan')], edges: [] },
      unit,
      view: { column: 0, row: 0, columns: 12, rows: 3 },
      widths: { char: 1, of: narrow },
      typing: { id: 'g', text: 'Long plan', anchor: head, head },
    }),
  )[0];

const narrow = (cluster: string) => (/[　-鿿]/.test(cluster) ? 2 : 1);

function screenText(
  board: Partial<Board>,
  view = { column: 0, row: 0, columns: 24, rows: 8 },
  selected: readonly string[] = [],
): string[] {
  return screenRows(
    screenOf({
      board: { nodes: [], edges: [], ...board },
      unit,
      view,
      widths: { char: 1, of: narrow },
      selected: new Set(selected),
    }),
  );
}

const segmentKinds = (screen: ReturnType<typeof screenOf>) => {
  const [block] = screen.texts;
  return block?.rows.map((row) => block.segmentsOf?.(row.row));
};

const edge = (more: Partial<BoardEdge> = {}): BoardEdge => ({
  id: 'e',
  fromNode: 'idea',
  toNode: 'plan',
  ...more,
});

const typedOnEdge = (words: string) =>
  screenRows(
    screenOf({
      board: {
        nodes: [text('a', 0, 0, 8, 3, ''), text('b', 24, 0, 8, 3, '')],
        edges: [
          edge({
            fromNode: 'a',
            fromSide: 'right',
            toNode: 'b',
            toSide: 'left',
          }),
        ],
      },
      unit,
      view: { column: 0, row: 0, columns: 34, rows: 3 },
      widths: { char: 1, of: narrow },
      typing: {
        id: 'e',
        text: words,
        anchor: words.length,
        head: words.length,
      },
    }),
  )[1];

suite('Canvas screen', () => {
  let corpus: ObsidianCanvases;

  beforeAll(async () => {
    corpus = await obsidianCanvasesLoaded();
  });

  test('draws nodes as boxes of box-drawing characters with their text inside, and an edge from a side of one as a line that leaves it from a joint, turns once and points at the top of the other, as the sketch of the canvas has it', () => {
    assert.deepStrictEqual(
      screenText({
        nodes: [
          text('idea', 0, 0, 10, 3, 'Idea'),
          text('plan', 10, 4, 10, 3, 'Plan'),
        ],
        edges: [edge({ fromSide: 'right', toSide: 'top' })],
      }),
      [
        '┌────────┐',
        '│ Idea   ├────┐',
        '└────────┘    │',
        '              ▼',
        '          ┌────────┐',
        '          │ Plan   │',
        '          └────────┘',
        '',
      ],
    );
  });

  test('draws the selected node in double lines, a joint of a line meeting them in double lines too', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            text('idea', 0, 0, 8, 3, 'Idea'),
            text('plan', 14, 0, 8, 3, 'Plan'),
          ],
          edges: [edge({ fromSide: 'right', toSide: 'left', toEnd: 'none' })],
        },
        { column: 0, row: 0, columns: 24, rows: 3 },
        ['idea'],
      ),
      [
        '╔══════╗      ┌──────┐',
        '║ Ide⏎ ╠──────┤ Pla⏎ │',
        '╚══════╝      └──────┘',
      ],
    );
  });

  test('draws the selected edge in double lines, and tells which edge each of its cells draws, its label too, for a click to select it', () => {
    const board: Board = {
      nodes: [
        text('idea', 0, 0, 8, 3, 'Idea'),
        text('plan', 14, 0, 8, 3, 'Plan'),
      ],
      edges: [
        edge({ fromSide: 'right', toSide: 'left', toEnd: 'none', label: 'x' }),
      ],
    };
    const view = { column: 0, row: 0, columns: 24, rows: 3 };
    assert.deepStrictEqual(screenText(board, view, ['e']), [
      '┌──────┐      ┌──────┐',
      '│ Ide⏎ ╠══ x ═╣ Pla⏎ │',
      '└──────┘      └──────┘',
    ]);
    const screen = screenOf({
      board,
      unit,
      view,
      widths: { char: 1, of: narrow },
    });
    assert.deepStrictEqual(
      Array.from(
        { length: 24 },
        (_, column) => screen.edges[24 + column] ?? '.',
      ).join(''),
      '........eeeeee..........',
    );
  });

  test('draws the marks of the sides of a node where it is asked to, over a line but under the arrow of an edge arriving there', () => {
    assert.deepStrictEqual(
      screenOf({
        board: { nodes: [text('idea', 0, 0, 8, 3, 'Idea')], edges: [] },
        unit,
        view: { column: 0, row: 0, columns: 10, rows: 3 },
        widths: { char: 1, of: narrow },
        marks: [{ column: 8, row: 1 }],
      }).glyphs[18],
      '●',
    );

    const arriving = screenOf({
      board: {
        nodes: [
          text('idea', 0, 0, 8, 3, 'Idea'),
          text('plan', 14, 0, 8, 3, 'Plan'),
        ],
        edges: [edge({ fromSide: 'right', toSide: 'left' })],
      },
      unit,
      view: { column: 0, row: 0, columns: 24, rows: 3 },
      widths: { char: 1, of: narrow },
      marks: [
        { column: 8, row: 1 },
        { column: 13, row: 1 },
      ],
    });
    assert.deepStrictEqual(
      [arriving.glyphs[24 + 8], arriving.arrows[24 + 13]],
      ['●', 'right'],
    );
  });

  test('draws an arrow at either end an edge asks for one, and a joint at an end without', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            text('idea', 0, 0, 6, 3, 'A'),
            text('plan', 12, 0, 6, 3, 'B'),
          ],
          edges: [
            edge({ fromSide: 'right', toSide: 'left', fromEnd: 'arrow' }),
          ],
        },
        { column: 0, row: 0, columns: 20, rows: 3 },
      ),
      ['┌────┐      ┌────┐', '│ A  │◀────▶│ B  │', '└────┘      └────┘'],
    );
  });

  test('keeps the arrowhead of an edge where another edge leaves the same side after it, the other joining the side beside it, rather than drawing its line over the arrowhead', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            text('idea', 0, 0, 6, 3, 'A'),
            text('plan', 12, 0, 6, 3, 'B'),
          ],
          edges: [
            edge({
              id: 'first',
              fromSide: 'right',
              toSide: 'left',
              fromEnd: 'arrow',
              toEnd: 'none',
            }),
            edge({
              id: 'second',
              fromSide: 'right',
              toSide: 'left',
              toEnd: 'none',
            }),
          ],
        },
        { column: 0, row: 0, columns: 20, rows: 3 },
      )[1],
      '│ A  ├◀─────┤ B  │',
    );
  });

  test('colors the lines of a color of its own by that color, as the six of JSON Canvas', () => {
    const shown = screenOf({
      board: {
        nodes: [text('a', 0, 0, 4, 3, '', { color: '#FF7800' })],
        edges: [],
      },
      unit,
      view: { column: 0, row: 0, columns: 4, rows: 3 },
      widths: { char: 1, of: narrow },
    });
    assert.strictEqual(shown.lineKinds[0], '#ff7800');
  });

  test('signs the kind of a node that points elsewhere in its top border, where a group has its label, ≡ a file and ∞ a link, of characters every monospace font of the settings has, none for a text, which holds what it shows, a group, whose label goes there, or a node too narrow for one', () => {
    const rows = screenText({
      nodes: [
        text('note', 0, 0, 6, 3, ''),
        { id: 'file', type: 'file', file: 'a.md', ...placedAt(7, 0, 6) },
        { id: 'link', type: 'link', url: 'https://a.b', ...placedAt(14, 0, 6) },
        { id: 'group', type: 'group', ...placedAt(0, 4, 6) },
        text('narrow', 8, 4, 2, 3, ''),
      ],
    });
    assert.deepStrictEqual(
      [rows[0], rows[4]],
      ['┌────┐ ┌─ ≡ ┐ ┌─ ∞ ┐', '┌────┐  ┌┐'],
    );
  });

  test('writes the label of a group in its top border, keeps what lies inside it, and draws a node over a group listed before it', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            {
              id: 'g',
              type: 'group',
              x: 0,
              y: 0,
              width: 140,
              height: 108,
              label: 'Plan',
            },
            text('in', 2, 1, 8, 3, 'Idea'),
          ],
        },
        { column: 0, row: 0, columns: 22, rows: 6 },
      ),
      [
        '┌─ Plan ───────────┐',
        '│ ┌──────┐         │',
        '│ │ Ide⏎ │         │',
        '│ └──────┘         │',
        '│                  │',
        '└──────────────────┘',
      ],
    );
  });

  test('ends the label of a group cut by its border with an ellipsis, as the app ends any text cut short', () => {
    assert.deepStrictEqual(
      [labelled('Plan'), labelled('Long plan')].map(
        (node) => screenText({ nodes: [node] })[0],
      ),
      ['┌─ Plan ─┐', '┌─ Lon… ─┐'],
    );
  });

  test('scrolls the label typed into a group sideways to keep the cursor in its border, as a text box does, and shows it whole there while typed', () => {
    assert.deepStrictEqual(
      [labelTypedAt(0), labelTypedAt(3), labelTypedAt(6), labelTypedAt(9)],
      ['┌─ Long ─┐', '┌─ Long ─┐', '┌─ g pl ─┐', '┌─ plan ─┐'],
    );
  });

  test('draws a part of a large board as that part of the whole board drawn at once, nodes and edges crossing its edge too, while it lays out none of the nodes far from it', () => {
    const nodes: BoardNode[] = [];
    const edges: BoardEdge[] = [];
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const id = `n${column}-${row}`;
        nodes.push(text(id, column * 14, row * 6, 10, 4, `Node ${id}`));
        if (column > 0) {
          edges.push({
            id: `a${id}`,
            fromNode: `n${column - 1}-${row}`,
            toNode: id,
            ...(row === 3 && { label: 'a label longer than its edge' }),
          });
        }
        if (row > 0) {
          edges.push({
            id: `d${id}`,
            fromNode: `n${column}-${row - 1}`,
            toNode: id,
          });
        }
      }
    }
    nodes.push(text('wide', 30, 50, 80, 4, 'A node wider than the view'));
    const laidOut = new Set<string>();
    const shown = (view: {
      column: number;
      row: number;
      columns: number;
      rows: number;
    }) =>
      screenRows(
        screenOf({
          board: { nodes, edges },
          unit,
          view,
          widths: { char: 1, of: narrow },
          colorsOf: (id) => {
            laidOut.add(id);
            return undefined;
          },
        }),
      );
    const whole = shown({ column: 0, row: 0, columns: 120, rows: 56 });
    const part = { column: 37, row: 15, columns: 30, rows: 40 };
    laidOut.clear();
    assert.deepStrictEqual(
      shown(part),
      whole.slice(part.row, part.row + part.rows).map((row) =>
        Array.from(row.padEnd(part.column + part.columns))
          .slice(part.column, part.column + part.columns)
          .join('')
          .trimEnd(),
      ),
    );
    assert.ok(
      !laidOut.has('n0-0') && !laidOut.has('n7-0'),
      [...laidOut].join(),
    );
    assert.ok(laidOut.has('n3-3') && laidOut.has('wide'));
  });

  test('wraps the text of a node at its words within its border as every view wraps a text, leaving a column for the blank hanging at the end of a row and one for the mark of its break, wide characters two cells, a character that shows nothing as ¤, a tab to its stop, and cuts what its node has no room for', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            text('a', 0, 0, 12, 5, 'one two three four five six\n日本語​x'),
          ],
        },
        { column: 0, row: 0, columns: 14, rows: 5 },
      ),
      [
        '┌──────────┐',
        '│ one two ⏎│',
        '│ three ⏎  │',
        '│ four ⏎   │',
        '└──────────┘',
      ],
    );
    assert.deepStrictEqual(
      screenText(
        { nodes: [text('a', 0, 0, 12, 4, '日本語​x\tend')] },
        { column: 0, row: 0, columns: 14, rows: 4 },
      ),
      ['┌──────────┐', '│ 日本語 ⏎  │', '│ ¤x  end  │', '└──────────┘'],
    );
  });

  test('draws a link node as the title of its page over its URL once the title is known, and as its URL alone before, the URL in the color of a link', () => {
    const link: BoardNode = {
      id: 'l',
      type: 'link',
      url: 'https://example.com/a',
      x: 0,
      y: 0,
      width: 26 * unit.width,
      height: 4 * unit.height,
    };
    const drawn = (titles?: ReadonlyMap<string, string>) =>
      screenOf({
        board: { nodes: [link], edges: [] },
        unit,
        view: { column: 0, row: 0, columns: 28, rows: 4 },
        widths: { char: 1, of: narrow },
        titles,
      });
    const untitled = drawn();
    assert.deepStrictEqual(screenRows(untitled).slice(1, 3), [
      '│ https://example.com/a  │',
      '│                        │',
    ]);
    assert.deepStrictEqual(segmentKinds(untitled), [
      [{ text: 'https://example.com/a', kind: 'link' }],
    ]);
    const titled = drawn(new Map([[link.url, 'Example A']]));
    assert.deepStrictEqual(screenRows(titled).slice(1, 3), [
      '│ Example A              │',
      '│ https://example.com/a  │',
    ]);
    assert.deepStrictEqual(segmentKinds(titled), [
      undefined,
      [{ text: 'https://example.com/a', kind: 'link' }],
    ]);
  });

  test('draws a file node as its path in the color of a link over the head of its text, colored as the language of its name, and as its path alone while its text is not known', () => {
    const file: BoardNode = {
      id: 'f',
      type: 'file',
      file: 'code/a.ts',
      x: 0,
      y: 0,
      width: 26 * unit.width,
      height: 5 * unit.height,
    };
    const asked: string[] = [];
    const drawn = (files?: Record<string, { path: string; text?: string }>) =>
      screenOf({
        board: { nodes: [file], edges: [] },
        unit,
        view: { column: 0, row: 0, columns: 28, rows: 5 },
        widths: { char: 1, of: narrow },
        files,
        colorsOf: (id, words, language) => {
          asked.push(`${id} ${language} ${words}`);
          return [[{ start: 0, end: 5, kind: 'keyword' }], []];
        },
      });
    const unread = drawn();
    assert.deepStrictEqual(screenRows(unread).slice(1, 3), [
      '│ code/a.ts              │',
      '│                        │',
    ]);
    assert.deepStrictEqual(segmentKinds(unread), [
      [{ text: 'code/a.ts', kind: 'link' }],
    ]);
    const read = drawn({
      'code/a.ts': { path: '/vault/code/a.ts', text: 'const a = 1;\nnext' },
    });
    assert.deepStrictEqual(screenRows(read).slice(1, 4), [
      '│ code/a.ts              │',
      '│ const a = 1;           │',
      '│ next                   │',
    ]);
    assert.deepStrictEqual(segmentKinds(read), [
      [{ text: 'code/a.ts', kind: 'link' }],
      [{ text: 'const', kind: 'keyword' }, { text: ' a = 1;' }],
      [{ text: 'next' }],
    ]);
    assert.deepStrictEqual(asked, ['f typescript const a = 1;\nnext']);
  });

  test('draws the label typed on an edge as it is typed, the edge of no label too', () => {
    assert.ok(typedOnEdge('new')?.includes('─ new ─'), typedOnEdge('new'));
    assert.ok(typedOnEdge('')?.includes('────'), typedOnEdge(''));
  });

  test('draws a node smaller than its borders as a line or a small square, so none is lost', () => {
    assert.deepStrictEqual(
      screenText(
        {
          nodes: [
            text('one', 0, 0, 1, 1, 'x'),
            text('wide', 2, 0, 4, 1, 'x'),
            text('tall', 7, 0, 1, 3, 'x'),
          ],
        },
        { column: 0, row: 0, columns: 9, rows: 3 },
      ),
      ['□ ╶──╴ ╷', '       │', '       ╵'],
    );
  });

  test('draws only what the view of the screen holds, from where it starts', () => {
    assert.deepStrictEqual(
      screenText(
        { nodes: [text('idea', 0, 0, 10, 3, 'Idea')] },
        { column: 5, row: 1, columns: 6, rows: 2 },
      ),
      ['a   │', '────┘'],
    );
  });

  test('colors the lines of a node or an edge by the six colors of JSON Canvas or a color of its own, and none for a color it does not know', () => {
    assert.deepStrictEqual(
      ['1', '6', '#FF7800', '#abc', 'teal', '7', undefined].map(colorKind),
      [
        'color-1',
        'color-6',
        '#ff7800',
        '#abc',
        undefined,
        undefined,
        undefined,
      ],
    );
    const shown = screenOf({
      board: { nodes: [text('a', 0, 0, 4, 3, '', { color: '3' })], edges: [] },
      unit,
      view: { column: 0, row: 0, columns: 4, rows: 3 },
      widths: { char: 1, of: narrow },
    });
    assert.strictEqual(shown.lineKinds[0], 'color-3');
  });

  test('draws every node of a canvas as Obsidian writes it where its box starts, its sides from its corner, whatever its place', () => {
    for (const [name, written] of Object.entries(corpus.obsidianCanvases)) {
      const read = boardOf(written);
      assert.ok(read.kind === 'board', name);
      for (const node of read.board.nodes) {
        const box = boxOf(node, unit);
        const shown = screenOf({
          board: read.board,
          unit,
          view: {
            ...box,
            columns: Math.min(box.columns, 40),
            rows: Math.min(box.rows, 20),
          },
          widths: { char: 1, of: narrow },
        });
        assert.ok(
          (shown.lines[0] ?? 0) !== 0 || shown.glyphs[0] === '□',
          `${name} ${node.id}`,
        );
      }
    }
  });

  test('draws an edge without ends with none at its start and an arrow at its end, as JSON Canvas defaults them', () => {
    const read = boardOf(corpus.obsidianCanvases['sample-like'] ?? '');
    assert.ok(read.kind === 'board');
    const shown = screenOf({
      board: read.board,
      unit,
      view: { column: -45, row: -26, columns: 90, rows: 12 },
      widths: { char: 1, of: narrow },
    });
    assert.deepStrictEqual(
      shown.arrows.filter((way) => way !== undefined),
      ['right'],
    );
  });

  test('bounds the nodes of a canvas in cells, and nothing for an empty one', () => {
    assert.deepStrictEqual(
      boundsOf(
        {
          nodes: [text('a', -2, -1, 4, 3, ''), text('b', 10, 5, 4, 3, '')],
          edges: [],
        },
        unit,
      ),
      { column: -2, row: -1, columns: 16, rows: 9 },
    );
    assert.strictEqual(boundsOf({ nodes: [], edges: [] }, unit), undefined);
  });
});
