import { wrapStarts } from './wordWrap';
import type { TextWidths } from './textWidths';

const beyondAscii = /[^\0-\x7f]/;

interface Kept {
  readonly columns: number;
  readonly indent: number;
  readonly widths: TextWidths | undefined;
  readonly starts: readonly number[];
}

const mostCharacters = 1_000_000;

const kept = new Map<string, Kept[]>();

let characters = 0;

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
  const ways = kept.get(text) ?? [];
  let found = ways.find(
    (one) =>
      one.columns === columns &&
      one.indent === indent &&
      one.widths === measuring,
  );
  if (found === undefined) {
    found = {
      columns,
      indent,
      widths: measuring,
      starts: wrapStarts(text, columns, indent, measuring),
    };
    ways.push(found);
    characters += text.length;
  }
  kept.delete(text);
  kept.set(text, ways);
  for (const [oldest, old] of kept) {
    if (characters <= mostCharacters || oldest === text) {
      break;
    }
    kept.delete(oldest);
    characters -= oldest.length * old.length;
  }
  return found.starts;
}
