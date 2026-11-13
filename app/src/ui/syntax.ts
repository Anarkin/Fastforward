import type {
  FromSyntax,
  LineRanges,
  SyntaxRange,
  SyntaxSource,
  ToSyntax,
} from './syntaxEngine';
import { partLines, type CodePart } from './syntaxParts';

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
      generations: Readonly<Record<string, number>>,
    ) => void,
    entire?: (source: number, part: CodePart, generation: number) => void,
    background?: boolean,
  ): () => void;
  code(
    language: string,
    code: string,
    signal?: AbortSignal,
  ): Promise<LineRanges | undefined>;
  colorParts(
    language: string,
    code: string,
    colored: (part: CodePart | undefined) => void,
  ): () => void;
  colorEdited(
    language: string,
    lines: readonly string[],
    colored: (part: CodePart | undefined) => void,
  ): EditedColors;
}

export interface EditedColors {
  edit(from: number, removed: number, lines: readonly string[]): void;
  stop(): void;
}

export function colorerOf(port: SyntaxPort): Colorer {
  const waiting = new Map<number, (message: FromSyntax) => void>();
  let jobs = 0;
  const colorParts: Colorer['colorParts'] = (language, code, colored) => {
    const job = (jobs += 1);
    waiting.set(job, (message) => {
      if (message.type !== 'code') {
        return;
      }
      if (message.part === undefined || message.part.done) {
        waiting.delete(job);
      }
      colored(message.part);
    });
    port.post({ type: 'code', job, language, code });
    return () => {
      if (waiting.delete(job)) {
        port.post({ type: 'stop', job });
      }
    };
  };
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
    colorEdited(language, lines, colored) {
      const job = (jobs += 1);
      waiting.set(job, (message) => {
        if (message.type === 'code') {
          colored(message.part);
        }
      });
      port.post({ type: 'openLines', job, language, lines });
      return {
        edit: (from, removed, edited) =>
          port.post({ type: 'editLines', job, from, removed, lines: edited }),
        stop: () => {
          if (waiting.delete(job)) {
            port.post({ type: 'stop', job });
          }
        },
      };
    },
    color(sources, colored, entire, background) {
      const job = (jobs += 1);
      waiting.set(job, (message) => {
        if (message.type === 'colors') {
          colored(message.ranges, message.generations);
        } else if (message.type === 'entire') {
          entire?.(message.source, message.part, message.generation);
        }
      });
      port.post({
        type: 'color',
        job,
        sources,
        ...(background === true && { background }),
      });
      return () => {
        waiting.delete(job);
        port.post({ type: 'stop', job });
      };
    },
    colorParts,
    code(language, code, signal) {
      if (signal?.aborted) {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve) => {
        let lines: LineRanges = [];
        const stop = colorParts(language, code, (part) => {
          if (part !== undefined) {
            lines =
              part.from === 0
                ? partLines(part)
                : [...lines, ...partLines(part)];
          }
          if (part === undefined || part.done) {
            signal?.removeEventListener('abort', stopped);
            resolve(part === undefined ? undefined : lines);
          }
        });
        const stopped = () => {
          stop();
          resolve(undefined);
        };
        signal?.addEventListener('abort', stopped, { once: true });
      });
    },
  };
}

let shared: Colorer | undefined;

export function workerPort(
  worker: Pick<Worker, 'postMessage' | 'addEventListener'>,
): SyntaxPort {
  return {
    post: (message) => worker.postMessage(message),
    listen: (received, failed) => {
      worker.addEventListener('message', (event: MessageEvent<FromSyntax>) =>
        received(event.data),
      );
      worker.addEventListener('error', (event) => {
        failed(event.error ?? new Error(event.message));
        event.preventDefault();
      });
    },
  };
}

export function colorer(): Colorer {
  shared ??= colorerOf(
    workerPort(
      new Worker(new URL('syntaxWorker.js', location.href), {
        type: 'module',
      }),
    ),
  );
  return shared;
}

export function startColorer(): void {
  colorer();
}

export function colorCode(
  language: string,
  code: string,
  signal?: AbortSignal,
): Promise<LineRanges | undefined> {
  return colorer().code(language, code, signal);
}
