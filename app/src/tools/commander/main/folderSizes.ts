import * as path from 'node:path';
import type { Entry } from '../shared/protocol';

const readAtOnce = 8;

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
  readonly folder: string;
  readonly asked: boolean;
}

export class FolderSizes {
  private readonly known = new Map<string, FolderSize>();
  private readonly unfinished = new Map<string, Counting>();
  private readonly changed = new Set<string>();
  private readonly waiting: Waiting[] = [];
  private readonly idling: (() => void)[] = [];
  private reading = 0;
  private round = 0;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly list: (folder: string) => Promise<readonly Entry[]>,
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
        folder: path.join(this.root, name),
        asked: true,
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
    this.round++;
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
    if (this.reading === 0 && this.waiting.length === 0) {
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
    while (this.reading < readAtOnce) {
      const next = this.waiting.pop();
      if (next === undefined) {
        return;
      }
      void this.read(next, this.round);
    }
  }

  private async read(waiting: Waiting, round: number): Promise<void> {
    this.reading++;
    let entries: readonly Entry[] | undefined;
    try {
      entries = await this.list(waiting.folder);
    } catch {
      entries = undefined;
    }
    this.reading--;
    if (round === this.round) {
      this.took(waiting, entries);
    }
    this.pump();
    this.settle();
  }

  private took(
    { name, folder, asked }: Waiting,
    entries: readonly Entry[] | undefined,
  ): void {
    const counting = this.unfinished.get(name);
    if (counting === undefined) {
      return;
    }
    counting.waiting--;
    if (entries === undefined && asked) {
      this.unfinished.delete(name);
      this.tell(name, undefined);
      this.onChange();
      return;
    }
    if (entries === undefined) {
      counting.unread++;
    }
    for (const entry of entries ?? []) {
      if (entry.link) {
        continue;
      }
      if (entry.folder) {
        counting.waiting++;
        this.waiting.push({
          name,
          folder: path.join(folder, entry.name),
          asked: false,
        });
      } else {
        counting.bytes += entry.size ?? 0;
      }
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
    if (this.reading > 0 || this.waiting.length > 0) {
      return;
    }
    for (const resolve of this.idling.splice(0)) {
      resolve();
    }
  }
}
