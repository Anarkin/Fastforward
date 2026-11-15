import { filterRanges, type Filter } from '../shared/filter';
import type { FindRange } from '../shared/textMatches';

export function HighlightWords({
  text,
  filter,
}: {
  text: string;
  filter: Filter;
}) {
  return <Marked text={text} ranges={filterRanges(text, filter)} />;
}

export function Marked({
  text,
  ranges,
  at = 0,
}: {
  text: string;
  ranges: readonly FindRange[];
  at?: number;
}) {
  const pieces: React.ReactNode[] = [];
  let from = 0;
  for (const range of ranges) {
    const start = Math.max(range.start - at, from);
    const end = Math.min(range.end - at, text.length);
    if (end > start) {
      pieces.push(
        text.slice(from, start),
        <mark key={start} className="match">
          {text.slice(start, end)}
        </mark>,
      );
      from = end;
    }
  }
  if (pieces.length === 0) {
    return text;
  }
  pieces.push(text.slice(from));
  return <>{pieces}</>;
}
