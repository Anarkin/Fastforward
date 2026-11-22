import type { DiffLine } from './diff';
import { type FindMatch, type FindRange } from './find';
import { lineKey } from './lines';
import type { SyntaxRange } from '../../syntax/page/engine';
import type { WordRanges } from './wordDiff';
import { type TextWidths } from '../../../lib/page/textWidths';
import type { ColumnsIn } from '../../../lib/page/rowBreaks';
import type { DotLook } from '../../../lib/page/dotLook';
import { beyondAscii } from './rowMeasures';
import { hasControls } from '../../../lib/page/controlPictures';

export interface LineMarks {
  readonly syntax: ReadonlyMap<string, readonly SyntaxRange[]>;
  readonly words: WordRanges;
  readonly finds: ReadonlyMap<string, readonly FindRange[]>;
  readonly foundKey: string | undefined;
  readonly found: FindRange | undefined;
  readonly whitespace: boolean;
  readonly widths?: TextWidths;
  readonly copiesOf?: (text: string) => readonly FindRange[];
}

export interface CodeProps {
  readonly text: string;
  readonly syntax: readonly SyntaxRange[];
  readonly words: readonly FindRange[];
  readonly wordClass: string;
  readonly finds: readonly FindRange[];
  readonly current: FindRange | undefined;
  readonly copies?: readonly FindRange[];
  readonly whitespace: boolean;
  readonly indent?: number;
  readonly widths?: TextWidths;
  readonly columns?: number;
  readonly lineHeight?: number;
  readonly columnsIn?: ColumnsIn;
  readonly dotLook?: DotLook | undefined;
  readonly dotColumns?: readonly [number, number] | undefined;
  readonly placed?: ((code: HTMLElement | null) => void) | undefined;
}

const unmarked: readonly never[] = [];

export function changedWords(
  words: WordRanges,
  key: string | undefined,
): readonly FindRange[] {
  const found = key === undefined ? undefined : words.get(key);
  return found === undefined || found === 'whole' ? unmarked : found;
}

export function wholeChangeClass(
  words: WordRanges,
  key: string | undefined,
): string {
  return key !== undefined && words.get(key) === 'whole' ? 'whole-change' : '';
}

export function codeProps(
  marks: LineMarks,
  key: string | undefined,
  text: string,
  kind: DiffLine['kind'] | undefined,
): CodeProps {
  const of = <T>(ranges: Pick<ReadonlyMap<string, readonly T[]>, 'get'>) =>
    (key !== undefined && ranges.get(key)) || unmarked;
  return {
    text,
    syntax: of(marks.syntax),
    words: changedWords(marks.words, key),
    wordClass: kind === 'removed' ? 'word-removed' : 'word-added',
    finds: of(marks.finds),
    current:
      key !== undefined && key === marks.foundKey ? marks.found : undefined,
    copies: marks.copiesOf?.(text) ?? unmarked,
    whitespace: marks.whitespace,
    widths:
      beyondAscii.test(text) || hasControls(text) ? marks.widths : undefined,
  };
}

export function findRangesByLine(
  matches: readonly FindMatch[],
): Map<string, FindRange[]> {
  const byLine = new Map<string, FindRange[]>();
  for (const match of matches) {
    const key = lineKey(match.file, match.line);
    const ranges = byLine.get(key);
    if (ranges) {
      ranges.push(match);
    } else {
      byLine.set(key, [match]);
    }
  }
  return byLine;
}
