import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  colorKind,
  screenOf,
} from '../../../../../tools/canvas/page/boardScreen';
import {
  chosenRows,
  screenRows,
} from '../../../../../tools/canvas/page/seenScreen';
import { armKindOf } from '../../../../../tools/canvas/page/screen';
import type { Board } from '../../../../../tools/canvas/shared/board';
import { edge, narrow, text, unit } from '../../../../helpers/canvasScreens';

const drawnChosen = (board: Partial<Board>, selected: readonly string[]) => {
  const screen = screenOf({
    board: { nodes: [], edges: [], ...board },
    unit,
    view: { column: 0, row: 0, columns: 24, rows: 3 },
    widths: { char: 1, of: narrow },
    selected: new Set(selected),
  });
  return { rows: screenRows(screen), chosen: chosenRows(screen) };
};

suite('Canvas screen of what is selected and where lines cross', () => {
  test('draws the selected node in its single lines over its border cells chosen, so the surface lays the gray of a selection under them alone, a group alike', () => {
    assert.deepStrictEqual(
      drawnChosen(
        {
          nodes: [
            text('idea', 0, 0, 8, 3, 'Idea'),
            text('plan', 14, 0, 8, 3, 'Plan'),
          ],
          edges: [edge({ fromSide: 'right', toSide: 'left', toEnd: 'none' })],
        },
        ['idea'],
      ),
      {
        rows: [
          '┌──────┐      ┌──────┐',
          '│ Ide⏎ ├──────┤ Pla⏎ │',
          '└──────┘      └──────┘',
        ],
        chosen: ['########', '#      #', '########'],
      },
    );
    assert.deepStrictEqual(
      drawnChosen(
        { nodes: [{ ...text('group', 0, 0, 8, 3, ''), type: 'group' }] },
        ['group'],
      ),
      {
        rows: ['┌──────┐', '│      │', '└──────┘'],
        chosen: ['########', '#      #', '########'],
      },
    );
  });

  test('keeps the color of each line where two edges cross, a cell holding the color of each of its arms, and colors the arm an edge adds to the border of its node as the edge', () => {
    const board: Board = {
      nodes: [
        text('a', 0, 4, 6, 3, ''),
        text('b', 24, 4, 6, 3, ''),
        text('c', 10, 0, 7, 3, ''),
        text('d', 10, 10, 7, 3, ''),
      ],
      edges: [
        edge({
          id: 'across',
          fromNode: 'a',
          toNode: 'b',
          fromSide: 'right',
          toSide: 'left',
          color: '1',
        }),
        edge({
          id: 'down',
          fromNode: 'c',
          toNode: 'd',
          fromSide: 'bottom',
          toSide: 'top',
          color: '4',
        }),
      ],
    };
    const screen = screenOf({
      board,
      unit,
      view: { column: 0, row: 0, columns: 32, rows: 14 },
      widths: { char: 1, of: narrow },
    });
    const rows = screenRows(screen);
    const row = rows.findIndex((each) => each.includes('┼'));
    const column = rows[row]?.indexOf('┼') ?? -1;
    assert.ok(row >= 0 && column >= 0, rows.join('\n'));
    const arms = (at: number) =>
      (['up', 'right', 'down', 'left'] as const).map((way) =>
        armKindOf(screen, at, way),
      );
    const red = colorKind('1');
    const green = colorKind('4');
    assert.deepStrictEqual(arms(row * screen.columns + column), [
      green,
      red,
      green,
      red,
    ]);
    const joint = rows[row]?.indexOf('├') ?? -1;
    assert.deepStrictEqual(arms(row * screen.columns + joint), [
      undefined,
      red,
      undefined,
      undefined,
    ]);
  });

  test('draws the selected edge over every node and edge in its way while selected, through the arrow of another edge too, its own arrow kept, as an edge selected is wanted whole', () => {
    const board: Board = {
      nodes: [
        text('a', 0, 0, 6, 3, ''),
        text('c', 10, 0, 6, 3, ''),
        text('b', 20, 0, 6, 3, ''),
        text('d', 0, 5, 6, 3, ''),
      ],
      edges: [
        edge({
          id: 'ab',
          fromNode: 'a',
          toNode: 'b',
          fromSide: 'right',
          toSide: 'left',
        }),
        edge({
          id: 'dc',
          fromNode: 'd',
          toNode: 'c',
          fromSide: 'right',
          toSide: 'left',
        }),
      ],
    };
    const drawn = (selected: readonly string[]) => {
      const screen = screenOf({
        board,
        unit,
        view: { column: 0, row: 0, columns: 28, rows: 8 },
        widths: { char: 1, of: narrow },
        selected: new Set(selected),
      });
      return { row: screenRows(screen)[1], chosen: chosenRows(screen)[1] };
    };
    assert.deepStrictEqual(drawn([]), {
      row: '│    ├──┬▶│    │───▶│    │',
      chosen: '',
    });
    assert.deepStrictEqual(drawn(['ab']), {
      row: '│    ├──┬─┼────┼───▶│    │',
      chosen: '     ################',
    });
  });

  test('draws the selected edge in its single lines over its cells chosen from end to end, its label too, and tells which edge each of its cells draws, for a click to select it', () => {
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
    const selected = screenOf({
      board,
      unit,
      view,
      widths: { char: 1, of: narrow },
      selected: new Set(['e']),
    });
    assert.deepStrictEqual(screenRows(selected), [
      '┌──────┐      ┌──────┐',
      '│ Ide⏎ ├── x ─┤ Pla⏎ │',
      '└──────┘      └──────┘',
    ]);
    assert.deepStrictEqual(chosenRows(selected), ['', '       ########', '']);
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
});
