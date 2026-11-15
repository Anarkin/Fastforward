import * as assert from 'node:assert';
import { Terminal } from '@xterm/headless';
import { suite, test } from 'vitest';
import {
  PlaceReports,
  type PlaceTerminal,
} from '../../../../../tools/terminal/page/placeReports';
import type { CellRange } from '../../../../../tools/terminal/shared/protocol';

type Report =
  | { readonly top: number | undefined }
  | { readonly selection: CellRange | undefined };

function terminalWithSelection() {
  const terminal = new Terminal({
    cols: 20,
    rows: 5,
    scrollback: 20,
    allowProposedApi: true,
  });
  const changes = new Set<() => void>();
  let selection: CellRange | undefined;
  const selected: (readonly [number, number, number])[] = [];
  const select = (range: CellRange | undefined) => {
    selection = range;
    for (const change of changes) {
      change();
    }
  };
  const placed: PlaceTerminal = {
    get buffer() {
      return terminal.buffer;
    },
    get cols() {
      return terminal.cols;
    },
    registerMarker: (offset) => {
      const marker = terminal.registerMarker(offset);
      assert.ok(marker);
      return marker;
    },
    scrollToLine: (line) => terminal.scrollToLine(line),
    onScroll: (listener) => terminal.onScroll(listener),
    getSelectionPosition: () => selection,
    select: (column, row, length) => {
      selected.push([column, row, length]);
      const end = column + length;
      select({
        start: { x: column, y: row },
        end: { x: end % 20, y: row + Math.floor(end / 20) },
      });
    },
    onSelectionChange: (listener) => {
      changes.add(listener);
      return { dispose: () => changes.delete(listener) };
    },
  };
  const reports: Report[] = [];
  const place = new PlaceReports(placed, {
    scrolled: (top) => reports.push({ top }),
    selected: (range) => reports.push({ selection: range }),
  });
  const written = (data: string) =>
    new Promise<void>((resolve) => terminal.write(data, resolve));
  return { terminal, place, reports, written, select, selected };
}

const lines = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => `\r\nline ${from + index}`).join(
    '',
  );

suite('Place of a terminal tab told to the main process', () => {
  test('tells the line the tab is scrolled back to as it is scrolled, and that it is at the end again, but nothing while output moves the lines it shows, nor before its screen is written', async () => {
    const { terminal, place, reports, written } = terminalWithSelection();
    place.writing();
    await written(`line 0${lines(1, 14)}`);
    terminal.scrollLines(-2);
    terminal.scrollToBottom();
    assert.deepStrictEqual(reports, []);
    place.restore(undefined, undefined);
    terminal.scrollLines(-3);
    assert.deepStrictEqual(reports, [{ top: 7 }]);
    await written(lines(15, 15));
    assert.deepStrictEqual(reports, [{ top: 7 }]);
    terminal.scrollToBottom();
    assert.deepStrictEqual(reports, [{ top: 7 }, { top: undefined }]);
    await written(lines(30, 5));
    assert.strictEqual(reports.length, 2);
    terminal.dispose();
  });

  test('scrolls back to the line and selects the text the screen comes with, telling nothing of them, then tells the next change of either', async () => {
    const { terminal, place, reports, written, select, selected } =
      terminalWithSelection();
    place.writing();
    await written(`line 0${lines(1, 14)}`);
    const range = { start: { x: 3, y: 4 }, end: { x: 2, y: 6 } };
    place.restore(4, range);
    assert.strictEqual(terminal.buffer.active.viewportY, 4);
    assert.deepStrictEqual(selected, [[3, 4, 39]]);
    assert.deepStrictEqual(reports, []);
    terminal.scrollLines(1);
    select(undefined);
    assert.deepStrictEqual(reports, [{ top: 5 }, { selection: undefined }]);
    terminal.dispose();
  });

  test('tells the line the tab is scrolled back to again once a program leaves a screen of its own, as the main process forgets it once the program shows one', async () => {
    const { terminal, place, reports, written } = terminalWithSelection();
    place.writing();
    await written(`line 0${lines(1, 14)}`);
    place.restore(6, undefined);
    await written('\x1b[?1049h');
    await written('\x1b[?1049l');
    assert.deepStrictEqual(reports, [{ top: 6 }]);
    terminal.dispose();
  });

  test('tells nothing and restores nothing once disposed', async () => {
    const { terminal, place, reports, written, select } =
      terminalWithSelection();
    place.writing();
    await written(`line 0${lines(1, 14)}`);
    place.restore(undefined, undefined);
    place.dispose();
    place.restore(2, undefined);
    assert.strictEqual(terminal.buffer.active.viewportY, 10);
    terminal.scrollLines(-3);
    select({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    assert.deepStrictEqual(reports, []);
    terminal.dispose();
  });
});
