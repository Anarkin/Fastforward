import { Fragment } from 'react';
import { strings } from '../shared/strings';
import type { TextWidths } from './textWidths';

const blankSigns: Readonly<Record<string, string>> = {
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

const blank = /[ \t\r   -​  ⁠　﻿]/;

const spacesBlanksAndText = / +|[ \t\r   -​  ⁠　﻿]|[^ \t\r   -​  ⁠　﻿]+/g;

const nonAscii = /[^\0-\x7f]/;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const cellClasses = ['cell zero', 'cell', 'cell wide'];

const cellClass = (cells: number) => cellClasses[cells] ?? 'cell';

function cellStyle(
  widths: TextWidths,
  cluster: string,
): React.CSSProperties | undefined {
  const scale = widths.scaled?.(cluster);
  return scale === undefined ? undefined : { fontSize: `${scale}em` };
}

function boxedText(text: string, widths: TextWidths): React.ReactNode {
  if (widths.boxed === undefined || !nonAscii.test(text)) {
    return text;
  }
  const parts: React.ReactNode[] = [];
  let plain = '';
  for (const { segment, index } of graphemes.segment(text)) {
    const cells = nonAscii.test(segment) ? widths.boxed(segment) : undefined;
    if (cells === undefined) {
      plain += segment;
      continue;
    }
    if (plain !== '') {
      parts.push(plain);
      plain = '';
    }
    const style = cellStyle(widths, segment);
    parts.push(
      <span key={index} className={cellClass(cells)}>
        {style === undefined ? segment : <span style={style}>{segment}</span>}
      </span>,
    );
  }
  if (plain !== '') {
    parts.push(plain);
  }
  return parts;
}

function blankShown(
  part: string,
  key: number,
  widths: TextWidths | undefined,
): React.ReactNode {
  if (part.startsWith(' ')) {
    return (
      <span key={key} className="spaces">
        {part}
      </span>
    );
  }
  if (!blank.test(part)) {
    return widths === undefined ? (
      part
    ) : (
      <Fragment key={key}>{boxedText(part, widths)}</Fragment>
    );
  }
  const cells = widths?.boxed?.(part);
  return (
    <span
      key={key}
      className={cells === undefined ? 'blank' : `blank ${cellClass(cells)}`}
      data-glyph={blankSigns[part] ?? strings.symbols.invisible}
    >
      {part}
    </span>
  );
}

const asIs = (text: string): React.ReactNode => text;

export function drawnText(
  blanks: boolean,
  widths?: TextWidths,
): (text: string) => React.ReactNode {
  const boxing = widths?.boxed === undefined ? undefined : widths;
  if (!blanks) {
    return boxing === undefined ? asIs : (text) => boxedText(text, boxing);
  }
  return (text) => {
    if (!blank.test(text)) {
      return boxing === undefined ? text : boxedText(text, boxing);
    }
    return Array.from(text.matchAll(spacesBlanksAndText), ([part], index) =>
      blankShown(part, index, boxing),
    );
  };
}
