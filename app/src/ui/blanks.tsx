import { Fragment } from 'react';
import { strings } from '../shared/strings';
import { cellClass, cellParts, type TextWidths } from './textWidths';

const blankSigns: Readonly<Record<string, string>> = {
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

const blank = /[ \t\r   -​  ⁠　﻿]/;

const spacesBlanksAndText = / +|[ \t\r   -​  ⁠　﻿]|[^ \t\r   -​  ⁠　﻿]+/g;

function boxedText(text: string, widths: TextWidths): React.ReactNode {
  const parts = cellParts(text, widths);
  if (parts.length === 1 && parts[0].cells === undefined) {
    return text;
  }
  return parts.map((part, index) => {
    if (part.cells === undefined) {
      return part.text;
    }
    return (
      <span key={index} className={cellClass(part.cells)}>
        {part.scale === undefined ? (
          part.text
        ) : (
          <span style={{ fontSize: `${part.scale}em` }}>{part.text}</span>
        )}
      </span>
    );
  });
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
