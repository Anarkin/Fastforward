import { onceAText } from '../../../lib/page/onceAText';
import { wrapStarts } from '../../../lib/page/wordWrap';
import type { TextWidths } from '../../../lib/page/textWidths';

const beyondAscii = /[^\0-\x7f]/;

const startsOf = onceAText(
  (
    text: string,
    columns: number,
    indent: number,
    widths: TextWidths | undefined,
  ): readonly number[] => wrapStarts(text, columns, indent, widths),
);

export function keptWrapStarts(
  text: string,
  columns: number,
  indent: number,
  widths: TextWidths | undefined,
): readonly number[] {
  return startsOf(
    text,
    columns,
    indent,
    widths !== undefined && widths.char > 0 && beyondAscii.test(text)
      ? widths
      : undefined,
  );
}
