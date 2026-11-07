import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { strings } from '../../../../shared/strings';
import { Commits } from './commits';
import { rememberHeads } from './merges';
import {
  serveCommitReads,
  type FromReader,
  type ToReader,
} from './commitReader';

export interface ReadOptions {
  readonly stashes?: readonly string[];
  readonly timestamped?: boolean;
  readonly tips?: Iterable<string>;
}

export interface ReadCommits {
  readonly commits: Commits;
  readonly read: number;
}

export interface CommitsReading {
  add(chunk: Uint8Array): void;
  finish(): Promise<ReadCommits>;
  drop(): void;
}

export interface CommitReads {
  readonly threaded: boolean;
  start(options?: ReadOptions): CommitsReading;
  join(top: Commits, older: Commits, dropped: number): Promise<Commits>;
}

type Send = (message: ToReader, transfer?: readonly ArrayBuffer[]) => void;

interface Answered {
  receive(message: FromReader): void;
  lost(error: Error): void;
}

interface Thread {
  readonly send: Send;
  readonly readings: Map<number, Answered>;
}

const batchBytes = 64 * 1024;

class Joining implements Answered {
  constructor(
    private readonly resolve: (commits: Commits) => void,
    private readonly reject: (error: Error) => void,
  ) {}

  receive(message: FromReader): void {
    if (message.type === 'read') {
      const commits = Commits.fromParts(message.commits);
      rememberHeads(commits, message.heads ?? []);
      this.resolve(commits);
    } else {
      this.reject(new Error(message.message));
    }
  }

  lost(error: Error): void {
    this.reject(error);
  }
}

class Reading implements CommitsReading, Answered {
  private answer:
    | {
        readonly resolve: (read: ReadCommits) => void;
        readonly reject: (error: Error) => void;
      }
    | undefined;
  private failure: Error | undefined;
  private batch: Uint8Array[] = [];
  private batched = 0;

  constructor(
    private readonly id: number,
    private readonly thread: Thread,
  ) {}

  add(chunk: Uint8Array): void {
    if (this.failure !== undefined) {
      return;
    }
    this.batch.push(chunk);
    this.batched += chunk.length;
    if (this.batched >= batchBytes) {
      this.sendBatch();
    }
  }

  finish(): Promise<ReadCommits> {
    return new Promise((resolve, reject) => {
      if (this.failure !== undefined) {
        reject(this.failure);
        return;
      }
      this.answer = { resolve, reject };
      this.sendBatch();
      this.thread.send({ type: 'finish', id: this.id });
    });
  }

  drop(): void {
    this.batch = [];
    this.batched = 0;
    this.thread.readings.delete(this.id);
    this.thread.send({ type: 'drop', id: this.id });
  }

  private sendBatch(): void {
    if (this.batched === 0) {
      return;
    }
    const chunk = new Uint8Array(this.batched);
    let at = 0;
    for (const part of this.batch) {
      chunk.set(part, at);
      at += part.length;
    }
    this.batch = [];
    this.batched = 0;
    this.thread.send({ type: 'add', id: this.id, chunk }, [chunk.buffer]);
  }

  receive(message: FromReader): void {
    if (message.type === 'read') {
      this.answer?.resolve({
        commits: Commits.fromParts(message.commits),
        read: message.read,
      });
    } else {
      this.answer?.reject(new Error(message.message));
    }
  }

  lost(error: Error): void {
    this.failure = error;
    this.answer?.reject(error);
  }
}

function inThread(receive: (message: FromReader) => void): Send {
  const toReader = new EventEmitter();
  serveCommitReads({
    postMessage: (message) => {
      const copy = structuredClone(message);
      setImmediate(() => receive(copy));
    },
    on: (event, listener) => toReader.on(event, listener),
  });
  return (message) => {
    const copy = structuredClone(message);
    setImmediate(() => toReader.emit('message', copy));
  };
}

function inWorker(
  file: string,
  receive: (message: FromReader) => void,
  lost: () => void,
): Send {
  const worker = new Worker(readFileSync(file, 'utf8'), { eval: true });
  worker.unref();
  worker.on('message', receive);
  worker.on('error', lost);
  worker.on('exit', lost);
  return (message, transfer) => worker.postMessage(message, transfer);
}

const readerFile = 'commitReader.js';

export function commitReads(folder: string): CommitReads {
  const file = join(folder, readerFile);
  const threaded = existsSync(file);
  let current: Thread | undefined;
  let lastId = 0;
  const opened = (): Thread => {
    const readings = new Map<number, Answered>();
    const receive = (message: FromReader) => {
      const answered = readings.get(message.id);
      readings.delete(message.id);
      answered?.receive(message);
    };
    const thread: Thread = {
      send: threaded
        ? inWorker(file, receive, () => {
            if (current === thread) {
              current = undefined;
            }
            const orphans = [...readings.values()];
            readings.clear();
            const error = new Error(strings.errors.commitReaderStopped);
            orphans.forEach((reading) => reading.lost(error));
          })
        : inThread(receive),
      readings,
    };
    return thread;
  };
  return {
    threaded,
    start: ({ stashes = [], timestamped = false, tips = [] } = {}) => {
      const id = ++lastId;
      current ??= opened();
      const reading = new Reading(id, current);
      current.readings.set(id, reading);
      current.send({
        type: 'start',
        id,
        stashes,
        timestamped,
        tips: [...tips],
      });
      return reading;
    },
    join: (top, older, dropped) =>
      new Promise((resolve, reject) => {
        const id = ++lastId;
        current ??= opened();
        current.readings.set(id, new Joining(resolve, reject));
        current.send({
          type: 'join',
          id,
          top: top.parts(),
          older: older.parts(),
          dropped,
        });
      }),
  };
}

let reads: CommitReads | undefined;

export function readCommits(options?: ReadOptions): CommitsReading {
  reads ??= commitReads(__dirname);
  return reads.start(options);
}

export function joinCommits(
  top: Commits,
  older: Commits,
  dropped: number,
): Promise<Commits> {
  reads ??= commitReads(__dirname);
  return reads.join(top, older, dropped);
}
