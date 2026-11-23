export interface BrokenLine {
  readonly text: string;
  readonly fed: boolean;
}

export function brokenLines(text: string): BrokenLine[] {
  const lines: BrokenLine[] = [];
  let start = 0;
  let feed = text.indexOf('\n');
  let lone = text.indexOf('\r');
  while (start < text.length) {
    if (feed !== -1 && feed < start) {
      feed = text.indexOf('\n', start);
    }
    if (lone !== -1 && lone < start) {
      lone = text.indexOf('\r', start);
    }
    if (lone !== -1 && (feed === -1 || lone + 1 < feed)) {
      lines.push({ text: text.slice(start, lone + 1), fed: false });
      start = lone + 1;
    } else if (feed === -1) {
      lines.push({ text: text.slice(start), fed: false });
      start = text.length;
    } else {
      lines.push({ text: text.slice(start, feed), fed: true });
      start = feed + 1;
    }
  }
  return lines;
}
