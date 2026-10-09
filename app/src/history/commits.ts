import type { HistoryEntry } from '../git/history';

export class Commits {
  constructor(
    readonly length: number,
    readonly starts: Int32Array,
    readonly parents: Int32Array,
    private readonly hashes: HashTable,
    readonly times?: Int32Array,
  ) {}

  static replacingTop(top: Commits, older: Commits, dropped: number): Commits {
    const count = top.length;
    const hashes = HashTable.replacingTop(
      top.hashes,
      count,
      older.hashes,
      dropped,
    );
    const index = new Int32Array(top.size);
    for (let at = 0; at < top.size; at++) {
      if (at < count) {
        index[at] = at;
      } else {
        const bytes = top.hashes.bytesOf(at);
        index[at] =
          hashes.findBytes(bytes, 0, bytes.length) ??
          hashes.add(bytes, 0, bytes.length);
      }
    }
    hashes.trim();
    const shift = top.parents.length - older.starts[dropped];
    const kept = older.length - dropped;
    const starts = new Int32Array(count + kept + 1);
    starts.set(top.starts.subarray(0, count));
    for (let at = 0; at <= kept; at++) {
      starts[count + at] = older.starts[dropped + at] + shift;
    }
    const parents = new Int32Array(starts[count + kept]);
    for (let parent = 0; parent < top.parents.length; parent++) {
      parents[parent] = index[top.parents[parent]];
    }
    const moved = count - dropped;
    for (
      let parent = older.starts[dropped];
      parent < older.parents.length;
      parent++
    ) {
      parents[parent + shift] = older.parents[parent] + moved;
    }
    return new Commits(count + kept, starts, parents, hashes);
  }

  static of(entries: readonly HistoryEntry[]): Commits {
    const builder = new CommitsBuilder();
    for (const { hash, parents } of entries) {
      builder.add(Buffer.from(`${[hash, ...parents].join(' ')}\n`, 'latin1'));
    }
    return builder.finishNow();
  }

  get size(): number {
    return this.hashes.size;
  }

  indexOf(hash: string): number | undefined {
    return this.hashes.find(hash);
  }

  has(hash: string): boolean {
    const at = this.hashes.find(hash);
    return at !== undefined && at < this.length;
  }

  hashAt(at: number): string {
    return this.hashes.hashAt(at);
  }
}

class HashTable {
  private bytes = new Uint8Array(1024);
  private used = 0;
  private offsets = new Int32Array(64);
  private slots = new Int32Array(128);
  size = 0;

  static replacingTop(
    top: HashTable,
    count: number,
    older: HashTable,
    dropped: number,
  ): HashTable {
    const table = new HashTable();
    const topUsed = top.offsets[count];
    const olderFrom = older.offsets[dropped];
    table.used = topUsed + older.used - olderFrom;
    table.bytes = new Uint8Array(table.used);
    table.bytes.set(top.bytes.subarray(0, topUsed));
    table.bytes.set(older.bytes.subarray(olderFrom, older.used), topUsed);
    table.size = count + older.size - dropped;
    table.offsets = new Int32Array(table.size + 1);
    table.offsets.set(top.offsets.subarray(0, count));
    for (let at = dropped; at <= older.size; at++) {
      table.offsets[count + at - dropped] =
        older.offsets[at] - olderFrom + topUsed;
    }
    if (table.size * 2 <= older.slots.length) {
      table.slots = older.slots.slice();
      const emptied: number[] = [];
      for (let slot = 0; slot < table.slots.length; slot++) {
        const value = table.slots[slot];
        if (value === 0) {
          continue;
        }
        if (value - 1 < dropped) {
          table.slots[slot] = 0;
          emptied.push(slot);
        } else {
          table.slots[slot] = value - dropped + count;
        }
      }
      for (const slot of emptied) {
        table.closeGap(slot);
      }
      for (let at = 0; at < count; at++) {
        table.place(at);
      }
    } else {
      let slots = older.slots.length;
      while (table.size * 2 > slots) {
        slots *= 2;
      }
      table.slots = new Int32Array(slots);
      for (let at = 0; at < table.size; at++) {
        table.place(at);
      }
    }
    return table;
  }

  bytesOf(at: number): Uint8Array {
    return this.bytes.subarray(this.offsets[at], this.offsets[at + 1]);
  }

  add(source: Uint8Array, start: number, end: number): number {
    const length = end - start;
    while (this.used + length > this.bytes.length) {
      this.bytes = grownBytes(this.bytes);
    }
    this.bytes.set(source.subarray(start, end), this.used);
    if (this.size + 2 > this.offsets.length) {
      this.offsets = grownInts(this.offsets);
    }
    this.offsets[this.size] = this.used;
    this.used += length;
    this.offsets[this.size + 1] = this.used;
    const at = this.size++;
    if (this.size * 2 > this.slots.length) {
      this.rehash();
    } else {
      this.place(at);
    }
    return at;
  }

  findBytes(
    source: Uint8Array,
    start: number,
    end: number,
  ): number | undefined {
    const mask = this.slots.length - 1;
    for (
      let slot = hashBytes(source, start, end) & mask;
      this.slots[slot] !== 0;
      slot = (slot + 1) & mask
    ) {
      const at = this.slots[slot] - 1;
      if (this.matches(at, source, start, end)) {
        return at;
      }
    }
    return undefined;
  }

  find(hash: string): number | undefined {
    const source = Buffer.from(hash, 'latin1');
    return this.findBytes(source, 0, source.length);
  }

  trim(): void {
    this.bytes = this.bytes.slice(0, this.used);
    this.offsets = this.offsets.slice(0, this.size + 1);
  }

  hashAt(at: number): string {
    return Buffer.from(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offsets[at],
      this.offsets[at + 1] - this.offsets[at],
    ).toString('latin1');
  }

  private matches(
    at: number,
    source: Uint8Array,
    start: number,
    end: number,
  ): boolean {
    const from = this.offsets[at];
    if (this.offsets[at + 1] - from !== end - start) {
      return false;
    }
    for (let index = start; index < end; index++) {
      if (this.bytes[from + index - start] !== source[index]) {
        return false;
      }
    }
    return true;
  }

  private place(at: number): void {
    const mask = this.slots.length - 1;
    let slot =
      hashBytes(this.bytes, this.offsets[at], this.offsets[at + 1]) & mask;
    while (this.slots[slot] !== 0) {
      slot = (slot + 1) & mask;
    }
    this.slots[slot] = at + 1;
  }

  private closeGap(emptied: number): void {
    const mask = this.slots.length - 1;
    for (
      let slot = (emptied + 1) & mask;
      this.slots[slot] !== 0;
      slot = (slot + 1) & mask
    ) {
      const value = this.slots[slot];
      this.slots[slot] = 0;
      this.place(value - 1);
    }
  }

  private rehash(): void {
    this.slots = new Int32Array(this.slots.length * 2);
    for (let at = 0; at < this.size; at++) {
      this.place(at);
    }
  }
}

function hashBytes(source: Uint8Array, start: number, end: number): number {
  let hash = 0x811c9dc5;
  for (let index = start; index < Math.min(end, start + 16); index++) {
    hash = Math.imul(hash ^ source[index], 0x01000193);
  }
  return hash >>> 0;
}

function grownBytes(array: Uint8Array): Uint8Array<ArrayBuffer> {
  const bigger = new Uint8Array(array.length * 2);
  bigger.set(array);
  return bigger;
}

function grownInts(array: Int32Array): Int32Array<ArrayBuffer> {
  const bigger = new Int32Array(array.length * 2);
  bigger.set(array);
  return bigger;
}

const space = 0x20;
const newline = 0x0a;

export class CommitsBuilder {
  read = 0;
  private readonly hashes = new HashTable();
  private starts = new Int32Array(64);
  private parentBytes = new Uint8Array(1024);
  private parentUsed = 0;
  private parentOffsets = new Int32Array(64);
  private parentCount = 0;
  private count = 0;
  private pending = new Uint8Array(0);
  private readonly stashes: ReadonlySet<string>;
  private readonly hidden = new Set<string>();
  private times = new Int32Array(64);

  constructor(
    stashes: readonly string[] = [],
    private readonly timestamped = false,
  ) {
    this.stashes = new Set(stashes);
  }

  add(chunk: Uint8Array): void {
    const text =
      this.pending.length === 0 ? chunk : concatenated(this.pending, chunk);
    let start = 0;
    for (
      let end = text.indexOf(newline);
      end !== -1;
      end = text.indexOf(newline, start)
    ) {
      this.addLine(text, start, end);
      start = end + 1;
    }
    this.pending = new Uint8Array(text.subarray(start));
  }

  async finish(sliceTime = 10): Promise<Commits> {
    this.end();
    const parents = new Int32Array(this.parentCount);
    let at = 0;
    while (at < this.parentCount) {
      const until = performance.now() + sliceTime;
      do {
        const to = Math.min(at + resolvedAtOnce, this.parentCount);
        this.resolve(parents, at, to);
        at = to;
      } while (at < this.parentCount && performance.now() < until);
      if (at < this.parentCount) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    return this.built(parents);
  }

  finishNow(): Commits {
    this.end();
    const parents = new Int32Array(this.parentCount);
    this.resolve(parents, 0, this.parentCount);
    return this.built(parents);
  }

  private end(): void {
    if (this.pending.length > 0) {
      this.addLine(this.pending, 0, this.pending.length);
      this.pending = new Uint8Array(0);
    }
  }

  private built(parents: Int32Array): Commits {
    const starts = this.starts.slice(0, this.count + 1);
    starts[this.count] = this.parentCount;
    this.parentBytes = new Uint8Array(0);
    this.parentOffsets = new Int32Array(0);
    this.hashes.trim();
    return new Commits(
      this.count,
      starts,
      parents,
      this.hashes,
      this.timestamped ? this.times.slice(0, this.count) : undefined,
    );
  }

  private resolve(parents: Int32Array, from: number, to: number): void {
    for (let index = from; index < to; index++) {
      const start = this.parentOffsets[index];
      const end =
        index + 1 < this.parentCount
          ? this.parentOffsets[index + 1]
          : this.parentUsed;
      parents[index] =
        this.hashes.findBytes(this.parentBytes, start, end) ??
        this.hashes.add(this.parentBytes, start, end);
    }
  }

  private addLine(text: Uint8Array, start: number, end: number): void {
    if (end > start && text[end - 1] === 0x0d) {
      end--;
    }
    if (end === start) {
      return;
    }
    this.read++;
    let time = 0;
    if (this.timestamped) {
      for (; start < end && text[start] !== space; start++) {
        time = time * 10 + text[start] - 0x30;
      }
      start++;
    }
    let hashEnd = text.indexOf(space, start);
    if (hashEnd === -1 || hashEnd > end) {
      hashEnd = end;
    }
    let keptParents = Infinity;
    if (this.stashes.size > 0 || this.hidden.size > 0) {
      const hash = Buffer.from(
        text.buffer,
        text.byteOffset + start,
        hashEnd - start,
      ).toString('latin1');
      if (this.hidden.has(hash)) {
        return;
      }
      if (this.stashes.has(hash)) {
        keptParents = 1;
        const parents = Buffer.from(
          text.buffer,
          text.byteOffset + hashEnd,
          end - hashEnd,
        )
          .toString('latin1')
          .split(' ')
          .filter(Boolean);
        for (const parent of parents.slice(1)) {
          this.hidden.add(parent);
        }
      }
    }
    this.hashes.add(text, start, hashEnd);
    if (this.count + 2 > this.starts.length) {
      this.starts = grownInts(this.starts);
      this.times = grownInts(this.times);
    }
    this.times[this.count] = time;
    this.starts[this.count++] = this.parentCount;
    let kept = 0;
    for (let from = hashEnd + 1; from < end && kept < keptParents;) {
      let to = text.indexOf(space, from);
      if (to === -1 || to > end) {
        to = end;
      }
      if (to > from) {
        this.addParent(text, from, to);
        kept++;
      }
      from = to + 1;
    }
  }

  private addParent(text: Uint8Array, start: number, end: number): void {
    const length = end - start;
    while (this.parentUsed + length > this.parentBytes.length) {
      this.parentBytes = grownBytes(this.parentBytes);
    }
    this.parentBytes.set(text.subarray(start, end), this.parentUsed);
    if (this.parentCount + 1 > this.parentOffsets.length) {
      this.parentOffsets = grownInts(this.parentOffsets);
    }
    this.parentOffsets[this.parentCount++] = this.parentUsed;
    this.parentUsed += length;
  }
}

const resolvedAtOnce = 4096;

function concatenated(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);
  return joined;
}
