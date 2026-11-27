import type { LineRanges, SyntaxRange } from './engine';

export interface CodeSegment {
  readonly text: string;
  readonly kind?: SyntaxRange['kind'];
}

export function codeSegments(code: string, lines: LineRanges): CodeSegment[] {
  return code.split('\n').flatMap((line, index) => {
    const segments: CodeSegment[] = index === 0 ? [] : [{ text: '\n' }];
    let at = 0;
    for (const { start, end, kind } of lines[index] ?? []) {
      if (start > at) {
        segments.push({ text: line.slice(at, start) });
      }
      segments.push({ text: line.slice(start, end), kind });
      at = end;
    }
    if (at < line.length) {
      segments.push({ text: line.slice(at) });
    }
    return segments;
  });
}
