import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Entry, FlatFolder, FlatProgress } from '../shared/protocol';

const readAtOnce = 8;

interface Read {
  readonly files: readonly Entry[];
  readonly folders: ReadonlyMap<string, boolean>;
  readonly hidden: boolean;
}

interface Waiting {
  readonly under: string;
  readonly hidden: boolean;
}

function parentUnder(under: string): string | undefined {
  if (under === '') {
    return undefined;
  }
  const at = under.lastIndexOf(path.sep, under.length - 2);
  return at === -1 ? '' : under.slice(0, at + 1);
}

function folderAt(root: string, under: string): string {
  return under === '' ? root : path.join(root, under.slice(0, -1));
}

function underOf(changed: string): string {
  const parent = path.dirname(path.normalize(changed));
  return parent === '.' || parent === '' ? '' : `${parent}${path.sep}`;
}

export class FlatTree {
  private readonly read = new Map<string, Read>();
  private readonly failed = new Set<string>();
  private readonly files = new Map<string, Entry>();
  private readonly dirty = new Set<string>();
  private readonly soon: Waiting[] = [];
  private later: Waiting[] = [];
  private laterFrom = 0;
  private readonly queued = new Set<string>();
  private readonly reading = new Map<string, { again: boolean }>();
  private readonly idling: (() => void)[] = [];
  private walked = false;
  private stopped = false;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly list: (folder: string) => Promise<readonly Entry[]>,
    private readonly onChange: () => void,
  ) {}

  get progress(): FlatProgress {
    return {
      reading: !this.walked && !this.stopped,
      stopped: this.stopped,
      folders: this.read.size,
      failed: this.failed.size,
    };
  }

  start(): void {
    this.queue({ under: '', hidden: false });
  }

  stop(): void {
    if (this.walked || this.stopped || this.closed) {
      return;
    }
    this.stopped = true;
    this.forget();
    this.changedNow();
    this.settle();
  }

  close(): void {
    this.closed = true;
    this.forget();
    this.settle();
  }

  changed(changed: string): void {
    const under = underOf(changed);
    const reading = this.reading.get(under);
    if (reading !== undefined) {
      reading.again = true;
      return;
    }
    const known = this.read.get(under);
    if (known !== undefined) {
      this.queue({ under, hidden: known.hidden }, true);
    }
  }

  changedAll(): void {
    for (const [under, read] of this.read) {
      this.queue({ under, hidden: read.hidden }, true);
    }
  }

  file(key: string): Entry | undefined {
    return this.files.get(key);
  }

  get filesRead(): ReadonlyMap<string, Entry> {
    return this.files;
  }

  take(): FlatFolder[] {
    const taken = [...this.dirty].map((under) => ({
      under,
      entries: this.read.get(under)?.files ?? [],
    }));
    this.dirty.clear();
    return taken;
  }

  resend(): void {
    for (const under of this.read.keys()) {
      this.dirty.add(under);
    }
  }

  idle(): Promise<void> {
    if (this.reading.size === 0 && this.queued.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idling.push(resolve));
  }

  private queue(waiting: Waiting, first = false): void {
    if (this.closed) {
      return;
    }
    const reading = this.reading.get(waiting.under);
    if (reading !== undefined) {
      reading.again = true;
      return;
    }
    if (this.queued.has(waiting.under)) {
      return;
    }
    this.queued.add(waiting.under);
    (first ? this.soon : this.later).push(waiting);
    this.pump();
  }

  private next(): Waiting | undefined {
    const soon = this.soon.shift();
    if (soon !== undefined) {
      return soon;
    }
    const later = this.later[this.laterFrom];
    if (later === undefined) {
      return undefined;
    }
    this.laterFrom++;
    if (this.laterFrom * 2 > this.later.length) {
      this.later = this.later.slice(this.laterFrom);
      this.laterFrom = 0;
    }
    return later;
  }

  private forget(): void {
    this.soon.length = 0;
    this.later = [];
    this.laterFrom = 0;
    this.queued.clear();
  }

  private pump(): void {
    while (this.reading.size < readAtOnce) {
      const next = this.next();
      if (next === undefined) {
        return;
      }
      this.queued.delete(next.under);
      void this.readFolder(next);
    }
  }

  private async readFolder({ under, hidden }: Waiting): Promise<void> {
    const reading = { again: false };
    this.reading.set(under, reading);
    let entries: readonly Entry[] | undefined;
    try {
      entries = await this.list(folderAt(this.root, under));
    } catch {
      entries = undefined;
    }
    this.reading.delete(under);
    if (!this.closed && this.stillListed(under)) {
      if (entries === undefined) {
        this.unread(under);
      } else {
        this.readAs(under, hidden, entries);
      }
      if (reading.again) {
        this.queue({ under, hidden }, true);
      }
    }
    this.pump();
    this.settle();
  }

  private stillListed(under: string): boolean {
    const parent = parentUnder(under);
    return (
      parent === undefined || this.read.get(parent)?.folders.has(under) === true
    );
  }

  private unread(under: string): void {
    if (this.read.has(under)) {
      this.drop(under);
    } else if (!this.stopped) {
      this.failed.add(under);
    }
    this.changedNow();
  }

  private readAs(
    under: string,
    hidden: boolean,
    entries: readonly Entry[],
  ): void {
    const before = this.read.get(under);
    if (before === undefined && this.stopped) {
      return;
    }
    const files: Entry[] = [];
    const folders = new Map<string, boolean>();
    for (const entry of entries) {
      if (!entry.folder) {
        files.push(hidden && !entry.hidden ? { ...entry, hidden } : entry);
      } else if (!entry.link) {
        folders.set(`${under}${entry.name}${path.sep}`, hidden || entry.hidden);
      }
    }
    if (
      before?.hidden === hidden &&
      isDeepStrictEqual(before.files, files) &&
      isDeepStrictEqual(before.folders, folders)
    ) {
      return;
    }
    for (const file of before?.files ?? []) {
      this.files.delete(`${under}${file.name}`);
    }
    for (const file of files) {
      this.files.set(`${under}${file.name}`, file);
    }
    for (const folder of before?.folders.keys() ?? []) {
      if (!folders.has(folder)) {
        this.drop(folder);
      }
    }
    this.read.set(under, { files, folders, hidden });
    this.failed.delete(under);
    this.dirty.add(under);
    if (!this.stopped) {
      for (const [folder, hiddenFolder] of folders) {
        if (!this.read.has(folder) && !this.failed.has(folder)) {
          this.queue({ under: folder, hidden: hiddenFolder });
        }
      }
    }
    this.changedNow();
  }

  private drop(under: string): void {
    const read = this.read.get(under);
    for (const folder of read?.folders.keys() ?? []) {
      this.drop(folder);
    }
    for (const file of read?.files ?? []) {
      this.files.delete(`${under}${file.name}`);
    }
    if (read !== undefined) {
      this.read.delete(under);
      this.dirty.add(under);
    }
    this.failed.delete(under);
  }

  private settle(): void {
    if (this.reading.size > 0 || this.queued.size > 0) {
      return;
    }
    if (!this.walked && !this.closed) {
      this.walked = true;
      this.changedNow();
    }
    for (const resolve of this.idling.splice(0)) {
      resolve();
    }
  }

  private changedNow(): void {
    if (!this.closed) {
      this.onChange();
    }
  }
}
