export function LineCounts({
  deletions,
  insertions,
}: {
  deletions: number;
  insertions: number;
}) {
  if (deletions === 0 && insertions === 0) {
    return null;
  }
  return (
    <span className="line-counts">
      {deletions > 0 && <span className="deletions">-{deletions}</span>}
      {insertions > 0 && <span className="insertions">+{insertions}</span>}
    </span>
  );
}
