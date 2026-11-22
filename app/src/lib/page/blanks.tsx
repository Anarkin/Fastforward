import { Fragment } from 'react';
import { cellClass, cellParts } from './cellParts';
import {
  everyPicture,
  hasControls,
  hasPictures,
  pictureRuns,
  pictured,
  picturesAndControls,
} from './controlPictures';
import type { TextWidths } from './textWidths';
import {
  blank,
  blankSignOf,
  signedBlank,
  signedBlanksAndText,
  spacesBlanksAndText,
} from './blankSigns';

const genuinePicture = { 'data-genuine': '' };

const picturesBoxed = new WeakMap<TextWidths, boolean>();

function boxesPictures(widths: TextWidths): boolean {
  let boxes = picturesBoxed.get(widths);
  if (boxes === undefined) {
    boxes = everyPicture.some((each) => widths.boxed?.(each) !== undefined);
    picturesBoxed.set(widths, boxes);
  }
  return boxes;
}

function boxed(
  text: string,
  cells: number,
  scale: number | undefined,
  key: number,
  genuine: boolean,
) {
  return (
    <span
      key={key}
      className={cellClass(cells)}
      {...(genuine && genuinePicture)}
    >
      {scale === undefined ? (
        text
      ) : (
        <span style={{ fontSize: `${scale}em` }}>{text}</span>
      )}
    </span>
  );
}

function shownText(
  text: string,
  boxing: TextWidths | undefined,
): string | React.ReactNode[] {
  const boxes =
    boxing !== undefined && hasControls(text) && boxesPictures(boxing);
  if (!boxes) {
    return hasPictures(text)
      ? text.split(pictureRuns).map((part, index) =>
          index % 2 === 1 ? (
            <span key={index} {...genuinePicture}>
              {part}
            </span>
          ) : (
            pictured(part)
          ),
        )
      : pictured(text);
  }
  return text.split(picturesAndControls).map((part, index) => {
    if (index % 2 === 0) {
      return part;
    }
    if (!hasControls(part)) {
      return (
        <span key={index} {...genuinePicture}>
          {part}
        </span>
      );
    }
    const shown = pictured(part);
    const cells = boxing.boxed?.(shown);
    return cells === undefined
      ? shown
      : boxed(shown, cells, boxing.scaled?.(shown), index, false);
  });
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
    return shownText(text, widths);
  }
  return parts.map((part, index) =>
    part.cells === undefined
      ? keyed(shownText(part.text, widths), index)
      : boxed(part.text, part.cells, part.scale, index, hasPictures(part.text)),
  );
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
      keyed(shownText(part, undefined), key)
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
    return boxing === undefined
      ? shownText(text, undefined)
      : boxedText(text, boxing);
  }
  return Array.from(
    text.matchAll(spaces ? spacesBlanksAndText : signedBlanksAndText),
    ([part], index) => blankShown(part, index, boxing, spaces),
  );
}
