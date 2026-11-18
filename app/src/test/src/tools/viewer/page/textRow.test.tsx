import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { TextRow } from '../../../../../tools/viewer/page/textRow';
import { dotLook } from '../../../../../lib/page/dotLook';
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
  columns?: number,
  drawn = row,
) =>
  renderToStaticMarkup(
    <TextRow
      row={drawn}
      part={part}
      columns={columns}
      colored={undefined}
      marks={[]}
      showWhitespace={showWhitespace}
      widths={undefined}
      dotLook={look}
    />,
  );

const look = dotLook(14, 8, 1);

const dot = (column: number) =>
  `transparent 0 ${column * 8 + 3}px,currentColor 0 ${column * 8 + 5}px`;

suite('A row of a file viewed', () => {
  test('dots the spaces of a row on the one layer the diff dots its rows with, at the columns of its spaces from where its text starts, and only while whitespace is shown', () => {
    assert.strictEqual(
      shown(true),
      `<div class="viewer-row" data-key="0:0">${text}<span class="dot-rows" aria-hidden="true" style="left:calc(0 * var(--text-advance));background-image:linear-gradient(to right,${dot(0)},${dot(1)},${dot(3)},transparent 0);background-position:16px var(--dot-top);background-size:32px var(--space-dot)"></span></div>`,
    );
    assert.ok(
      shown(true, { from: 3, to: 7, column: 4 }).includes(
        `> c d<span class="dot-rows" aria-hidden="true" style="left:calc(4 * var(--text-advance));background-image:linear-gradient(to right,${dot(0)},${dot(2)},transparent 0);`,
      ),
    );
    assert.strictEqual(
      shown(false),
      `<div class="viewer-row" data-key="0:0">${text}</div>`,
    );
  });

  test('dots the spaces of a wrapped row only as far as the row is wide and the one column a blank hangs in past it, counted from where a row hanging in starts, as the diff does, not every space hanging off its end, as a table padded with a thousand spaces a line drew a thousand dots out of sight for each row and took 44 ms a frame to scroll', () => {
    const padded = `ab c${' '.repeat(1000)}`;
    const hanging: ScreenRow = {
      ...row,
      end: padded.length,
      row: { start: 0, end: padded.length, text: padded },
      to: padded.length,
    };
    assert.ok(
      shown(true, undefined, 6, hanging).includes(
        `background-image:linear-gradient(to right,${dot(0)},${dot(2)},${dot(3)},${dot(4)},transparent 0);background-position:16px var(--dot-top);`,
      ),
      shown(true, undefined, 6, hanging).slice(0, 2000),
    );
    assert.ok(
      shown(
        true,
        { from: 0, to: padded.length, column: 2 },
        6,
        hanging,
      ).includes(
        `left:calc(2 * var(--text-advance));background-image:linear-gradient(to right,${dot(0)},${dot(2)},transparent 0);background-position:16px var(--dot-top);`,
      ),
    );
  });
});
