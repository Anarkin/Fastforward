import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TextRequest } from '../shared/protocol';
import { textKey, type DiffFile } from './diff';
import type { WholeFile } from './diffView';
import { lineKey, wholeLines } from './find';
import { languageOf } from './languages';
import type {
  FromSyntax,
  LineRanges,
  SyntaxRange,
  SyntaxSource,
  ToSyntax,
} from './syntaxEngine';

export type { SyntaxRange } from './syntaxEngine';
export { languageOf } from './languages';

type Side = 'old' | 'new';

const sides = ['old', 'new'] as const;

function sideLines(file: DiffFile, side: Side) {
  return file.hunks
    .flatMap((hunk) => hunk.lines)
    .map((line, index) => ({
      line,
      index,
      number: side === 'old' ? line.oldNumber : line.newNumber,
      owned:
        line.kind === (side === 'old' ? 'removed' : 'added') ||
        (line.kind === 'context' && side === 'new'),
    }))
    .filter(
      (shown): shown is typeof shown & { number: number } =>
        shown.number !== undefined,
    );
}

const maxSourceLines = 5000;

const maxTextLines = 20_000;

interface SidePlan {
  readonly file: DiffFile;
  readonly fileIndex: number;
  readonly language: string;
  readonly side: Side;
  readonly shown: ReturnType<typeof sideLines>;
  readonly wholeText: boolean;
}

function sidePlans(
  files: readonly DiffFile[],
  open: ReadonlySet<number> | undefined,
): SidePlan[] {
  let used = 0;
  return files.flatMap((file, fileIndex) => {
    const language = languageOf(file.path);
    if (
      !language ||
      file.binary ||
      file.placeholder ||
      (open && !open.has(fileIndex))
    ) {
      return [];
    }
    return sides.flatMap((side) => {
      const shown = sideLines(file, side);
      if (!shown.some(({ owned }) => owned)) {
        return [];
      }
      const last = shown.at(-1)?.number ?? 0;
      const gap = last !== shown.length;
      const wholeText =
        used < maxTextLines &&
        !!file.blobs?.[side] &&
        gap &&
        last <= maxSourceLines;
      used += wholeText ? last : Math.min(shown.length, maxSourceLines);
      return [{ file, fileIndex, language, side, shown, wholeText }];
    });
  });
}

function sideSource(
  { fileIndex, language, shown, wholeText }: SidePlan,
  text: string | undefined,
): SyntaxSource {
  const keyOf = ({ owned, index }: (typeof shown)[number]) =>
    owned ? lineKey(fileIndex, index) : undefined;
  const lines = wholeText ? text?.split(/\r?\n/) : undefined;
  if (
    lines === undefined ||
    shown.some(
      ({ line, number }) => lines[number - 1] !== line.text.replace(/\r$/, ''),
    )
  ) {
    const kept = shown.slice(0, maxSourceLines);
    return {
      language,
      lines: kept.map(({ line }) => line.text),
      keys: kept.map(keyOf),
    };
  }
  const keys: (string | undefined)[] = [];
  for (const line of shown) {
    keys[line.number - 1] = keyOf(line);
  }
  return { language, lines: lines.slice(0, keys.length), keys };
}

export function syntaxSources(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, string> = new Map(),
  open?: ReadonlySet<number>,
): SyntaxSource[] {
  if (whole) {
    const language = languageOf(whole.path);
    const lines = wholeLines(whole).slice(0, maxSourceLines);
    return language
      ? [{ language, lines, keys: lines.map((_, index) => lineKey(0, index)) }]
      : [];
  }
  return sidePlans(files, open).map((plan) =>
    sideSource(plan, texts.get(textKey(plan.file.path, plan.side))),
  );
}

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
  open?: ReadonlySet<number>,
): TextRequest[] {
  return sidePlans(files, open).flatMap(({ file, side, wholeText }) => {
    const blob = file.blobs?.[side];
    const key = `${diff}:${textKey(file.path, side)}`;
    if (!wholeText || !blob || requested.has(key)) {
      return [];
    }
    requested.add(key);
    return [{ path: file.path, side, blob }];
  });
}

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

export interface SyntaxPort {
  post(message: ToSyntax): void;
  listen(
    received: (message: FromSyntax) => void,
    failed: (error: unknown) => void,
  ): void;
}

export interface Colorer {
  color(
    sources: readonly SyntaxSource[],
    colored: (
      ranges: readonly (readonly [string, readonly SyntaxRange[]])[],
    ) => void,
  ): () => void;
  code(language: string, code: string): Promise<LineRanges | undefined>;
}

export function colorerOf(port: SyntaxPort): Colorer {
  const waiting = new Map<number, (message: FromSyntax) => void>();
  let jobs = 0;
  port.listen(
    (message) => {
      if (message.type === 'failed') {
        reportError(new Error(message.message));
      } else {
        waiting.get(message.job)?.(message);
      }
    },
    (error) => reportError(error),
  );
  return {
    color(sources, colored) {
      const job = (jobs += 1);
      waiting.set(job, (message) => {
        if (message.type === 'colors') {
          colored(message.ranges);
        }
      });
      port.post({ type: 'color', job, sources });
      return () => {
        waiting.delete(job);
        port.post({ type: 'stop', job });
      };
    },
    code(language, code) {
      const job = (jobs += 1);
      return new Promise((resolve) => {
        waiting.set(job, (message) => {
          if (message.type === 'code') {
            waiting.delete(job);
            resolve(message.lines);
          }
        });
        port.post({ type: 'code', job, language, code });
      });
    },
  };
}

let shared: Colorer | undefined;

function workerPort(worker: Worker): SyntaxPort {
  return {
    post: (message) => worker.postMessage(message),
    listen: (received, failed) => {
      worker.addEventListener('message', (event: MessageEvent<FromSyntax>) =>
        received(event.data),
      );
      worker.addEventListener('error', (event) =>
        failed(event.error ?? new Error(event.message)),
      );
    },
  };
}

function colorer(): Colorer {
  shared ??= colorerOf(
    workerPort(
      new Worker(new URL('syntaxWorker.js', location.href), {
        type: 'module',
      }),
    ),
  );
  return shared;
}

export function colorCode(
  language: string,
  code: string,
): Promise<LineRanges | undefined> {
  return colorer().code(language, code);
}

const noRanges: ReadonlyMap<string, readonly SyntaxRange[]> = new Map();

interface Colored {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly ranges: Map<string, readonly SyntaxRange[]>;
}

export function useSyntax(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, string>,
  open: ReadonlySet<number>,
): ReadonlyMap<string, readonly SyntaxRange[]> {
  const sources = useMemo(
    () => syntaxSources(files, whole, texts, open),
    [files, whole, texts, open],
  );
  const [colored, setColored] = useState<Colored>();
  const shown = useRef<Colored>(undefined);
  useLayoutEffect(() => {
    const last = shown.current;
    const ranges =
      last?.files === files && last.whole === whole
        ? last.ranges
        : new Map<string, readonly SyntaxRange[]>();
    const publish = () => {
      shown.current = { files, whole, ranges };
      setColored(shown.current);
    };
    publish();
    return sources.length === 0
      ? undefined
      : colorer().color(sources, (found) => {
          for (const [key, line] of found) {
            ranges.set(key, line);
          }
          publish();
        });
  }, [sources, files, whole]);
  return colored?.files === files && colored.whole === whole
    ? colored.ranges
    : noRanges;
}
