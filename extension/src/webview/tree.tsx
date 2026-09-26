// Like VS Code's trees: a level is indented by its parent's twisty, and a
// guide runs down from each ancestor's twisty
const treePadding = 8;
export const twistyWidth = 10;

export function treeIndent(depth: number): number {
  return treePadding + depth * twistyWidth;
}

export function IndentGuides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          className="indent-guide"
          style={{ left: treeIndent(level) + twistyWidth / 2 }}
        />
      ))}
    </>
  );
}
