export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  const start = text.toLowerCase().indexOf(needle.toLowerCase());
  if (!needle || start === -1) {
    return <>{text}</>;
  }
  const end = start + needle.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
