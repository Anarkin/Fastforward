import type { HighlighterCore } from 'shiki/core';
import { INITIAL, type StateStack } from 'shiki/textmate';
import { languageIds } from './languages';
import { packedPart, type CodePart } from './syntaxParts';
import {
  SyntaxRange,
  LineColorer,
  lineColorer,
  grammars,
  loadLanguages,
  sliceTime,
} from './syntaxEngine';

export function replacedIn<T>(
  all: readonly T[],
  from: number,
  removed: number,
  items: readonly T[],
): T[] {
  return all.slice(0, from).concat(items, all.slice(from + removed));
}

export interface EditedColoring {
  edit(from: number, removed: number, lines: readonly string[]): void;
  stop(): void;
}

export function colorEdited(
  language: string,
  initial: readonly string[],
  publish: (part: CodePart | undefined) => void,
  later: (run: () => void) => void = (run) => setTimeout(run),
): EditedColoring {
  let stopped = false;
  const id = languageIds.get(language.toLowerCase());
  if (id === undefined) {
    later(() => publish(undefined));
    return { edit: () => {}, stop: () => {} };
  }
  let lines = [...initial];
  let states: (StateStack | undefined)[] = lines.map(() => undefined);
  let stale: boolean[] = lines.map(() => true);
  let scheduled = false;
  let color: LineColorer | undefined;
  let highlighter: HighlighterCore | undefined;
  let generation = grammars;
  const schedule = () => {
    if (!scheduled && !stopped && color !== undefined) {
      scheduled = true;
      later(slice);
    }
  };
  const slice = () => {
    scheduled = false;
    if (stopped || color === undefined || highlighter === undefined) {
      return;
    }
    if (generation !== grammars) {
      generation = grammars;
      color = lineColorer(highlighter, id);
      states.fill(undefined);
      stale.fill(true);
    }
    const deadline = performance.now() + sliceTime;
    let next = stale.indexOf(true);
    while (next !== -1 && performance.now() < deadline) {
      const from = next;
      const colored: (readonly SyntaxRange[])[] = [];
      while (next < lines.length && performance.now() < deadline) {
        const before = next === 0 ? INITIAL : (states[next - 1] ?? INITIAL);
        const { ranges, after } = color(lines[next], before);
        const old = states[next];
        states[next] = after;
        stale[next] = false;
        colored.push(ranges);
        next += 1;
        if (next < lines.length) {
          if (!stale[next] && old?.equals(after) === true) {
            break;
          }
          stale[next] = true;
        }
      }
      next = stale.indexOf(true);
      publish(packedPart(colored, from, next === -1));
    }
    if (next !== -1) {
      schedule();
    }
  };
  void loadLanguages([id]).then(
    (loaded) => {
      if (stopped) {
        return;
      }
      highlighter = loaded;
      generation = grammars;
      color = lineColorer(loaded, id);
      schedule();
    },
    (error: unknown) => {
      if (!stopped) {
        publish(undefined);
      }
      throw error;
    },
  );
  return {
    edit(from, removed, inserted) {
      const lastOld = removed > 0 ? states[from + removed - 1] : undefined;
      lines = replacedIn(lines, from, removed, inserted);
      states = replacedIn(
        states,
        from,
        removed,
        inserted.map((_, at): StateStack | undefined =>
          at === inserted.length - 1 ? lastOld : undefined,
        ),
      );
      stale = replacedIn(
        stale,
        from,
        removed,
        inserted.map(() => true),
      );
      if (inserted.length === 0 && from < lines.length) {
        stale[from] = true;
      }
      schedule();
    },
    stop() {
      stopped = true;
    },
  };
}
