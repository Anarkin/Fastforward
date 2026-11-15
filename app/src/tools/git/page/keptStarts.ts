import { wrapStarts } from '../../../lib/page/wordWrap';
import type { TextWidths } from '../../../lib/page/textWidths';
import { beyondAscii } from './rowMeasures';

interface Kept {
  readonly text: string;
  readonly columns: number;
  readonly indent: number;
  readonly widths: TextWidths | undefined;
  readonly starts: readonly number[];
}

const mostKept = 16;

const kept: Kept[] = [];

export function keptWrapStarts(
  text: string,
  columns: number,
  indent: number,
  widths: TextWidths | undefined,
): readonly number[] {
  const measuring =
    widths !== undefined && widths.char > 0 && beyondAscii.test(text)
      ? widths
      : undefined;
  const at = kept.findIndex(
    (one) =>
      one.columns === columns &&
      one.indent === indent &&
      one.widths === measuring &&
      one.text === text,
  );
  const found =
    at === -1
      ? {
          text,
          columns,
          indent,
          widths: measuring,
          starts: wrapStarts(text, columns, indent, measuring),
        }
      : kept.splice(at, 1)[0];
  kept.push(found);
  if (kept.length > mostKept) {
    kept.shift();
  }
  return found.starts;
}
