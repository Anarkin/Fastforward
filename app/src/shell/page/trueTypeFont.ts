import type { Box } from './controlFontDrawing';

interface FontGlyph {
  readonly advance: number;
  readonly boxes: readonly Box[];
}

export interface FontDrawn {
  readonly family: string;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly glyphs: readonly FontGlyph[];
  readonly glyphOfCode: ReadonlyMap<number, number>;
}

type Bytes = readonly number[];

const u16 = (...values: readonly number[]): number[] =>
  values.flatMap((value) => [(value >> 8) & 0xff, value & 0xff]);

const u32 = (...values: readonly number[]): number[] =>
  values.flatMap((value) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);

const ascii = (text: string): number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

const utf16 = (text: string): number[] => u16(...ascii(text));

function padded(bytes: Bytes, to: number): number[] {
  const over = bytes.length % to;
  return over === 0
    ? [...bytes]
    : [...bytes, ...Array.from({ length: to - over }, () => 0)];
}

function tableSum(bytes: Bytes | Uint8Array): number {
  let sum = 0;
  for (let at = 0; at < bytes.length; at += 4) {
    sum =
      (sum +
        ((bytes[at] ?? 0) * 0x1000000 +
          ((bytes[at + 1] ?? 0) << 16) +
          ((bytes[at + 2] ?? 0) << 8) +
          (bytes[at + 3] ?? 0))) >>>
      0;
  }
  return sum;
}

const onCurve = 0x01;
const shortX = 0x02;
const shortY = 0x04;
const sameOrPositiveX = 0x10;
const sameOrPositiveY = 0x20;

function step(
  delta: number,
  short: number,
  sameOrPositive: number,
): { readonly flag: number; readonly bytes: number[] } {
  if (delta === 0) {
    return { flag: sameOrPositive, bytes: [] };
  }
  if (Math.abs(delta) <= 0xff) {
    return {
      flag: short | (delta > 0 ? sameOrPositive : 0),
      bytes: [Math.abs(delta)],
    };
  }
  return { flag: 0, bytes: u16(delta) };
}

interface Bounds {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

const noBounds: Bounds = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };

function boundsOf(boxes: readonly Box[]): Bounds {
  return boxes.length === 0
    ? noBounds
    : {
        xMin: Math.min(...boxes.map((box) => box.left)),
        yMin: Math.min(...boxes.map((box) => box.bottom)),
        xMax: Math.max(...boxes.map((box) => box.right)),
        yMax: Math.max(...boxes.map((box) => box.top)),
      };
}

const cornersOfABox = 4;

function outline(boxes: readonly Box[]): number[] {
  if (boxes.length === 0) {
    return [];
  }
  const points = boxes.flatMap(({ left, bottom, right, top }) => [
    { x: left, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
  ]);
  const flags: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let at = { x: 0, y: 0 };
  for (const point of points) {
    const x = step(point.x - at.x, shortX, sameOrPositiveX);
    const y = step(point.y - at.y, shortY, sameOrPositiveY);
    flags.push(onCurve | x.flag | y.flag);
    xs.push(...x.bytes);
    ys.push(...y.bytes);
    at = point;
  }
  const { xMin, yMin, xMax, yMax } = boundsOf(boxes);
  return padded(
    [
      ...u16(boxes.length, xMin, yMin, xMax, yMax),
      ...u16(...boxes.map((_, box) => (box + 1) * cornersOfABox - 1)),
      ...u16(0),
      ...flags,
      ...xs,
      ...ys,
    ],
    4,
  );
}

interface Segment {
  readonly start: number;
  end: number;
  readonly delta: number;
}

function segmentsOf(glyphOfCode: ReadonlyMap<number, number>): Segment[] {
  const segments: Segment[] = [];
  for (const [code, glyph] of [...glyphOfCode].toSorted(
    ([one], [other]) => one - other,
  )) {
    const last = segments.at(-1);
    if (
      last !== undefined &&
      code === last.end + 1 &&
      glyph - code === last.delta
    ) {
      last.end = code;
    } else {
      segments.push({ start: code, end: code, delta: glyph - code });
    }
  }
  return [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
}

const windows = 3;
const unicodeBmp = 1;

function characterMap(glyphOfCode: ReadonlyMap<number, number>): number[] {
  const segments = segmentsOf(glyphOfCode);
  const count = segments.length;
  const power = 2 ** Math.floor(Math.log2(count));
  const body = [
    ...u16(count * 2, power * 2, Math.log2(power), (count - power) * 2),
    ...u16(...segments.map(({ end }) => end)),
    ...u16(0),
    ...u16(...segments.map(({ start }) => start)),
    ...u16(...segments.map(({ delta }) => delta)),
    ...u16(...segments.map(() => 0)),
  ];
  const format = 4;
  const header = 6;
  const firstSubtable = 12;
  return [
    ...u16(0, 1, windows, unicodeBmp),
    ...u32(firstSubtable),
    ...u16(format, header + body.length, 0),
    ...body,
  ];
}

function names(family: string): number[] {
  const records = [
    [1, family],
    [2, 'Regular'],
    [3, `${family} Regular 1.0`],
    [4, family],
    [5, 'Version 1.0'],
    [6, `${family.replaceAll(' ', '')}-Regular`],
  ] as const;
  const english = 0x0409;
  const texts = records.map(([, text]) => utf16(text));
  let offset = 0;
  const entries = records.flatMap(([id], at) => {
    const length = texts[at]?.length ?? 0;
    const entry = u16(windows, unicodeBmp, english, id, length, offset);
    offset += length;
    return entry;
  });
  const entry = 12;
  const header = 6;
  return [
    ...u16(0, records.length, header + records.length * entry),
    ...entries,
    ...texts.flat(),
  ];
}

const magic = 0x5f0f3cf5;
const wholeFontSum = 0xb1b0afba;
const sumAdjustmentAt = 8;
const directoryEntry = 16;

export function trueTypeFont({
  family,
  unitsPerEm,
  ascent,
  descent,
  glyphs,
  glyphOfCode,
}: FontDrawn): Uint8Array<ArrayBuffer> {
  const outlines = glyphs.map(({ boxes }) => outline(boxes));
  const bounds = glyphs.map(({ boxes }) => boundsOf(boxes));
  const drawn = glyphs
    .filter(({ boxes }) => boxes.length > 0)
    .map(({ advance, boxes }) => ({ advance, ...boundsOf(boxes) }));
  const all = boundsOf(glyphs.flatMap(({ boxes }) => boxes));
  const widest = Math.max(...glyphs.map(({ advance }) => advance));
  const most = Math.max(...glyphs.map(({ boxes }) => boxes.length));
  const codes = [...glyphOfCode.keys()];
  const offsets = [0];
  for (const each of outlines) {
    offsets.push((offsets.at(-1) ?? 0) + each.length);
  }
  const head = [
    ...u32(0x00010000, 0x00010000, 0, magic),
    ...u16(0x0003, unitsPerEm),
    ...u32(0, 0, 0, 0),
    ...u16(all.xMin, all.yMin, all.xMax, all.yMax),
    ...u16(0, 6, 2, 1, 0),
  ];
  const hhea = [
    ...u32(0x00010000),
    ...u16(ascent, -descent, 0, widest),
    ...u16(
      Math.min(...drawn.map(({ xMin }) => xMin)),
      Math.min(...drawn.map(({ advance, xMax }) => advance - xMax)),
      all.xMax,
    ),
    ...u16(1, 0, 0, 0, 0, 0, 0, 0, glyphs.length),
  ];
  const maxp = [
    ...u32(0x00010000),
    ...u16(glyphs.length, most * cornersOfABox, most),
    ...u16(0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
  ];
  const monospaced = [2, 0, 5, 9, 0, 0, 0, 0, 0, 0];
  const basicLatin = 1;
  const controlPictures = 1 << (39 - 32);
  const regular = 0x0040;
  const os2 = [
    ...u16(4, widest, 400, 5, 0),
    ...u16(650, 600, 0, 75, 650, 600, 0, 350, 50, 300),
    ...u16(0),
    ...monospaced,
    ...u32(basicLatin, controlPictures, 0, 0),
    ...ascii('FFWD'),
    ...u16(regular, Math.min(...codes), Math.max(...codes)),
    ...u16(ascent, -descent, 0, ascent, descent),
    ...u32(1, 0),
    ...u16(Math.round(unitsPerEm / 2), ascent, 0, 32, 1),
  ];
  const hmtx = u16(
    ...glyphs.flatMap(({ advance }, at) => [advance, bounds[at]?.xMin ?? 0]),
  );
  const post = [
    ...u32(0x00030000, 0),
    ...u16(-Math.round(unitsPerEm / 10), Math.round(unitsPerEm / 20)),
    ...u32(1, 0, 0, 0, 0),
  ];
  const tables: readonly (readonly [string, Bytes])[] = [
    ['OS/2', os2],
    ['cmap', characterMap(glyphOfCode)],
    ['glyf', outlines.flat()],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', u32(...offsets)],
    ['maxp', maxp],
    ['name', names(family)],
    ['post', post],
  ];
  const count = tables.length;
  const power = 2 ** Math.floor(Math.log2(count));
  const header = [
    ...u32(0x00010000),
    ...u16(
      count,
      power * directoryEntry,
      Math.log2(power),
      (count - power) * directoryEntry,
    ),
  ];
  let at = header.length + count * directoryEntry;
  let headAt = 0;
  const directory: number[] = [];
  const bodies: number[] = [];
  for (const [tag, body] of tables) {
    if (tag === 'head') {
      headAt = at;
    }
    const whole = padded(body, 4);
    directory.push(...ascii(tag), ...u32(tableSum(whole), at, body.length));
    bodies.push(...whole);
    at += whole.length;
  }
  const font = Uint8Array.from([...header, ...directory, ...bodies]);
  font.set(
    u32((wholeFontSum - tableSum(font)) >>> 0),
    headAt + sumAdjustmentAt,
  );
  return font;
}

export interface FontRead {
  readonly sumsHold: boolean;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly advances: readonly number[];
  readonly glyphOfCode: ReadonlyMap<number, number>;
  readonly contours: readonly number[];
}

export function readTrueTypeFont(font: Uint8Array): FontRead {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const count = view.getUint16(4);
  const tables = new Map<string, DataView>();
  let sumsHold = tableSum(font) === wholeFontSum;
  for (let table = 0; table < count; table++) {
    const at = 12 + table * directoryEntry;
    const tag = String.fromCharCode(...font.subarray(at, at + 4));
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    tables.set(tag, new DataView(font.buffer, font.byteOffset + offset));
    if (tag !== 'head') {
      sumsHold &&=
        tableSum(padded([...font.subarray(offset, offset + length)], 4)) ===
        view.getUint32(at + 4);
    }
  }
  const of = (tag: string) => tables.get(tag) ?? new DataView(font.buffer);
  const glyphCount = of('maxp').getUint16(4);
  const firstSubtable = 12;
  const map = of('cmap');
  const segments = map.getUint16(firstSubtable + 6) / 2;
  const ends = firstSubtable + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const glyphOfCode = new Map<number, number>();
  for (let segment = 0; segment < segments - 1; segment++) {
    const delta = map.getUint16(deltas + segment * 2);
    for (
      let code = map.getUint16(starts + segment * 2);
      code <= map.getUint16(ends + segment * 2);
      code++
    ) {
      glyphOfCode.set(code, (code + delta) & 0xffff);
    }
  }
  const glyphs = Array.from({ length: glyphCount }, (_, glyph) => glyph);
  return {
    sumsHold,
    unitsPerEm: of('head').getUint16(18),
    ascent: of('hhea').getInt16(4),
    descent: -of('hhea').getInt16(6),
    advances: glyphs.map((glyph) => of('hmtx').getUint16(glyph * 4)),
    glyphOfCode,
    contours: glyphs.map((glyph) => {
      const from = of('loca').getUint32(glyph * 4);
      return from === of('loca').getUint32(glyph * 4 + 4)
        ? 0
        : of('glyf').getInt16(from);
    }),
  };
}
