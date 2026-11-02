import type { Readable } from 'node:stream';
import { strings } from '../../../../shared/strings';
import type { GitChild } from './spawnedGit';

export class StoppedReading extends Error {}

export class GitOutput {
  private chunks: Buffer[] = [];
  private length = 0;
  private wake: (() => void) | undefined;
  private ended: Error | undefined;

  constructor(stream: Readable) {
    stream.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.length += chunk.length;
      this.wake?.();
    });
    const end = () => this.end(new Error(strings.errors.keptGitEnded));
    stream.on('end', end);
    stream.on('close', end);
    stream.on('error', end);
  }

  end(error: Error): void {
    this.ended ??= error;
    this.wake?.();
  }

  async until(byte: number): Promise<Buffer> {
    for (;;) {
      const joined = this.joined();
      const at = joined.indexOf(byte);
      if (at !== -1) {
        this.keep(joined.subarray(at + 1));
        return joined.subarray(0, at);
      }
      await this.more();
    }
  }

  async take(count: number): Promise<Buffer> {
    while (this.length < count) {
      await this.more();
    }
    const joined = this.joined();
    this.keep(joined.subarray(count));
    return joined.subarray(0, count);
  }

  async peek(count: number): Promise<Buffer> {
    while (this.length < count) {
      await this.more();
    }
    return this.joined().subarray(0, count);
  }

  async streamUntil(
    sequence: Buffer,
    onPart: (part: Buffer) => boolean,
  ): Promise<void> {
    for (;;) {
      const joined = this.joined();
      const at = joined.indexOf(sequence);
      if (at !== -1) {
        this.keep(joined.subarray(at + sequence.length));
        if (at > 0 && onPart(joined.subarray(0, at))) {
          throw new StoppedReading();
        }
        return;
      }
      const safe = joined.length - (sequence.length - 1);
      if (safe > 0) {
        this.keep(joined.subarray(safe));
        if (onPart(joined.subarray(0, safe))) {
          throw new StoppedReading();
        }
      }
      await this.more();
    }
  }

  private joined(): Buffer {
    const joined =
      this.chunks.length === 1 && this.chunks[0] !== undefined
        ? this.chunks[0]
        : Buffer.concat(this.chunks);
    this.chunks = [joined];
    return joined;
  }

  private keep(rest: Buffer): void {
    this.chunks = rest.length === 0 ? [] : [rest];
    this.length = rest.length;
  }

  private more(): Promise<void> {
    if (this.ended !== undefined) {
      return Promise.reject(this.ended);
    }
    return new Promise((resolve) => {
      this.wake = () => {
        this.wake = undefined;
        resolve();
      };
    });
  }
}

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

  idleFor(now = Date.now()): number {
    return this.pending > 0 ? 0 : now - this.lastAnswered;
  }

  request<T>(
    input: string,
    read: (output: GitOutput) => Promise<T>,
    timeout = keptGitTimeout,
  ): Promise<T> {
    this.pending += 1;
    const answered = this.queue.then(async () => {
      if (!this.alive) {
        throw new Error(strings.errors.keptGitEnded);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          this.stop();
          reject(new Error(strings.errors.keptGitTimedOut));
        }, timeout);
      });
      try {
        this.child.stdin.write(input);
        return await Promise.race([read(this.output), late]);
      } catch (error) {
        this.stop();
        throw error;
      } finally {
        clearTimeout(timer);
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
const mostKeptGits = 8;

interface Kept {
  readonly cwd: string;
  readonly git: Promise<KeptGit | undefined>;
  idle: ReturnType<typeof setTimeout> | undefined;
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

  async use(
    gitPath: string,
    cwd: string,
    args: readonly string[],
  ): Promise<KeptGit | undefined> {
    if (!this.enabled()) {
      this.stopAll();
      return undefined;
    }
    const key = [gitPath, cwd, ...args].join('\0');
    let kept = this.kept.get(key);
    const git = await kept?.git;
    if (kept !== undefined && git?.running !== true) {
      this.forget(key);
      kept = undefined;
    }
    if (kept === undefined) {
      kept = {
        cwd,
        git: this.start(gitPath, cwd, args).then(
          (child) => new KeptGit(child),
          () => undefined,
        ),
        idle: undefined,
      };
    } else {
      this.kept.delete(key);
    }
    this.kept.set(key, kept);
    this.stopWhenIdle(key, kept, this.idle);
    while (this.kept.size > this.most) {
      const [oldest] = this.kept.keys();
      if (oldest === undefined) {
        break;
      }
      this.forget(oldest);
    }
    return kept.git;
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
