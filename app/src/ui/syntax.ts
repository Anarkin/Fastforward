import type {
  FromSyntax,
  LineRanges,
  SyntaxRange,
  SyntaxSource,
  ToSyntax,
} from './syntaxEngine';

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
  code(
    language: string,
    code: string,
    signal?: AbortSignal,
  ): Promise<LineRanges | undefined>;
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
    code(language, code, signal) {
      if (signal?.aborted) {
        return Promise.resolve(undefined);
      }
      const job = (jobs += 1);
      return new Promise((resolve) => {
        const stop = () => {
          waiting.delete(job);
          port.post({ type: 'stop', job });
          resolve(undefined);
        };
        waiting.set(job, (message) => {
          if (message.type === 'code') {
            waiting.delete(job);
            signal?.removeEventListener('abort', stop);
            resolve(message.lines);
          }
        });
        signal?.addEventListener('abort', stop, { once: true });
        port.post({ type: 'code', job, language, code });
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

export function colorCode(
  language: string,
  code: string,
  signal?: AbortSignal,
): Promise<LineRanges | undefined> {
  return colorer().code(language, code, signal);
}
