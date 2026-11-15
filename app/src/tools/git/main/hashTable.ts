import { grownBytes, grownInts, sharedBytes, sharedInts } from './sharedArrays';

export interface HashTableParts {
  readonly bytes: Uint8Array;
  readonly offsets: Int32Array;
  readonly slots: Int32Array;
  readonly size: number;
}

export class HashTable {
  private bytes: Uint8Array = new Uint8Array(1024);
  private used = 0;
  private offsets: Int32Array = new Int32Array(64);
  private slots: Int32Array = new Int32Array(128);
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
    const spareBytes = top.used - topUsed;
    const spareHashes = top.size - count;
    table.used = topUsed + older.used - olderFrom;
    table.bytes = sharedBytes(table.used + spareBytes);
    table.bytes.set(top.bytes.subarray(0, topUsed));
    table.bytes.set(older.bytes.subarray(olderFrom, older.used), topUsed);
    table.size = count + older.size - dropped;
    table.offsets = sharedInts(table.size + spareHashes + 1);
    table.offsets.set(top.offsets.subarray(0, count));
    for (let at = dropped; at <= older.size; at++) {
      table.offsets[count + at - dropped] =
        older.offsets[at] - olderFrom + topUsed;
    }
    const most = table.size + spareHashes;
    if (most * 2 <= older.slots.length) {
      const slots = sharedInts(older.slots.length);
      table.slots = slots;
      const emptied: number[] = [];
      for (let slot = 0; slot < slots.length; slot++) {
        const value = older.slots[slot];
        if (value === 0) {
          continue;
        }
        if (value - 1 < dropped) {
          emptied.push(slot);
        } else {
          slots[slot] = value - dropped + count;
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
      while (most * 2 > slots) {
        slots *= 2;
      }
      table.slots = sharedInts(slots);
      for (let at = 0; at < table.size; at++) {
        table.place(at);
      }
    }
    return table;
  }

  static fromParts({ bytes, offsets, slots, size }: HashTableParts): HashTable {
    const table = new HashTable();
    table.bytes = bytes;
    table.offsets = offsets;
    table.slots = slots;
    table.size = size;
    table.used = offsets[size];
    return table;
  }

  parts(): HashTableParts {
    return {
      bytes: this.bytes,
      offsets: this.offsets,
      slots: this.slots,
      size: this.size,
    };
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
    const source = Buffer.from(hash, 'utf8');
    return this.findBytes(source, 0, source.length);
  }

  share(): void {
    const bytes = sharedBytes(this.used);
    bytes.set(this.bytes.subarray(0, this.used));
    const offsets = sharedInts(this.size + 1);
    offsets.set(this.offsets.subarray(0, this.size + 1));
    const slots = sharedInts(this.slots.length);
    slots.set(this.slots);
    this.bytes = bytes;
    this.offsets = offsets;
    this.slots = slots;
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
