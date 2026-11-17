import type { WholeFile } from './rows';

export function wholeLines(whole: WholeFile): string[] {
  return whole.binary || whole.content === ''
    ? []
    : whole.content.replace(/\n$/, '').split('\n');
}

export function lineKey(file: number, line: number): string {
  return `${file}:${line}`;
}

export function keyedLine(key: string): readonly [number, number] {
  const colon = key.indexOf(':');
  return [Number(key.slice(0, colon)), Number(key.slice(colon + 1))];
}
