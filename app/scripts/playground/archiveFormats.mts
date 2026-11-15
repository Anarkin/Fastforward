import { createCipheriv, createHash } from 'node:crypto';
import { deflateRawSync, gzipSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
export const crcOfByte = (crc: number, byte: number) =>
  (crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;

export const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

export interface Packed {
  readonly name: string | Buffer;
  readonly content: string | Buffer;
  readonly password?: string;
}

const dosDate = ((2026 - 1980) << 9) | (2 << 5) | 1;

const zipCrypto = (password: string, crc: number, data: Buffer) => {
  const keys = [0x12345678, 0x23456789, 0x34567890];
  const update = (byte: number) => {
    keys[0] = crcOfByte(keys[0], byte);
    keys[1] =
      (Math.imul((keys[1] + (keys[0] & 0xff)) | 0, 134_775_813) + 1) >>> 0;
    keys[2] = crcOfByte(keys[2], keys[1] >>> 24);
  };
  for (const byte of Buffer.from(password)) {
    update(byte);
  }
  const header = Buffer.alloc(12, 0x5a);
  header[11] = crc >>> 24;
  const plain = Buffer.concat([header, data]);
  const encrypted = Buffer.alloc(plain.length);
  for (const [at, byte] of plain.entries()) {
    const temp = (keys[2] | 2) & 0xffff;
    encrypted[at] = byte ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    update(byte);
  }
  return encrypted;
};

export const zip = (files: readonly Packed[], password?: string) => {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, content, password: own = password } of files) {
    const data = Buffer.from(content);
    const crc = crc32(data);
    const deflated = deflateRawSync(data);
    const packed = own === undefined ? deflated : zipCrypto(own, crc, deflated);
    const nameBytes = Buffer.from(name);
    const flags =
      (typeof name === 'string' ? 0x0800 : 0) | (own === undefined ? 0 : 1);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const listed = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(listed.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, listed, end]);
};

const octets = (...values: number[]) => Buffer.from(values);

const sevenZipNumber = (value: number) => {
  let extra = 0;
  while (value >= 2 ** (8 * extra + 7 - extra)) {
    extra++;
  }
  const low = Buffer.alloc(extra);
  let rest = value;
  for (let at = 0; at < extra; at++) {
    low[at] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return Buffer.concat([octets(((0xff00 >> extra) & 0xff) | rest), low]);
};

const littleEndian32 = (value: number) => {
  const written = Buffer.alloc(4);
  written.writeUInt32LE(value >>> 0);
  return written;
};

const sevenZipCycles = 19;
const sevenZipIv = Buffer.from('fastforward-play');

const sevenZipKey = (password: string) => {
  const round = Buffer.concat([
    Buffer.from(password, 'utf16le'),
    Buffer.alloc(8),
  ]);
  const rounds = 2 ** sevenZipCycles;
  const hashed = Buffer.alloc(round.length * rounds);
  for (let at = 0; at < rounds; at++) {
    round.copy(hashed, at * round.length);
    hashed.writeUInt32LE(at, (at + 1) * round.length - 8);
  }
  return createHash('sha256').update(hashed).digest();
};

const sevenZipAes = (key: Buffer, plain: Buffer) => {
  const cipher = createCipheriv('aes-256-cbc', key, sevenZipIv);
  cipher.setAutoPadding(false);
  const padded = Buffer.concat([
    plain,
    Buffer.alloc((16 - (plain.length % 16)) % 16),
  ]);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
};

const sevenZipStreams = (
  at: number,
  packed: number,
  unpacked: number,
  after: Buffer,
) =>
  Buffer.concat([
    octets(0x06),
    sevenZipNumber(at),
    sevenZipNumber(1),
    octets(0x09),
    sevenZipNumber(packed),
    octets(0x00, 0x07, 0x0b),
    sevenZipNumber(1),
    octets(0x00),
    sevenZipNumber(1),
    octets(0x24, 0x06, 0xf1, 0x07, 0x01),
    sevenZipNumber(2 + sevenZipIv.length),
    octets(sevenZipCycles | 0x40, sevenZipIv.length - 1),
    sevenZipIv,
    octets(0x0c),
    sevenZipNumber(unpacked),
    after,
  ]);

export const sevenZipEncrypted = (
  files: readonly {
    readonly name: string;
    readonly content: string | Buffer;
  }[],
  password: string,
) => {
  const key = sevenZipKey(password);
  const contents = files.map(({ content }) => Buffer.from(content));
  const data = Buffer.concat(contents);
  const packedData = sevenZipAes(key, data);
  const names = Buffer.concat(
    files.map(({ name }) => Buffer.from(`${name}\0`, 'utf16le')),
  );
  const time = Buffer.alloc(8);
  time.writeBigUInt64LE(
    (BigInt(Date.UTC(2026, 1, 1)) + 11_644_473_600_000n) * 10_000n,
  );
  const header = Buffer.concat([
    octets(0x01, 0x04),
    sevenZipStreams(
      0,
      packedData.length,
      data.length,
      Buffer.concat([
        octets(0x00, 0x08, 0x0d),
        sevenZipNumber(files.length),
        octets(0x09),
        ...contents.slice(0, -1).map((each) => sevenZipNumber(each.length)),
        octets(0x0a, 0x01),
        ...contents.map((each) => littleEndian32(crc32(each))),
        octets(0x00, 0x00),
      ]),
    ),
    octets(0x05),
    sevenZipNumber(files.length),
    octets(0x11),
    sevenZipNumber(names.length + 1),
    octets(0x00),
    names,
    octets(0x14),
    sevenZipNumber(2 + 8 * files.length),
    octets(0x01, 0x00),
    ...files.map(() => time),
    octets(0x00, 0x00),
  ]);
  const packedHeader = sevenZipAes(key, header);
  const encoded = Buffer.concat([
    octets(0x17),
    sevenZipStreams(
      packedData.length,
      packedHeader.length,
      header.length,
      Buffer.concat([
        octets(0x0a, 0x01),
        littleEndian32(crc32(header)),
        octets(0x00, 0x00),
      ]),
    ),
  ]);
  const start = Buffer.alloc(20);
  start.writeBigUInt64LE(BigInt(packedData.length + packedHeader.length), 0);
  start.writeBigUInt64LE(BigInt(encoded.length), 8);
  start.writeUInt32LE(crc32(encoded), 16);
  return Buffer.concat([
    octets(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04),
    littleEndian32(crc32(start)),
    start,
    packedData,
    packedHeader,
    encoded,
  ]);
};

const octal = (value: number, width: number) =>
  `${value.toString(8).padStart(width - 1, '0')}\0`;

export const tar = (files: readonly Packed[]) => {
  const blocks: Buffer[] = [];
  for (const { name, content } of files) {
    const data = Buffer.from(content);
    const header = Buffer.alloc(512);
    Buffer.from(name).copy(header, 0, 0, 100);
    header.write(octal(0o644, 8), 100);
    header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116);
    header.write(octal(data.length, 12), 124);
    header.write(octal(1_769_904_000, 12), 136);
    header.write(' '.repeat(8), 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
};

export const gzip = (content: string | Buffer) =>
  gzipSync(Buffer.from(content), { level: 9 });
