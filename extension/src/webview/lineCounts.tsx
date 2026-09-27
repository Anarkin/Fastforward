// A file's or a group of files' removed and added lines, on the right of its
// row; a side without lines is left out, so an added file shows only +N, and
// a file without any, like a binary one, shows nothing
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
