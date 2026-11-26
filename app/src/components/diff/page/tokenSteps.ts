const wordRun = '[\\p{L}\\p{M}\\p{N}_\\u200c\\u200d]+';

const symbol =
  '[^\\p{L}\\p{M}\\p{N}_\\s][\\p{M}\\p{EMod}\\u{e0020}-\\u{e007f}]*';

const flag = '\\p{RI}{2}';

const symbols = `${symbol}(?:\\u200d${symbol})*`;

export const wordTokens = new RegExp(`${wordRun}|${flag}|${symbols}`, 'gu');

export const spacedTokens = new RegExp(
  `${wordRun}|\\s+|${flag}|${symbols}`,
  'gu',
);

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
