import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { LineRanges } from '../../../../../components/syntax/page/engine';
import { screenOf } from '../../../../../tools/canvas/page/boardScreen';
import { NodeColors } from '../../../../../tools/canvas/page/nodeColors';

const heading: LineRanges = [
  [
    { start: 0, end: 1, kind: 'comment' },
    { start: 2, end: 7, kind: 'keyword' },
  ],
  [{ start: 0, end: 4, kind: 'string' }],
];

function colored() {
  const asked: string[] = [];
  const answers = new Map<string, (lines: LineRanges) => void>();
  let arrivals = 0;
  const colors = new NodeColors(
    () => {
      arrivals++;
    },
    (text) => {
      asked.push(text);
      return new Promise((resolve) => answers.set(text, resolve));
    },
  );
  const answer = async (text: string, lines: LineRanges) => {
    answers.get(text)?.(lines);
    await Promise.resolve();
  };
  return { colors, asked, answer, arrivals: () => arrivals };
}

suite('Colors of the text of a canvas', () => {
  test('colors the text of a node as Markdown once, asking the colorer for a text only once however often it is drawn, and draws it again once the colors arrive', async () => {
    const { colors, asked, answer, arrivals } = colored();
    assert.strictEqual(colors.of('a', '# Title\n**ok**'), undefined);
    assert.strictEqual(colors.of('a', '# Title\n**ok**'), undefined);
    await answer('# Title\n**ok**', heading);
    assert.deepStrictEqual(
      [asked, arrivals(), colors.of('a', '# Title\n**ok**')],
      [['# Title\n**ok**'], 1, heading],
    );
  });

  test('keeps the colors of the lines of a node that stay as they were while the colors of its text typed anew are on their way, so typing does not blink the colors of the rest away', async () => {
    const { colors, answer } = colored();
    colors.of('a', '# Title\n**ok**');
    await answer('# Title\n**ok**', heading);
    colors.of('a', '# Title\n**ok**');
    assert.deepStrictEqual(colors.of('a', '# Title\n**ok** more'), [
      heading[0],
      [],
    ]);
  });

  test('gives the lines of a text node the pieces of their colors, a line at a time, and no colors to a node it has none for', () => {
    const node = {
      id: 'a',
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 20 * 7,
      height: 4 * 18,
      text: '# Title\n**ok**',
    };
    const screen = screenOf({
      board: { nodes: [node], edges: [] },
      unit: { width: 7, height: 18 },
      view: { column: 0, row: 0, columns: 24, rows: 6 },
      widths: { char: 1, of: () => 1 },
      colorsOf: (id, text) =>
        id === 'a' && text === node.text ? heading : undefined,
    });
    const [block] = screen.texts;
    assert.deepStrictEqual(
      block?.rows.map((row) => block.segmentsOf?.(row.row)),
      [
        [
          { text: '#', kind: 'comment' },
          { text: ' ' },
          { text: 'Title', kind: 'keyword' },
        ],
        [{ text: '**ok', kind: 'string' }, { text: '**' }],
      ],
    );
  });
});
