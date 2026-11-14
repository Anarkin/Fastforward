import * as fs from 'node:fs';
import * as path from 'node:path';
import { type PdfPage } from './formats.mts';
import { images } from './gitImages.mts';
import { binary, decoded, png, sentence, shade } from './samples.mts';

export const limits = {
  maxColoredBytes: 10 * 1024 * 1024,
  wholeLineBytes: 64 * 1024,
  rowBytes: 4096,
  maxPreviewBytes: 1024 * 1024,
  maxImageSize: 192 * 1024 * 1024,
  maxMatches: 10_000,
};

export const syntaxLineLimit = 20_000;
export const kib = 1024;
export const mib = 1024 * kib;
export const gib = 1024 * mib;
export const appRoot = path.join(import.meta.dirname, '..', '..');

export interface FileColorGroup {
  readonly extensions: readonly string[] | string;
}

export const defaultColorGroups = (): readonly FileColorGroup[] => {
  const settings: {
    readonly tools: {
      readonly commander: { readonly fileColors: readonly FileColorGroup[] };
    };
  } = JSON.parse(
    fs.readFileSync(
      path.join(appRoot, 'src', 'shell', 'main', 'settings.json'),
      'utf8',
    ),
  );
  return settings.tools.commander.fileColors;
};

export const lines = (count: number, line: (i: number) => string) =>
  `${Array.from({ length: count }, (_, i) => line(i)).join('\n')}\n`;

export function* textOfSize(
  size: number,
  line: (i: number) => string,
  last = (length: number) => `${'.'.repeat(Math.max(0, length - 1))}\n`,
): Iterable<string> {
  let left = size;
  let batch = '';
  for (let i = 0; left > 0; i++) {
    const next = `${line(i)}\n`;
    const piece = next.length <= left ? next : last(left).slice(0, left);
    batch += piece;
    left -= piece.length;
    if (batch.length >= mib) {
      yield batch;
      batch = '';
    }
  }
  if (batch !== '') {
    yield batch;
  }
}

export function* oneLineOfSize(size: number): Iterable<string> {
  const block = `${sentence(3, 200_000)} `.slice(0, mib);
  for (let left = size - 1; left > 0; left -= block.length) {
    yield block.slice(0, Math.min(left, block.length));
  }
  yield '\n';
}

export function* randomOfSize(size: number, seed: number): Iterable<Buffer> {
  const block = binary(mib, seed);
  for (let at = 0; at < size; at += block.length) {
    const piece = Buffer.from(
      block.subarray(0, Math.min(block.length, size - at)),
    );
    piece.writeUInt32LE((at / block.length) >>> 0, 0);
    yield piece;
  }
}

export const logLine = (i: number) =>
  `2026-02-01T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i % 1000).padStart(3, '0')}Z ${['INFO', 'DEBUG', 'WARN', 'INFO', 'ERROR'][i % 5]} worker-${i % 8} request ${100_000 + i} ${sentence(i, 5)} took ${(i * 7) % 900} ms`;

export const logOfSize = (size: number): Iterable<string> => {
  const needleAt = Math.floor((size * 0.98) / 110);
  return textOfSize(size, (i) =>
    i === needleAt
      ? `${logLine(i)} NEEDLE: the one line to find, near the end`
      : logLine(i),
  );
};

export const codeOfSize = (size: number) =>
  textOfSize(
    size,
    (i) =>
      i % 10 === 0
        ? `export function step${i}(value: number): number {`
        : i % 10 === 9
          ? '}'
          : `  value = value * ${i % 7} + ${i}; // ${sentence(i, 3)}`,
    (length) => `//${'.'.repeat(Math.max(0, length - 3))}\n`,
  );

export const markdownOfSize = (size: number) =>
  textOfSize(size, (i) =>
    i % 20 === 0
      ? `## Section ${i / 20 + 1}`
      : i % 20 === 1
        ? ''
        : `- Item ${i}: **${sentence(i, 3)}**, \`${sentence(i + 1, 2)}\` and ${sentence(i + 2, 6)}.`,
  );

export const encodingTexts: Readonly<Record<string, string>> = (() => {
  const hungarian =
    'Árvíztűrő tükörfúrógép. Příliš žluťoučký kůň úpěl ďábelské ódy. Zażółć gęślą jaźń.';
  const russian = 'Съешь же ещё этих мягких французских булок, да выпей чаю.';
  const french =
    "Voix ambiguë d'un cœur qui au zéphyr préfère les jattes de kiwis, pour 5 €.";
  const greek = 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία.';
  const hebrew = 'דג סקרן שט בים מאוכזב ולפתע מצא חברה';
  const arabic = 'نص حكيم له سر قاطع وذو شأن عظيم مكتوب على ثوب أخضر';
  const lithuanian =
    'Įlinkdama fechtuotojo špaga sublykčiojusi pragręžė apvalų arbūzą.';
  const everywhere = `${hungarian} ${russian} 日本語のテキスト 😀`;
  return {
    'utf-8': everywhere,
    'utf-16le': everywhere,
    'utf-16be': everywhere,
    'windows-874': 'สวัสดีชาวโลก ภาษาไทย',
    'windows-1250': hungarian,
    'windows-1251': russian,
    'windows-1252': french,
    'windows-1253': greek,
    'windows-1254': 'Pijamalı hasta yağız şoföre çabucak güvendi.',
    'windows-1255': hebrew,
    'windows-1256': arabic,
    'windows-1257': lithuanian,
    'windows-1258': 'Tiếng Việt có dấu, viết bằng chữ Quốc ngữ.',
    'iso-8859-2': hungarian,
    'iso-8859-3': 'Eĥoŝanĝo ĉiuĵaŭde, laŭ Esperanto.',
    'iso-8859-4': lithuanian,
    'iso-8859-5': russian,
    'iso-8859-6': arabic,
    'iso-8859-7': greek,
    'iso-8859-8': hebrew,
    'iso-8859-8-i': hebrew,
    'iso-8859-10': 'Kæmi ný öxi hér ykist þjófum nú bæði víl og ádrepa.',
    'iso-8859-13': lithuanian,
    'iso-8859-14': 'Parciais fy jac codi baw hud llawn dŵr ger tŷ Mabon.',
    'iso-8859-15': french,
    'iso-8859-16':
      'Înjurând pițigăiat, zoofobul comandă vexat whisky și tequila.',
    ibm866: `${russian} ╔══╗ ║  ║ ╚══╝`,
    'koi8-r': russian,
    'koi8-u': 'Чуєш їх, доцю, га? Кумедна ж ти, прощайся без ґольфів!',
    'x-mac-cyrillic': russian,
    macintosh: french,
  };
})();

export const unicodeText =
  'English: Hello, world!\nMagyar: Árvíztűrő tükörfúrógép\nΕλληνικά: Γειά σου κόσμε\nРусский: Привет, мир\n日本語: こんにちは世界\n中文: 你好，世界\n한국어: 안녕하세요 세계\nעברית: שלום עולם\nالعربية: مرحبا بالعالم\nEmoji: 👋🌍🎉 👩‍💻 🏳️‍🌈\nCombining: é ä ñ\nZero width: a\u200Bb\u200Cc\u200Dd\n';

export const realSources = [
  'src/lib/shared/strings.ts',
  'src/tools/commander/page/listing.ts',
  'src/tools/commander/page/pane.tsx',
  'src/tools/commander/main/tool.ts',
  'src/shell/page/index.html',
  'esbuild.config.mts',
  'package.json',
].filter((source) => fs.existsSync(path.join(appRoot, source)));

export const changedCode = (text: string) => {
  const source = text.split('\n');
  return [
    ...source.slice(0, 12),
    '// A line added near the top.',
    ...source.slice(12, 30),
    ...source.slice(36, 80).map((line) => line.replace(/\bconst\b/, 'let')),
    '',
    'export function addedAtTheMiddle(): string {',
    "  return 'a function added in the middle';",
    '}',
    ...source.slice(80, -40),
    ...source.slice(-30),
  ].join('\n');
};

export const hungarianOf852: Readonly<Record<string, number>> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ö: 0x94,
  ő: 0x8b,
  ú: 0xa3,
  ü: 0x81,
  ű: 0xfb,
};

export const codePage852 = (name: string) =>
  Buffer.from(
    name
      .split('')
      .map((character) => hungarianOf852[character] ?? character.charCodeAt(0)),
  );

export const prose = (version: 1 | 2) =>
  [
    '# Notes on the playground',
    '',
    `It holds files for every case the commander ${version === 1 ? 'shows' : 'lists'}, made anew each time it runs.`,
    'Every folder says what it is for in the README at its root.',
    ...(version === 1
      ? ['A paragraph the second version leaves out.', '']
      : ['']),
    'The pairs of the compare folder differ in one way each.',
    version === 1
      ? 'The last line stays the same.'
      : 'The last line stays the same, but this one is new.',
    '',
  ].join('\n');

export const plainPng = (width: number, height: number, hue: number) =>
  png(width, height, (x, y) => {
    const angle = (hue / 360) * 2 * Math.PI;
    return [
      shade(0.5 + 0.4 * Math.cos(angle) * (1 - y)),
      shade(0.5 + 0.4 * Math.cos(angle + 2.1) * x),
      shade(0.5 + 0.4 * Math.cos(angle + 4.2)),
    ];
  });

export const orientedJpeg = (orientation: number) => {
  const jpeg = decoded(images.jpg[0]);
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0);
  marker.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, body, jpeg.subarray(2)]);
};

export const pages = (count: number, needlePage?: number): PdfPage[] =>
  Array.from({ length: count }, (_page, i) => ({
    lines: [
      `Page ${i + 1} of ${count}`,
      '',
      ...Array.from({ length: 30 }, (_, k) => sentence(i * 31 + k, 10)),
      ...(i + 1 === needlePage ? ['', 'NEEDLE: the one line to find'] : []),
    ],
  }));

export function* largePdfPages(count: number): Iterable<PdfPage> {
  for (let i = 0; i < count; i++) {
    let drawing = '';
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 40; x++) {
        drawing += `${(((x + y + i) % 10) / 10).toFixed(1)} g ${36 + x * 13.5} ${60 + y * 13} 12 12 re f\n`;
      }
    }
    yield { lines: [`Page ${i + 1} of ${count}`], drawing };
  }
}

export const oneLine = (from: string) =>
  `One line with no line break, so new lines end as ${from} says.`;

export const three = ['one', 'two', 'three'];

export type Content = string | Buffer;
