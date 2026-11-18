import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { TextRow } from '../../../../../tools/viewer/page/textRow';
import type { ScreenRow } from '../../../../../tools/viewer/page/screenRows';

const text = 'ab  c d';

const row: ScreenRow = {
  start: 0,
  end: text.length,
  row: { start: 0, end: text.length, text },
  index: 0,
  from: 0,
  to: text.length,
  indent: 0,
  breakAt: undefined,
  hanging: [],
};

const shown = (
  showWhitespace: boolean,
  part?: {
    readonly from: number;
    readonly to: number;
    readonly column: number;
  },
) =>
  renderToStaticMarkup(
    <TextRow
      row={row}
      part={part}
      colored={undefined}
      marks={[]}
      showWhitespace={showWhitespace}
      widths={undefined}
    />,
  );

const cell = (from: number, to = from + 1) =>
  `transparent 0 ${from}%,currentColor 0 ${to}%`;

suite('A row of a file viewed', () => {
  test('dots the spaces of a row on the one layer the diff dots its rows with, at the columns of its spaces from where its text starts, and only while whitespace is shown', () => {
    assert.strictEqual(
      shown(true),
      `<div class="viewer-row" data-key="0:0">${text}<span class="dot-rows" aria-hidden="true" style="left:calc(0 * var(--text-advance));--dot-columns:100;background-image:linear-gradient(to right,${cell(2, 4)},${cell(5)},transparent 0);background-position:0 0%"></span></div>`,
    );
    assert.ok(
      shown(true, { from: 3, to: 7, column: 4 }).includes(
        `> c d<span class="dot-rows" aria-hidden="true" style="left:calc(4 * var(--text-advance));--dot-columns:100;background-image:linear-gradient(to right,${cell(0)},${cell(2)},transparent 0);`,
      ),
    );
    assert.strictEqual(
      shown(false),
      `<div class="viewer-row" data-key="0:0">${text}</div>`,
    );
  });
});
