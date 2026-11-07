import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { strings } from '../../../../shared/strings';
import {
  serveGitSpawns,
  type FromSpawner,
  type OutputStream,
  type ToSpawner,
} from './gitSpawner';

export interface SpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly detached: boolean;
}

export class GitChild extends EventEmitter {
  pid: number | undefined;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly stdin: Writable;
  private stopping: Promise<void> | undefined;
  private endStopping: (() => void) | undefined;
  private closed = false;
  private stopped = false;

  constructor(
    private readonly id: number,
    private readonly send: (message: ToSpawner) => void,
  ) {
    super();
    this.stdout = this.output('stdout');
    this.stderr = this.output('stderr');
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        send({ type: 'input', id, data: chunk, end: false });
        done();
      },
      final: (done) => {
        send({ type: 'input', id, data: undefined, end: true });
        done();
      },
    });
  }

  stop(): Promise<void> {
    this.stopping ??= this.closed
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.endStopping = resolve;
          this.send({ type: 'stop', id: this.id });
        });
    return this.stopping;
  }

  kill(): boolean {
    void this.stop();
    return true;
  }

  get finished(): boolean {
    return this.closed && (this.stopping === undefined || this.stopped);
  }

  receive(message: FromSpawner): void {
    switch (message.type) {
      case 'spawned':
        this.pid = message.pid;
        return;
      case 'output': {
        const stream = this[message.stream];
        if (!stream.destroyed) {
          const { buffer, byteOffset, byteLength } = message.data;
          stream.push(Buffer.from(buffer, byteOffset, byteLength));
        }
        return;
      }
      case 'error':
        if (this.pid === undefined) {
          this.closed = true;
        }
        this.emit(
          'error',
          Object.assign(
            new Error(message.message),
            message.code === undefined ? {} : { code: message.code },
          ),
        );
        return;
      case 'exit':
        this.exitCode = message.code;
        this.signalCode = message.signal;
        this.emit('exit', message.code, message.signal);
        return;
      case 'close':
        this.closed = true;
        this.exitCode = message.code;
        this.signalCode = message.signal;
        for (const stream of [this.stdout, this.stderr]) {
          if (!stream.destroyed) {
            stream.push(null);
          }
        }
        setImmediate(() => this.emit('close', message.code, message.signal));
        return;
      case 'stopped':
        this.stopped = true;
        this.endStopping?.();
        return;
      default:
        message satisfies never;
    }
  }

  lost(): void {
    this.emit('error', new Error(strings.errors.gitStarterStopped));
    this.endStopping?.();
  }

  private output(stream: OutputStream): Readable {
    return new Readable({
      read: () => undefined,
      destroy: (error, done) => {
        this.send({ type: 'closeOutput', id: this.id, stream });
        done(error);
      },
    });
  }
}

interface Connection {
  readonly send: (message: ToSpawner) => void;
}

function inThread(receive: (message: FromSpawner) => void): Connection {
  const toSpawner = new EventEmitter();
  serveGitSpawns({
    postMessage: (message) => {
      const copy = structuredClone(message);
      setImmediate(() => receive(copy));
    },
    on: (event, listener) => toSpawner.on(event, listener),
  });
  return {
    send: (message) => {
      const copy = structuredClone(message);
      setImmediate(() => toSpawner.emit('message', copy));
    },
  };
}

function inWorker(
  file: string,
  receive: (message: FromSpawner) => void,
  lost: () => void,
): Connection {
  const worker = new Worker(readFileSync(file, 'utf8'), { eval: true });
  worker.unref();
  worker.on('message', receive);
  worker.on('error', lost);
  worker.on('exit', lost);
  return { send: (message) => worker.postMessage(message) };
}

export interface GitStarter {
  readonly threaded: boolean;
  spawn(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ): GitChild;
}

const starterFile = 'gitSpawner.js';

const mostThreads = 4;

export function threadFor(starting: readonly number[], most: number): number {
  const idle = starting.indexOf(0);
  if (idle !== -1) {
    return idle;
  }
  if (starting.length < most) {
    return starting.length;
  }
  return starting.indexOf(Math.min(...starting));
}

interface Thread {
  readonly connection: Connection;
  readonly children: Map<number, GitChild>;
  readonly starting: Set<number>;
}

export function gitStarter(folder: string): GitStarter {
  const file = join(folder, starterFile);
  const threaded = existsSync(file);
  const threads: Thread[] = [];
  let lastId = 0;
  const opened = (): Thread => {
    const children = new Map<number, GitChild>();
    const starting = new Set<number>();
    const receive = (message: FromSpawner) => {
      if (message.type === 'spawned' || message.type === 'error') {
        starting.delete(message.id);
      }
      const child = children.get(message.id);
      child?.receive(message);
      if (child?.finished === true) {
        children.delete(message.id);
      }
    };
    const thread: Thread = {
      connection: threaded
        ? inWorker(file, receive, () => {
            const at = threads.indexOf(thread);
            if (at === -1) {
              return;
            }
            threads.splice(at, 1);
            const orphans = [...children.values()];
            children.clear();
            orphans.forEach((child) => child.lost());
          })
        : inThread(receive),
      children,
      starting,
    };
    return thread;
  };
  const chosen = (): Thread => {
    const index = threadFor(
      threads.map((thread) => thread.starting.size),
      threaded ? mostThreads : 1,
    );
    const known = threads[index];
    if (known !== undefined) {
      return known;
    }
    const thread = opened();
    threads.push(thread);
    return thread;
  };
  return {
    threaded,
    spawn: (command, args, { cwd, env, detached }) => {
      const id = ++lastId;
      const thread = chosen();
      const { send } = thread.connection;
      const child = new GitChild(id, send);
      thread.children.set(id, child);
      thread.starting.add(id);
      send({ type: 'spawn', id, command, args, cwd, env, detached });
      return child;
    },
  };
}

let starter: GitStarter | undefined;

export function spawnGit(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): GitChild {
  starter ??= gitStarter(__dirname);
  return starter.spawn(command, args, options);
}
