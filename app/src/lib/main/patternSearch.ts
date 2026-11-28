import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { appFs } from './appFiles';
import { matchesFilter, searchFilter } from '../shared/filter';
import { matchesIn, type FindRange } from '../shared/textMatches';
import type { SearchOptions } from '../shared/searchOptions';

export type PatternAsk =
  | {
      readonly kind: 'ranges';
      readonly texts: readonly string[];
      readonly query: string;
      readonly options: SearchOptions;
    }
  | {
      readonly kind: 'filter';
      readonly fields: readonly (readonly string[])[];
      readonly query: string;
      readonly options: SearchOptions;
    };

type PatternAnswer =
  | { readonly kind: 'ranges'; readonly ranges: FindRange[][] }
  | { readonly kind: 'filter'; readonly matched: boolean[] };

type Searched<Found> = Found | 'slow' | 'stopped';

export interface PatternSearch {
  readonly ranges: (
    texts: readonly string[],
    query: string,
    options: SearchOptions,
    signal?: AbortSignal,
  ) => Promise<Searched<FindRange[][]>>;
  readonly matching: (
    fields: readonly (readonly string[])[],
    query: string,
    options: SearchOptions,
    signal?: AbortSignal,
  ) => Promise<Searched<boolean[]>>;
  readonly close: () => void;
}

const patternBudgetMillis = 3000;

export function answerTo(ask: PatternAsk): PatternAnswer {
  if (ask.kind === 'ranges') {
    return {
      kind: 'ranges',
      ranges: ask.texts.map((text) => matchesIn(text, ask.query, ask.options)),
    };
  }
  const filter = searchFilter(ask.query, ask.options);
  return {
    kind: 'filter',
    matched: ask.fields.map((texts) => matchesFilter(filter, ...texts)),
  };
}

type Ask = (
  ask: PatternAsk,
  signal: AbortSignal | undefined,
) => Promise<Searched<PatternAnswer>>;

const rangesOf = (answer: Searched<PatternAnswer>): Searched<FindRange[][]> =>
  typeof answer === 'string'
    ? answer
    : answer.kind === 'ranges'
      ? answer.ranges
      : 'stopped';

const matchedOf = (answer: Searched<PatternAnswer>): Searched<boolean[]> =>
  typeof answer === 'string'
    ? answer
    : answer.kind === 'filter'
      ? answer.matched
      : 'stopped';

const answered: Ask = async (ask, signal) =>
  signal?.aborted === true ? 'stopped' : answerTo(ask);

function searchOf(asked: Ask, close: () => void): PatternSearch {
  const by = (options: SearchOptions) => (options.regex ? asked : answered);
  return {
    ranges: (texts, query, options, signal) =>
      by(options)({ kind: 'ranges', texts, query, options }, signal).then(
        rangesOf,
      ),
    matching: (fields, query, options, signal) =>
      by(options)({ kind: 'filter', fields, query, options }, signal).then(
        matchedOf,
      ),
    close,
  };
}

export const inThread: PatternSearch = searchOf(answered, () => undefined);

interface Asked {
  readonly ask: PatternAsk;
  readonly signal: AbortSignal | undefined;
  readonly answered: (answer: Searched<PatternAnswer>) => void;
}

export function patternWorker(
  folder: string,
  budget = patternBudgetMillis,
): PatternSearch {
  const file = path.join(folder, 'patternWorker.js');
  if (!appFs.existsSync(file)) {
    return inThread;
  }
  let code: string | undefined;
  let worker: Worker | undefined;
  let running: Asked | undefined;
  let timer: NodeJS.Timeout | undefined;
  const queue: Asked[] = [];

  const ended = (answer: Searched<PatternAnswer>, terminate: boolean) => {
    clearTimeout(timer);
    const was = running;
    running = undefined;
    if (terminate && worker !== undefined) {
      void worker.terminate();
      worker = undefined;
    }
    was?.signal?.removeEventListener('abort', onAbort);
    was?.answered(answer);
    next();
  };

  function onAbort() {
    ended('stopped', true);
  }

  const started = (): Worker => {
    code ??= appFs.readFileSync(file, 'utf8');
    const made = new Worker(code, { eval: true });
    made.unref();
    made.on('message', (answer: PatternAnswer) => {
      if (worker === made) {
        ended(answer, false);
      }
    });
    const lost = () => {
      if (worker === made) {
        worker = undefined;
        ended('stopped', false);
      }
    };
    made.on('error', lost);
    made.on('exit', lost);
    return made;
  };

  function next() {
    if (running !== undefined) {
      return;
    }
    for (
      let waiting = queue.shift();
      waiting !== undefined;
      waiting = queue.shift()
    ) {
      if (waiting.signal?.aborted === true) {
        waiting.answered('stopped');
        continue;
      }
      running = waiting;
      worker ??= started();
      waiting.signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => ended('slow', true), budget);
      worker.postMessage(waiting.ask);
      return;
    }
  }

  return searchOf(
    (ask, signal) =>
      new Promise((resolve) => {
        queue.push({ ask, signal, answered: resolve });
        next();
      }),
    () => {
      for (const each of queue.splice(0)) {
        each.answered('stopped');
      }
      if (running !== undefined) {
        ended('stopped', true);
      }
      void worker?.terminate();
      worker = undefined;
    },
  );
}
