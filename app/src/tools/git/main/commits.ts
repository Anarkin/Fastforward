import type { HistoryEntry } from './history';
import { CommitsBuilder } from './commitsBuilder';
import { HashTable, type HashTableParts } from './hashTable';
import { sharedInts } from './sharedArrays';

export interface CommitsParts {
  readonly length: number;
  readonly starts: Int32Array;
  readonly parents: Int32Array;
  readonly hashes: HashTableParts;
  readonly times: Float64Array | undefined;
}

export function buffersOf(parts: CommitsParts): ArrayBuffer[] {
  const { starts, parents, hashes, times } = parts;
  const buffers = [
    starts,
    parents,
    hashes.bytes,
    hashes.offsets,
    hashes.slots,
    ...(times ? [times] : []),
  ].map((array) => array.buffer);
  return [...new Set(buffers)].filter(
    (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
  );
}

export class Commits {
  constructor(
    readonly length: number,
    readonly starts: Int32Array,
    readonly parents: Int32Array,
    private readonly hashes: HashTable,
    readonly times?: Float64Array,
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
    const shift = top.parents.length - older.starts[dropped];
    const kept = older.length - dropped;
    const starts = sharedInts(count + kept + 1);
    starts.set(top.starts.subarray(0, count));
    for (let at = 0; at <= kept; at++) {
      starts[count + at] = older.starts[dropped + at] + shift;
    }
    const parents = sharedInts(starts[count + kept]);
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

  static fromParts({
    length,
    starts,
    parents,
    hashes,
    times,
  }: CommitsParts): Commits {
    return new Commits(
      length,
      starts,
      parents,
      HashTable.fromParts(hashes),
      times,
    );
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

  parts(): CommitsParts {
    return {
      length: this.length,
      starts: this.starts,
      parents: this.parents,
      hashes: this.hashes.parts(),
      times: this.times,
    };
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

  isMerge(hash: string): boolean {
    const at = this.hashes.find(hash);
    return (
      at !== undefined &&
      at < this.length &&
      this.starts[at + 1] - this.starts[at] > 1
    );
  }
}
