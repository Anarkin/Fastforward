// A file's or a group of files' removed and added lines, on the right of its
// row; nothing for files without lines, like binary ones
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
      <span className="deletions">-{deletions}</span>
      <span className="insertions">+{insertions}</span>
    </span>
  );
}
