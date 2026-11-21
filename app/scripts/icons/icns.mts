export interface IcnsEntry {
  readonly type: string;
  readonly png: Uint8Array;
}

const headerLength = 8;

export function icnsOf(entries: readonly IcnsEntry[]): Uint8Array {
  const length =
    headerLength +
    entries.reduce((sum, { png }) => sum + headerLength + png.length, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('icns'));
  view.setUint32(4, length);
  let at = headerLength;
  for (const { type, png } of entries) {
    bytes.set(new TextEncoder().encode(type), at);
    view.setUint32(at + 4, headerLength + png.length);
    bytes.set(png, at + headerLength);
    at += headerLength + png.length;
  }
  return bytes;
}

export function entriesOfIcns(bytes: Uint8Array): IcnsEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: IcnsEntry[] = [];
  for (let at = headerLength; at < view.getUint32(4);) {
    const length = view.getUint32(at + 4);
    entries.push({
      type: new TextDecoder().decode(bytes.subarray(at, at + 4)),
      png: bytes.slice(at + headerLength, at + length),
    });
    at += length;
  }
  return entries;
}
