import type { HighlighterCore } from 'shiki/core';
import { INITIAL } from 'shiki/textmate';
import { languageIds } from './languages';
import { packedPart, type CodePart } from './syntaxParts';
import {
  grammars,
  lineColorer,
  loadLanguages,
  publishTime,
  sliceTime,
  type SyntaxRange,
} from './syntaxEngine';
import { cacheable, cached, store } from './syntaxCache';

export function colorCode(
  language: string,
  code: string,
  publish: (part: CodePart | undefined) => void,
  later: (run: () => void) => void = (run) => setTimeout(run),
): () => void {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const id = languageIds.get(language.toLowerCase());
  if (id === undefined) {
    publish(undefined);
    return stop;
  }
  const key = `${id}\n${code}`;
  const lines = code.split('\n');
  const kept = cacheable(key, lines.length);
  const work = (highlighter: HighlighterCore) => {
    const found = cached(key);
    if (found !== undefined) {
      publish(packedPart(found.ranges, 0, true));
      return;
    }
    let generation = grammars;
    let color = lineColorer(highlighter, id);
    let next = 0;
    let sent = 0;
    let state = INITIAL;
    let waiting: (readonly SyntaxRange[])[] = [];
    let all: (readonly SyntaxRange[])[] = [];
    let published = -Infinity;
    const slice = () => {
      if (stopped) {
        return;
      }
      if (generation !== grammars) {
        generation = grammars;
        color = lineColorer(highlighter, id);
        next = 0;
        sent = 0;
        state = INITIAL;
        waiting = [];
        all = [];
      }
      const deadline = performance.now() + sliceTime;
      while (next < lines.length && performance.now() < deadline) {
        const line = color(lines[next], state);
        state = line.after;
        waiting.push(line.ranges);
        if (kept) {
          all.push(line.ranges);
        }
        next += 1;
      }
      const done = next >= lines.length;
      if (done || performance.now() - published >= publishTime) {
        publish(packedPart(waiting, sent, done));
        sent = next;
        waiting = [];
        published = performance.now();
      }
      if (!done) {
        later(slice);
      } else if (kept) {
        store(key, { ranges: all });
      }
    };
    later(slice);
  };
  void loadLanguages([id]).then(
    (highlighter) => {
      if (!stopped) {
        work(highlighter);
      }
    },
    (error: unknown) => {
      if (!stopped) {
        publish(undefined);
      }
      throw error;
    },
  );
  return stop;
}
