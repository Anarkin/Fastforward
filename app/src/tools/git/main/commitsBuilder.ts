import { Commits } from './commits';
import {
  grownBytes,
  grownInts,
  grownTimes,
  HashTable,
  sharedInts,
  sharedTimes,
} from './hashTable';

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
  private readonly stashesThenCommitsLeftOut = new HashTable();
  private readonly stashCount: number;
  private readonly tips = new HashTable();
  private times = new Float64Array(64);

  constructor(
    stashes: readonly string[] = [],
    private readonly timestamped = false,
    tips: Iterable<string> = [],
  ) {
    for (const tip of tips) {
      this.tips.add(Buffer.from(tip, 'latin1'), 0, tip.length);
    }
    for (const stash of stashes) {
      this.addStashOrCommitLeftOut(
        Buffer.from(stash, 'latin1'),
        0,
        stash.length,
      );
    }
    this.stashCount = this.stashesThenCommitsLeftOut.size;
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
    const parents = sharedInts(this.parentCount);
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
    const parents = sharedInts(this.parentCount);
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
    const starts = sharedInts(this.count + 1);
    starts.set(this.starts.subarray(0, this.count));
    starts[this.count] = this.parentCount;
    this.parentBytes = new Uint8Array(0);
    this.parentOffsets = new Int32Array(0);
    this.hashes.share();
    const times = this.timestamped ? sharedTimes(this.count) : undefined;
    times?.set(this.times.subarray(0, this.count));
    return new Commits(this.count, starts, parents, this.hashes, times);
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
    const stashOrLeftOut =
      this.stashesThenCommitsLeftOut.size > 0
        ? this.stashesThenCommitsLeftOut.findBytes(text, start, hashEnd)
        : undefined;
    if (
      this.isLeftOutByAStash(stashOrLeftOut) &&
      this.tips.findBytes(text, start, hashEnd) === undefined
    ) {
      return;
    }
    const keptParents =
      stashOrLeftOut !== undefined && stashOrLeftOut < this.stashCount
        ? 1
        : Infinity;
    this.hashes.add(text, start, hashEnd);
    if (this.count + 2 > this.starts.length) {
      this.starts = grownInts(this.starts);
      this.times = grownTimes(this.times);
    }
    this.times[this.count] = time;
    this.starts[this.count++] = this.parentCount;
    let kept = 0;
    for (let from = hashEnd + 1; from < end;) {
      let to = text.indexOf(space, from);
      if (to === -1 || to > end) {
        to = end;
      }
      if (to > from) {
        if (kept < keptParents) {
          this.addParent(text, from, to);
          kept++;
        } else {
          this.addStashOrCommitLeftOut(text, from, to);
        }
      }
      from = to + 1;
    }
  }

  private isLeftOutByAStash(at: number | undefined): boolean {
    return at !== undefined && at >= this.stashCount;
  }

  private addStashOrCommitLeftOut(
    text: Uint8Array,
    start: number,
    end: number,
  ): void {
    if (
      this.stashesThenCommitsLeftOut.findBytes(text, start, end) === undefined
    ) {
      this.stashesThenCommitsLeftOut.add(text, start, end);
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
