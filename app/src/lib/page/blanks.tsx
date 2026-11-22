import { Fragment } from 'react';
import { cellClass, cellParts } from './cellParts';
import { hasPictures, pictureRuns, pictured } from './controlPictures';
import type { TextWidths } from './textWidths';
import {
  blank,
  blankSignOf,
  signedBlank,
  signedBlanksAndText,
  spacesBlanksAndText,
} from './blankSigns';

const genuinePicture = { 'data-genuine': '' };

function shownText(text: string): string | React.ReactNode[] {
  if (!hasPictures(text)) {
    return pictured(text);
  }
  return text.split(pictureRuns).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} {...genuinePicture}>
        {part}
      </span>
    ) : (
      pictured(part)
    ),
  );
}

function keyed(shown: string | React.ReactNode[], key: number) {
  return typeof shown === 'string' ? (
    shown
  ) : (
    <Fragment key={key}>{shown}</Fragment>
  );
}

function boxedText(text: string, widths: TextWidths): React.ReactNode {
  const parts = cellParts(text, widths);
  if (parts.length === 1 && parts[0].cells === undefined) {
    return shownText(text);
  }
  return parts.map((part, index) => {
    if (part.cells === undefined) {
      return keyed(shownText(part.text), index);
    }
    return (
      <span
        key={index}
        className={cellClass(part.cells)}
        {...(hasPictures(part.text) && genuinePicture)}
      >
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
  spaces: boolean,
): React.ReactNode {
  if (spaces && part.startsWith(' ')) {
    return (
      <span key={key} className="spaces">
        {part}
      </span>
    );
  }
  if (!(spaces ? blank : signedBlank).test(part)) {
    return widths === undefined ? (
      keyed(shownText(part), key)
    ) : (
      <Fragment key={key}>{boxedText(part, widths)}</Fragment>
    );
  }
  const cells = widths?.boxed?.(part);
  return (
    <span
      key={key}
      className={cells === undefined ? 'blank' : `blank ${cellClass(cells)}`}
      data-glyph={blankSignOf(part)}
    >
      {part}
    </span>
  );
}

export function DrawnText({
  text,
  blanks,
  spaces = true,
  widths,
}: {
  readonly text: string;
  readonly blanks: boolean;
  readonly spaces?: boolean;
  readonly widths?: TextWidths;
}): React.ReactNode {
  const boxing = widths?.boxed === undefined ? undefined : widths;
  if (!blanks || !(spaces ? blank : signedBlank).test(text)) {
    return boxing === undefined ? shownText(text) : boxedText(text, boxing);
  }
  return Array.from(
    text.matchAll(spaces ? spacesBlanksAndText : signedBlanksAndText),
    ([part], index) => blankShown(part, index, boxing, spaces),
  );
}
