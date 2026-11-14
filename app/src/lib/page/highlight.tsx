import { filterRanges } from './fileFilter';

export function HighlightWords({
  text,
  words,
}: {
  text: string;
  words: readonly string[];
}) {
  const pieces: React.ReactNode[] = [];
  let at = 0;
  for (const { start, end } of filterRanges(text, words)) {
    pieces.push(
      text.slice(at, start),
      <mark key={start} className="match">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  pieces.push(text.slice(at));
  return <>{pieces}</>;
}
