import type { PlanBuilder } from './filesPlan.mts';
import { mib } from './sizedContents.mts';

export const defaultCell = { width: 7, height: 18 } as const;

type Json = Readonly<Record<string, unknown>>;

interface Cells {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
}

const cells = (column: number, row: number, columns: number, rows: number) => ({
  column,
  row,
  columns,
  rows,
});

const placed = ({ column, row, columns, rows }: Cells) => ({
  x: column * defaultCell.width,
  y: row * defaultCell.height,
  width: columns * defaultCell.width,
  height: rows * defaultCell.height,
});

const text = (id: string, at: Cells, words: string, more: Json = {}) => ({
  id,
  type: 'text',
  ...placed(at),
  text: words,
  ...more,
});

const group = (id: string, at: Cells, more: Json = {}) => ({
  id,
  type: 'group',
  ...placed(at),
  ...more,
});

const fileNode = (id: string, at: Cells, file: string, more: Json = {}) => ({
  id,
  type: 'file',
  ...placed(at),
  file,
  ...more,
});

const link = (id: string, at: Cells, url: string, more: Json = {}) => ({
  id,
  type: 'link',
  ...placed(at),
  url,
  ...more,
});

const edge = (
  id: string,
  fromNode: string,
  toNode: string,
  more: Json = {},
) => ({
  id,
  fromNode,
  toNode,
  ...more,
});

const written = (board: Json) => JSON.stringify(board, null, '\t');

const sides = (fromSide: string, toSide: string) => ({ fromSide, toSide });

function hexIds(count: number): string[] {
  let state = 20260201;
  return Array.from({ length: count }, () => {
    let id = '';
    for (let digit = 0; digit < 16; digit++) {
      state = (state * 1103515245 + 12345) % 2147483648;
      id += (Math.floor(state / 65536) % 16).toString(16);
    }
    return id;
  });
}

export const tourBoard = {
  nodes: [
    group('tour', cells(0, 0, 100, 22), { label: 'A tour of JSON Canvas' }),
    text(
      'welcome',
      cells(3, 2, 30, 7),
      '# Welcome\n\nThis canvas holds every kind of node JSON Canvas has: text, files, links and groups.',
    ),
    text(
      'markdown',
      cells(3, 12, 30, 8),
      '**Markdown** is shown as typed:\n\n- a list\n- `code`\n> a quote',
    ),
    fileNode('idea', cells(38, 2, 26, 5), 'notes/idea.md'),
    fileNode('plan', cells(38, 12, 26, 5), 'notes/plan.md', {
      subpath: '#Steps',
    }),
    link('spec', cells(70, 2, 27, 5), 'https://jsoncanvas.org/spec/1.0/'),
    text('green', cells(70, 12, 27, 5), 'A node of color 4, green', {
      color: '4',
    }),
    text('outside', cells(0, 25, 40, 4), 'Below the group, outside it'),
  ],
  edges: [
    edge('reads', 'welcome', 'idea', {
      ...sides('right', 'left'),
      label: 'reads',
    }),
    edge('specified', 'idea', 'spec', sides('right', 'left')),
    edge('planned', 'markdown', 'plan', sides('right', 'left')),
    edge('both', 'plan', 'green', {
      ...sides('right', 'left'),
      fromEnd: 'arrow',
      toEnd: 'arrow',
      color: '2',
    }),
    edge('down', 'welcome', 'markdown', sides('bottom', 'top')),
    edge('leaves', 'markdown', 'outside', sides('bottom', 'top')),
  ],
};

const presetColors = ['red', 'orange', 'yellow', 'green', 'cyan', 'purple'];

const colorsBoard = {
  nodes: [
    ...presetColors.map((name, at) =>
      text(
        `preset-${at + 1}`,
        cells(at * 20, 0, 16, 4),
        `Color ${at + 1}, ${name}`,
        {
          color: String(at + 1),
        },
      ),
    ),
    ...['#ff7800', '#3a6fd8', '#888888', 'teal'].map((color, at) =>
      text(`hex-${at + 1}`, cells(at * 20, 8, 16, 4), `Color ${color}`, {
        color,
      }),
    ),
    text('plain', cells(80, 8, 16, 4), 'No color'),
  ],
  edges: presetColors.slice(1).map((_, at) =>
    edge(`colored-${at + 1}`, `preset-${at + 1}`, `preset-${at + 2}`, {
      ...sides('right', 'left'),
      color: String(at + 1),
    }),
  ),
};

const edgesBoard = {
  nodes: [
    text('hub', cells(40, 20, 20, 5), 'Hub'),
    text('north', cells(40, 4, 20, 5), 'North'),
    text('east', cells(75, 20, 20, 5), 'East'),
    text('south', cells(40, 36, 20, 5), 'South'),
    text('west', cells(5, 20, 20, 5), 'West'),
    text('northeast', cells(75, 4, 20, 5), 'Northeast, no sides'),
    text('behind', cells(5, 36, 20, 5), 'Behind, reached from its far side'),
    text('close', cells(62, 28, 12, 4), 'Close by'),
  ],
  edges: [
    edge('up', 'hub', 'north', sides('top', 'bottom')),
    edge('both-ends', 'hub', 'east', {
      ...sides('right', 'left'),
      fromEnd: 'arrow',
      toEnd: 'arrow',
    }),
    edge('no-ends', 'hub', 'south', {
      ...sides('bottom', 'top'),
      toEnd: 'none',
    }),
    edge('labeled', 'hub', 'west', {
      ...sides('left', 'right'),
      label: 'labeled',
    }),
    edge('no-sides', 'hub', 'northeast'),
    edge('to-itself', 'hub', 'hub', sides('right', 'top')),
    edge('around', 'west', 'east', sides('left', 'right')),
    edge('far-side', 'south', 'behind', sides('bottom', 'top')),
    edge('crossing', 'north', 'south', sides('left', 'left')),
    edge('long-label', 'east', 'close', {
      ...sides('bottom', 'right'),
      label: 'a label far longer than the way between the two nodes it joins',
    }),
    edge('beside', 'hub', 'close', sides('bottom', 'left')),
  ],
};

const groupsBoard = {
  nodes: [
    group('outer', cells(0, 0, 80, 30), { label: 'Outer group' }),
    group('inner', cells(4, 3, 40, 16), { label: 'Inner group' }),
    text('nested', cells(8, 7, 30, 6), 'A node in a group in a group'),
    group('unnamed', cells(50, 3, 25, 10)),
    group('empty', cells(50, 16, 25, 10), { label: 'Empty group' }),
    text('straddling', cells(70, 26, 20, 6), 'Half in the outer group'),
    text('under', cells(0, 34, 24, 6), 'Under, listed first'),
    text('over', cells(8, 36, 24, 6), 'Over, listed after it'),
    text('covered', cells(40, 34, 24, 6), 'Covered by a group listed after it'),
    group('late', cells(36, 32, 32, 10), {
      label: 'A group listed after the node it covers',
    }),
    group('long-label', cells(0, 44, 14, 6), {
      label: 'A label longer than its group is wide',
    }),
  ],
  edges: [
    edge('into-group', 'nested', 'empty', sides('right', 'left')),
    edge('between-groups', 'inner', 'unnamed', sides('right', 'left')),
  ],
};

const textBoard = {
  nodes: [
    text(
      'markdown',
      cells(0, 0, 34, 11),
      '# Heading\n## Smaller heading\n\n- a list\n  - nested\n1. numbered\n\n```js\nconst board = {};\n```',
    ),
    text(
      'long-line',
      cells(38, 0, 24, 6),
      'A single line of text far longer than its node is wide, which wraps at the border.',
    ),
    text(
      'too-much',
      cells(66, 0, 24, 6),
      Array.from({ length: 20 }, (_, at) => `Line ${at + 1}`).join('\n'),
    ),
    text(
      'wide',
      cells(0, 13, 30, 6),
      '日本語のテキスト 😀 👩‍👩‍👧 한국어 中文 ｆｕｌｌ',
    ),
    text(
      'tabs',
      cells(34, 13, 30, 6),
      'a\tb\tc\n\tindented by a tab\n  by two spaces',
    ),
    text(
      'invisible',
      cells(68, 13, 26, 6),
      'zero​width, no break, bidi ‮override‬, nul \u0000',
    ),
    text('crlf', cells(0, 21, 26, 5), 'ends its lines\r\nin CRLF\r\n'),
    text(
      'trailing',
      cells(30, 21, 26, 5),
      'ends in spaces   \n   starts with them',
    ),
    text('empty', cells(60, 21, 16, 4), ''),
    text('one-cell', cells(80, 21, 1, 1), 'one cell'),
    text('two-cells', cells(83, 21, 2, 2), 'two cells'),
    text('three-cells', cells(87, 21, 3, 3), 'three cells'),
    text(
      'wide-node',
      cells(0, 28, 300, 3),
      'A node wider than a screen, to scroll across',
    ),
    text('tall', cells(100, 0, 12, 80), 'A node taller than a screen'),
  ],
  edges: [],
};

const offGridBoard = {
  nodes: [
    {
      id: 'negative',
      type: 'text',
      x: -237,
      y: -120,
      width: 250,
      height: 60,
      text: 'Above and left of the origin',
    },
    {
      id: 'fractions',
      type: 'text',
      x: 13.5,
      y: 7.25,
      width: 250.5,
      height: 60.75,
      text: 'Places and sizes with fractions',
    },
    {
      id: 'square',
      type: 'text',
      x: 300,
      y: 0,
      width: 400,
      height: 400,
      text: 'As large as Obsidian makes a note, 400 by 400',
    },
    {
      id: 'speck',
      type: 'text',
      x: 0,
      y: 120,
      width: 3,
      height: 3,
      text: 'Smaller than a cell',
    },
    {
      id: 'under-a-cell',
      type: 'text',
      x: 20,
      y: 120,
      width: 6,
      height: 17,
      text: 'Just under a cell',
    },
    {
      id: 'cell-and-a-half',
      type: 'text',
      x: 40,
      y: 120,
      width: 10,
      height: 26,
      text: 'A cell and a half',
    },
    {
      id: 'far',
      type: 'text',
      x: 100003,
      y: 50001,
      width: 250,
      height: 60,
      text: 'Far from everything else',
    },
  ],
  edges: [
    {
      id: 'to-far',
      fromNode: 'negative',
      fromSide: 'right',
      toNode: 'far',
      toSide: 'left',
    },
    {
      id: 'off-grid',
      fromNode: 'fractions',
      fromSide: 'right',
      toNode: 'square',
      toSide: 'left',
    },
  ],
};

const obsidianBoard = (() => {
  const [card, note, file, web, frame, inside, first, second, third] =
    hexIds(9);
  return {
    nodes: [
      {
        id: frame,
        type: 'group',
        x: -500,
        y: -380,
        width: 1180,
        height: 520,
        label: 'Group',
      },
      {
        id: card,
        type: 'text',
        text: 'Untitled card',
        x: -460,
        y: -340,
        width: 250,
        height: 60,
      },
      {
        id: note,
        type: 'text',
        text: '# Note\n\nA card as Obsidian sizes it once a note is dragged in.',
        x: -460,
        y: -240,
        width: 400,
        height: 340,
        color: '5',
      },
      {
        id: file,
        type: 'file',
        file: 'notes/idea.md',
        x: 0,
        y: -340,
        width: 400,
        height: 400,
      },
      {
        id: web,
        type: 'link',
        url: 'https://obsidian.md/canvas',
        x: 0,
        y: 200,
        width: 400,
        height: 400,
      },
      {
        id: inside,
        type: 'text',
        text: 'Below the group',
        x: -460,
        y: 200,
        width: 250,
        height: 60,
        color: '1',
      },
    ],
    edges: [
      {
        id: first,
        fromNode: card,
        fromSide: 'bottom',
        toNode: note,
        toSide: 'top',
      },
      {
        id: second,
        fromNode: note,
        fromSide: 'right',
        toNode: file,
        toSide: 'left',
        label: 'opens',
      },
      {
        id: third,
        fromNode: file,
        fromSide: 'bottom',
        toNode: web,
        toSide: 'top',
        color: '3',
      },
    ],
  };
})();

const gridId = (column: number, row: number) => `n${row}-${column}`;

const bigBoard = (() => {
  const across = 40;
  const down = 25;
  const id = gridId;
  const nodes = Array.from({ length: across * down }, (_, at) => {
    const column = at % across;
    const row = Math.floor(at / across);
    return text(
      id(column, row),
      cells(column * 26, row * 7, 20, 4),
      `Node ${at + 1}\nrow ${row + 1}, column ${column + 1}`,
      at % 7 === 0 ? { color: String((at % 6) + 1) } : {},
    );
  });
  const edges = [
    ...Array.from({ length: down }, (_row, row) =>
      Array.from({ length: across - 1 }, (_column, column) =>
        edge(
          `e${row}-${column}`,
          id(column, row),
          id(column + 1, row),
          sides('right', 'left'),
        ),
      ),
    ).flat(),
    ...Array.from({ length: down - 1 }, (_, row) =>
      edge(`d${row}`, id(0, row), id(0, row + 1), sides('bottom', 'top')),
    ),
  ];
  return { nodes, edges };
})();

const extraFieldsBoard = {
  nodes: [
    text('styled', cells(0, 0, 24, 5), 'A node with fields of a plugin', {
      styleAttributes: { border: 'dashed', shape: 'pill' },
      zIndex: 3,
    }),
    group('backed', cells(30, 0, 30, 12), {
      label: 'A group with a background',
      background: 'notes/cork.png',
      backgroundStyle: 'repeat',
    }),
  ],
  edges: [
    edge('styled-edge', 'styled', 'backed', {
      ...sides('right', 'left'),
      styleAttributes: { path: 'dotted' },
    }),
  ],
  metadata: { version: '1.0-1.0', frontmatter: {} },
};

const skippedBoard = {
  nodes: [
    text('kept', cells(0, 0, 20, 4), 'Drawn'),
    text('also-kept', cells(26, 0, 20, 4), 'Drawn too'),
    { type: 'text', ...placed(cells(0, 8, 20, 4)), text: 'No id, left out' },
    { id: 'sticker', type: 'sticker', ...placed(cells(26, 8, 20, 4)) },
  ],
  edges: [
    edge('kept-edge', 'kept', 'also-kept', sides('right', 'left')),
    edge('to-nothing', 'kept', 'gone', sides('bottom', 'top')),
  ],
};

const smallBoard = {
  nodes: [text('only', cells(0, 0, 24, 4), 'A small canvas')],
  edges: [],
};

export function planCanvases({ items, file, section }: PlanBuilder): void {
  section(
    'canvases',
    `Canvases of JSON Canvas to open with Open with Canvas in the menu of a file, their places and sizes in cells of the default font, ${defaultCell.width} by ${defaultCell.height} pixels: tour.canvas holds every kind of node and edge, colors.canvas every color, edges.canvas edges from and to every side with every end, to themselves and around nodes, groups.canvas groups in groups and nodes over each other, text.canvas text of every kind and nodes smaller than their borders, off-grid.canvas places and sizes off the grid of cells, as other apps write them, obsidian.canvas a canvas as Obsidian writes it, big.canvas ${bigBoard.nodes.length.toLocaleString('en-US')} nodes to move around in, extra-fields.canvas fields JSON Canvas lacks, to keep as saved, and read-only.canvas a file to save over; empty.canvas, blank.canvas, bom.canvas and Shouting.CANVAS open empty or small, skipped.canvas leaves out what it can't draw, not-json.canvas, not-a-board.canvas and too-large.canvas say why they draw nothing, and tour.json is no canvas by its name.`,
  );
  file('canvases/tour.canvas', written(tourBoard));
  file('canvases/colors.canvas', written(colorsBoard));
  file('canvases/edges.canvas', written(edgesBoard));
  file('canvases/groups.canvas', written(groupsBoard));
  file('canvases/text.canvas', written(textBoard));
  file('canvases/off-grid.canvas', written(offGridBoard));
  file('canvases/obsidian.canvas', written(obsidianBoard));
  file('canvases/big.canvas', written(bigBoard));
  file('canvases/extra-fields.canvas', written(extraFieldsBoard));
  file('canvases/read-only.canvas', written(smallBoard), { readOnly: true });
  file('canvases/skipped.canvas', written(skippedBoard));
  file('canvases/empty.canvas', '');
  file('canvases/blank.canvas', '{}');
  file('canvases/bom.canvas', `﻿${written(smallBoard)}`);
  file('canvases/Shouting.CANVAS', written(smallBoard));
  file(
    'canvases/not-json.canvas',
    '{\n\t"nodes": [\n\t\t{ "id": "cut", "type": "text",',
  );
  file('canvases/not-a-board.canvas', '["nodes", "edges"]');
  items.push({
    kind: 'sparse',
    path: 'canvases/too-large.canvas',
    size: 51 * mib,
  });
  file('canvases/tour.json', written(tourBoard));
  file(
    'canvases/notes/idea.md',
    '# Idea\n\nA note a file node of tour.canvas and obsidian.canvas shows.\n',
  );
  file(
    'canvases/notes/plan.md',
    '# Plan\n\n## Steps\n\n1. Draw the canvas\n2. Edit it\n',
  );
}
