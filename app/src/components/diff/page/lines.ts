import { brokenLines, type BrokenLine } from '../../../lib/page/textLines';
import type { WholeFile } from './rows';

export function wholeBrokenLines(whole: WholeFile): BrokenLine[] {
  return whole.binary ? [] : brokenLines(whole.content);
}

export function wholeLines(whole: WholeFile): string[] {
  return wholeBrokenLines(whole).map((line) => line.text);
}

export function lineKey(file: number, line: number): string {
  return `${file}:${line}`;
}

export function keyedLine(key: string): readonly [number, number] {
  const colon = key.indexOf(':');
  return [Number(key.slice(0, colon)), Number(key.slice(colon + 1))];
}
