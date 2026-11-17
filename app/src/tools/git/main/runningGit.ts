import { strings } from '../../../lib/shared/strings';
import { GitOutput } from './gitOutput';
import type { GitChild } from './spawnedGit';

const keptGitTimeout = 30_000;

export class KeptGit {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly output: GitOutput;
  private alive = true;
  private pending = 0;
  private lastAnswered = Date.now();

  constructor(private readonly child: GitChild) {
    this.output = new GitOutput(child.stdout);
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    const ended = () => {
      this.alive = false;
      this.output.end(new Error(strings.errors.keptGitEnded));
    };
    child.on('close', ended);
    child.on('error', ended);
  }

  get running(): boolean {
    return this.alive;
  }

  get answering(): boolean {
    return this.pending > 0;
  }

  idleFor(now = Date.now()): number {
    return this.pending > 0 ? 0 : now - this.lastAnswered;
  }

  request<T>(
    input: string,
    read: (output: GitOutput) => Promise<T>,
    {
      signal,
      timeout = keptGitTimeout,
    }: {
      readonly signal?: AbortSignal;
      readonly timeout?: number | false;
    } = {},
  ): Promise<T> {
    this.pending += 1;
    const answered = this.queue.then(async () => {
      signal?.throwIfAborted();
      if (!this.alive) {
        throw new Error(strings.errors.keptGitEnded);
      }
      const { promise: late, reject } = Promise.withResolvers<never>();
      const timer =
        timeout === false
          ? undefined
          : setTimeout(() => {
              this.stop();
              reject(new Error(strings.errors.keptGitTimedOut));
            }, timeout);
      const stopped = () => {
        this.stop();
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', stopped, { once: true });
      try {
        this.child.stdin.write(input);
        return await Promise.race([read(this.output), late]);
      } catch (error) {
        this.stop();
        throw signal?.aborted === true ? signal.reason : error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stopped);
      }
    });
    this.queue = answered.catch(() => undefined);
    void this.queue.then(() => {
      this.pending -= 1;
      this.lastAnswered = Date.now();
    });
    return answered;
  }

  stop(): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.output.end(new Error(strings.errors.keptGitEnded));
    this.child.stdin.end();
    void this.child.stop();
  }
}

const keptGitIdle = 30_000;
const mostKeptGits = 16;

interface Kept {
  readonly cwd: string;
  readonly git: Promise<KeptGit | undefined>;
  started: KeptGit | undefined;
  failed: boolean;
  idle: ReturnType<typeof setTimeout> | undefined;
}

function gone(kept: Kept): boolean {
  return kept.failed || kept.started?.running === false;
}

function busy(kept: Kept): boolean {
  return !kept.failed && kept.started?.answering !== false;
}

export class KeptGits {
  private readonly kept = new Map<string, Kept>();

  constructor(
    private readonly start: (
      gitPath: string,
      cwd: string,
      args: readonly string[],
    ) => Promise<GitChild>,
    private readonly enabled: () => boolean = () => true,
    private readonly idle = keptGitIdle,
    private readonly most = mostKeptGits,
  ) {}

  get count(): number {
    return this.kept.size;
  }

  update(): void {
    if (!this.enabled()) {
      this.stopAll();
    }
  }

  use(
    gitPath: string,
    cwd: string,
    args: readonly string[],
    asOf = '',
  ): Promise<KeptGit | undefined> {
    if (!this.enabled()) {
      this.stopAll();
      return Promise.resolve(undefined);
    }
    const key = [gitPath, cwd, asOf, ...args].join('\0');
    let kept = this.kept.get(key);
    if (kept !== undefined && gone(kept)) {
      this.forget(key);
      kept = undefined;
    }
    if (kept === undefined) {
      kept = this.started(gitPath, cwd, args);
    } else {
      this.kept.delete(key);
    }
    this.kept.set(key, kept);
    this.stopWhenIdle(key, kept, this.idle);
    this.keepAtMost(key);
    return kept.git;
  }

  private started(gitPath: string, cwd: string, args: readonly string[]): Kept {
    const kept: Kept = {
      cwd,
      git: this.start(gitPath, cwd, args).then(
        (child) => {
          kept.started = new KeptGit(child);
          return kept.started;
        },
        () => {
          kept.failed = true;
          return undefined;
        },
      ),
      started: undefined,
      failed: false,
      idle: undefined,
    };
    return kept;
  }

  private keepAtMost(used: string): void {
    for (const [key, kept] of this.kept) {
      if (this.kept.size <= this.most) {
        return;
      }
      if (key !== used && !busy(kept)) {
        this.forget(key);
      }
    }
  }

  private stopWhenIdle(key: string, kept: Kept, wait: number): void {
    clearTimeout(kept.idle);
    kept.idle = setTimeout(() => {
      if (this.kept.get(key) !== kept) {
        return;
      }
      void kept.git.then((git) => {
        const idle = git?.idleFor() ?? this.idle;
        if (this.kept.get(key) !== kept) {
          return;
        }
        if (idle >= this.idle) {
          this.forget(key);
        } else {
          this.stopWhenIdle(key, kept, this.idle - idle);
        }
      });
    }, wait);
    kept.idle.unref?.();
  }

  stopAll(): void {
    for (const key of this.kept.keys()) {
      this.forget(key);
    }
  }

  stopIn(cwd: string): void {
    for (const [key, kept] of this.kept) {
      if (kept.cwd === cwd) {
        this.forget(key);
      }
    }
  }

  private forget(key: string): void {
    const kept = this.kept.get(key);
    if (kept === undefined) {
      return;
    }
    this.kept.delete(key);
    clearTimeout(kept.idle);
    void kept.git.then((git) => git?.stop());
  }
}
