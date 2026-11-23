import type { EditorSurface } from './surface';
import { bracketPairs } from './brackets';
import type { DocMark } from './cellLines';
import { findMarks } from './find';
import { occurrencesShown } from './occurrences';

interface Place {
  readonly from: number;
  readonly to: number;
}

export function mergedMarks(
  finds: readonly DocMark[],
  others: readonly Place[],
): readonly DocMark[] {
  if (others.length === 0) {
    return finds;
  }
  const merged: DocMark[] = [];
  let at = 0;
  let past = 0;
  for (const other of others) {
    while (at < finds.length && (finds[at]?.from ?? 0) < other.to) {
      const find = finds[at];
      if (find !== undefined) {
        merged.push(find);
        past = Math.max(past, find.to);
      }
      at += 1;
    }
    if (other.from >= past) {
      merged.push({ from: other.from, to: other.to, occurrence: true });
      past = other.to;
    }
  }
  merged.push(...finds.slice(at));
  return merged.toSorted((one, other) => one.from - other.from);
}

function apart(places: readonly Place[]): Place[] {
  const kept: Place[] = [];
  for (const place of places.toSorted((one, other) => one.from - other.from)) {
    if (place.from >= (kept.at(-1)?.to ?? 0)) {
      kept.push(place);
    }
  }
  return kept;
}

interface Kept {
  readonly finds: readonly DocMark[];
  readonly occurrences: readonly Place[];
  readonly brackets: readonly Place[];
  readonly marks: readonly DocMark[];
}

const shown = new WeakMap<EditorSurface, Kept>();

const none: readonly Place[] = [];

export function marksShown(view: EditorSurface): readonly DocMark[] {
  const finds = findMarks(view.state);
  const occurrences = view.hasFocus ? occurrencesShown(view) : none;
  const brackets = view.hasFocus ? bracketPairs(view.state) : none;
  const kept = shown.get(view);
  if (
    kept?.finds === finds &&
    kept.occurrences === occurrences &&
    kept.brackets === brackets
  ) {
    return kept.marks;
  }
  const marks = mergedMarks(finds, apart([...occurrences, ...brackets]));
  shown.set(view, { finds, occurrences, brackets, marks });
  return marks;
}
