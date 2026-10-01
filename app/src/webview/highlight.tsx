import { matchesIn } from './find';

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
