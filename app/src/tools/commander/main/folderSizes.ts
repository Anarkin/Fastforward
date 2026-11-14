import * as path from 'node:path';
import type { SizeWalk, SizeWalked, SizeWalker } from './sizeWalk';

const walksAtOnce = 4;
const foldersPerWalk = 64;

export interface FolderSize {
  readonly bytes: number;
  readonly counting: boolean;
  readonly unread: number;
}

interface Counting {
  bytes: number;
  unread: number;
  waiting: number;
}

interface Waiting {
  readonly name: string;
  readonly walk: SizeWalk;
}

export class FolderSizes {
  private readonly known = new Map<string, FolderSize>();
  private readonly unfinished = new Map<string, Counting>();
  private readonly changed = new Set<string>();
  private readonly waiting: Waiting[] = [];
  private readonly idling: (() => void)[] = [];
  private walking = 0;
  private round = new AbortController();
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly walker: SizeWalker,
    private readonly onChange: () => void,
  ) {}

  get counting(): boolean {
    return this.unfinished.size > 0;
  }

  of(name: string): FolderSize | undefined {
    return this.known.get(name);
  }

  count(names: readonly string[]): void {
    if (this.closed) {
      return;
    }
    const asked = [...new Set(names)].filter((name) => !this.known.has(name));
    for (const name of asked.toReversed()) {
      this.unfinished.set(name, { bytes: 0, unread: 0, waiting: 1 });
      this.waiting.push({
        name,
        walk: { folders: [path.join(this.root, name)], asked: true },
      });
    }
    for (const name of asked) {
      this.tell(name, { bytes: 0, counting: true, unread: 0 });
    }
    if (asked.length > 0) {
      this.onChange();
    }
    this.pump();
  }

  stop(): void {
    this.round.abort();
    this.round = new AbortController();
    this.waiting.length = 0;
    const stopped = [...this.unfinished.keys()];
    this.unfinished.clear();
    for (const name of stopped) {
      this.tell(name, undefined);
    }
    if (stopped.length > 0 && !this.closed) {
      this.onChange();
    }
    this.settle();
  }

  close(): void {
    this.closed = true;
    this.stop();
  }

  take(): string[] {
    const taken = [...this.changed];
    this.changed.clear();
    return taken;
  }

  idle(): Promise<void> {
    if (this.walking === 0 && this.waiting.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idling.push(resolve));
  }

  private tell(name: string, size: FolderSize | undefined): void {
    if (size === undefined) {
      this.known.delete(name);
    } else {
      this.known.set(name, size);
    }
    this.changed.add(name);
  }

  private pump(): void {
    while (this.walking < walksAtOnce) {
      const next = this.waiting.pop();
      if (next === undefined) {
        return;
      }
      void this.run(next, this.round.signal);
    }
  }

  private async run(waiting: Waiting, round: AbortSignal): Promise<void> {
    this.walking++;
    let walked: SizeWalked;
    try {
      walked = await this.walker.walk(waiting.walk, round);
    } catch {
      walked = {
        bytes: 0,
        unread: waiting.walk.asked ? 0 : waiting.walk.folders.length,
        unreadable: waiting.walk.asked,
        rest: [],
      };
    }
    this.walking--;
    if (!round.aborted) {
      this.took(waiting.name, walked);
    }
    this.pump();
    this.settle();
  }

  private took(name: string, walked: SizeWalked): void {
    const counting = this.unfinished.get(name);
    if (counting === undefined) {
      return;
    }
    counting.waiting--;
    if (walked.unreadable) {
      this.unfinished.delete(name);
      this.tell(name, undefined);
      this.onChange();
      return;
    }
    counting.bytes += walked.bytes;
    counting.unread += walked.unread;
    const { rest } = walked;
    const each = Math.min(
      foldersPerWalk,
      Math.max(1, Math.ceil(rest.length / walksAtOnce)),
    );
    for (let from = 0; from < rest.length; from += each) {
      counting.waiting++;
      this.waiting.push({
        name,
        walk: { folders: rest.slice(from, from + each), asked: false },
      });
    }
    const done = counting.waiting === 0;
    if (done) {
      this.unfinished.delete(name);
    }
    this.tell(name, {
      bytes: counting.bytes,
      counting: !done,
      unread: counting.unread,
    });
    this.onChange();
  }

  private settle(): void {
    if (this.walking > 0 || this.waiting.length > 0) {
      return;
    }
    for (const resolve of this.idling.splice(0)) {
      resolve();
    }
  }
}
