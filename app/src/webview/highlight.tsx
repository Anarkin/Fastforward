import { filterRanges } from './fileFilter';
import { matchesIn } from './find';

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

export function Highlight({ text, query }: { text: string; query: string }) {
  const [match] = matchesIn(text, query.trim());
  if (!match) {
    return <>{text}</>;
  }
  const { start, end } = match;
  return (
    <>
      {text.slice(0, start)}
      <mark className="match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
