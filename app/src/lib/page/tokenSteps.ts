export function tokenSteps(
  lines: readonly string[],
  pattern: RegExp,
): () => boolean {
  const tokens = new RegExp(pattern);
  let line = 0;
  return () => {
    while (line < lines.length) {
      if (tokens.test(lines[line])) {
        return true;
      }
      line++;
    }
    return false;
  };
}
