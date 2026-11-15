import * as assert from 'node:assert';
import type { Locator } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

const markRows = (mark: Locator, row: string) =>
  mark.evaluate((shown, rowSelector) => {
    const ratio = devicePixelRatio;
    const rows = (box: DOMRect) =>
      [box.top, box.bottom].map((edge) =>
        Math.round(Math.round(edge * ratio * 64) / 64),
      );
    const box = shown.getBoundingClientRect();
    const middle = (box.top + box.bottom) / 2;
    const around = [
      shown.closest(rowSelector),
      ...document.querySelectorAll(rowSelector),
    ]
      .filter((element) => element !== null)
      .map((element) => element.getBoundingClientRect())
      .find((each) => each.top <= middle && middle < each.bottom);
    return {
      mark: rows(box),
      row: around === undefined ? [] : rows(around),
      exact: {
        ratio,
        mark: [box.top, box.bottom],
        row: around === undefined ? [] : [around.top, around.bottom],
      },
    };
  }, row);

export async function assertFillsRows(
  mark: Locator,
  row: string,
): Promise<void> {
  let measured = await markRows(mark, row);
  await waitFor(
    async () => {
      measured = await markRows(mark, row);
      return measured.mark.join() === measured.row.join();
    },
    `the mark on the rows of ${row}`,
    3000,
  ).catch(() => undefined);
  assert.ok(measured.row.length > 0, `no ${row} around the mark`);
  assert.deepStrictEqual(
    measured.mark,
    measured.row,
    JSON.stringify(measured.exact),
  );
}
