import type { CodeSegment } from '../../../lib/page/syntax';
import { drawnText } from '../../../lib/page/blanks';
import { type TextWidths } from '../../../lib/page/textWidths';
import { type FindMark, markPieces } from './markPieces';

export function MarkedText({
  pieces,
  marks,
  blanks = false,
  widths,
}: {
  pieces: readonly CodeSegment[];
  marks: readonly FindMark[];
  blanks?: boolean;
  widths?: TextWidths;
}) {
  const drawn = drawnText(blanks, widths);
  if (marks.length === 0 && pieces.every((piece) => piece.kind === undefined)) {
    return <>{drawn(pieces.map((piece) => piece.text).join(''))}</>;
  }
  return (
    <>
      {markPieces(pieces, marks).map(({ text, kind, mark }, index) => {
        const colored =
          kind === undefined ? (
            drawn(text)
          ) : (
            <span className={`syntax-${kind}`}>{drawn(text)}</span>
          );
        return mark === undefined ? (
          <span key={index}>{colored}</span>
        ) : (
          <mark
            key={index}
            className={`find-match${mark === 'current' ? ' current' : ''}`}
          >
            {colored}
          </mark>
        );
      })}
    </>
  );
}
