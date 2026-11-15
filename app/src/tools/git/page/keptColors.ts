import type { DiffFile } from './diff';
import { lineKey } from './diffLines';
import type { SyntaxRange } from '../../../lib/page/syntaxEngine';
import { partLine, type CodePart } from '../../../lib/page/syntaxParts';
import { sidePlans } from './syntaxSources';

interface Kept {
  readonly part: CodePart;
  readonly generation: number;
}

const maxKeptLines = 200_000;
const kept = new Map<string, Kept>();
let keptLines = 0;
const newestGenerations = new Map<string, number>();

export const newestGeneration = (language: string) =>
  newestGenerations.get(language) ?? 0;

export function noteGeneration(language: string, generation: number) {
  newestGenerations.set(
    language,
    Math.max(newestGeneration(language), generation),
  );
}

const keptKey = (language: string, blob: string) => `${language}\n${blob}`;

function forget(key: string, { part }: Kept) {
  kept.delete(key);
  keptLines -= part.ends.length;
}

function keptPart(language: string, blob: string): CodePart | undefined {
  const key = keptKey(language, blob);
  const found = kept.get(key);
  if (found === undefined) {
    return undefined;
  }
  forget(key, found);
  if (found.generation < newestGeneration(language)) {
    return undefined;
  }
  kept.set(key, found);
  keptLines += found.part.ends.length;
  return found.part;
}

export function keepColors(
  language: string,
  blob: string,
  part: CodePart,
  generation: number,
): void {
  noteGeneration(language, generation);
  const key = keptKey(language, blob);
  const before = keptPart(language, blob);
  if (
    generation < newestGeneration(language) ||
    (before && before.ends.length >= part.ends.length)
  ) {
    return;
  }
  const replaced = kept.get(key);
  if (replaced) {
    forget(key, replaced);
  }
  kept.set(key, { part, generation });
  keptLines += part.ends.length;
  for (const [oldest, each] of kept) {
    if (keptLines <= maxKeptLines) {
      break;
    }
    forget(oldest, each);
  }
}

export function keptColorsOf(
  files: readonly DiffFile[],
  open?: ReadonlySet<number>,
  chosen?: string,
): Map<string, readonly SyntaxRange[]> {
  const found = new Map<string, readonly SyntaxRange[]>();
  for (const { file, fileIndex, language, side, shown } of sidePlans(
    files,
    open,
    chosen,
  )) {
    const blob = file.blobs?.[side];
    const part = blob === undefined ? undefined : keptPart(language, blob);
    if (part === undefined) {
      continue;
    }
    for (const { owned, index, number } of shown) {
      const ranges = owned ? partLine(part, number - 1) : undefined;
      if (ranges !== undefined) {
        found.set(lineKey(fileIndex, index), ranges);
      }
    }
  }
  return found;
}
