export const tabSize = 4;

export function tabStop(column: number): number {
  return column + tabSize - (column % tabSize);
}

export function wrappedLines(text: string, columns: number): number {
  if (text.length <= columns && !text.includes('\t')) {
    return 1;
  }
  let lines = 1;
  let column = 0;
  for (const [, word, spaces] of text.matchAll(/([^ \t]*)([ \t]*)/g)) {
    let length = word.length;
    if (length > 0 && column > 0 && column + length > columns) {
      lines++;
      column = 0;
    }
    while (length > columns) {
      length -= columns;
      lines++;
    }
    column += length;
    for (const space of spaces) {
      column = space === '\t' ? tabStop(column) : column + 1;
    }
  }
  return lines;
}

export function wrapColumns(width: number, charWidth: number): number {
  if (charWidth <= 0) {
    return Infinity;
  }
  return Math.max(1, Math.floor(width / charWidth + 1e-6));
}
