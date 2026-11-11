import * as fs from 'node:fs';
import * as path from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import {
  docx,
  encoded,
  gzip,
  pdf,
  pdfParts,
  sevenZipEncrypted,
  tar,
  wav,
  xlsx,
  zip,
  type PdfPage,
} from './formats.mts';
import { images } from './gitImages.mts';
import {
  csvFiles,
  csvRows,
  dotnetFiles,
  dotnetPair,
  rustFiles,
  rustPair,
} from './projectSamples.mts';
import {
  binary,
  decoded,
  diagrams,
  emojiGrid,
  everything,
  imageKinds,
  languages,
  paddedTable,
  png,
  sentence,
  shade,
} from './samples.mts';

export type Platform = 'win32' | 'darwin' | 'linux';

type Content = string | Buffer;

interface Placed {
  readonly path: string;
  readonly modified?: Date;
}

export interface FileItem extends Placed {
  readonly kind: 'file';
  readonly content: () => Content;
  readonly mode?: number;
  readonly hidden?: true;
  readonly system?: true;
  readonly readOnly?: true;
  readonly flaggedHidden?: true;
}

export interface ChunksItem extends Placed {
  readonly kind: 'chunks';
  readonly size?: number;
  readonly chunks: () => Iterable<Content>;
}

export interface SparseItem extends Placed {
  readonly kind: 'sparse';
  readonly size: number;
}

export interface FolderItem extends Placed {
  readonly kind: 'folder';
  readonly hidden?: true;
  readonly unreadable?: true;
}

export interface LinkItem extends Placed {
  readonly kind: 'link';
  readonly target: string;
  readonly folder: boolean;
}

export interface JunctionItem extends Placed {
  readonly kind: 'junction';
  readonly target: string;
}

export interface CopyItem extends Placed {
  readonly kind: 'copy';
  readonly from: string;
}

export interface HardLinkItem extends Placed {
  readonly kind: 'hardLink';
  readonly target: string;
}

export interface RepositoryItem extends Placed {
  readonly kind: 'repository';
}

export type Item =
  | FileItem
  | ChunksItem
  | SparseItem
  | FolderItem
  | LinkItem
  | JunctionItem
  | CopyItem
  | HardLinkItem
  | RepositoryItem;

export interface EncodedSample {
  readonly path: string;
  readonly encoding: string;
  readonly text: string;
}

export interface Plan {
  readonly items: readonly Item[];
  readonly pairs: readonly (readonly [string, string])[];
  readonly encodings: readonly EncodedSample[];
  readonly guide: readonly (readonly [string, string])[];
}

export const playgroundName = 'Fastforward-playground-files';

export const markerName = '.fastforward-playground.json';

export const limits = {
  maxColoredBytes: 10 * 1024 * 1024,
  wholeLineBytes: 64 * 1024,
  rowBytes: 4096,
  maxPreviewBytes: 1024 * 1024,
  maxImageSize: 192 * 1024 * 1024,
  maxMatches: 10_000,
};

const syntaxLineLimit = 20_000;
const kib = 1024;
const mib = 1024 * kib;
const gib = 1024 * mib;
const appRoot = path.join(import.meta.dirname, '..', '..');

interface FileColorGroup {
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

const lines = (count: number, line: (i: number) => string) =>
  `${Array.from({ length: count }, (_, i) => line(i)).join('\n')}\n`;

function* textOfSize(
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

function* oneLineOfSize(size: number): Iterable<string> {
  const block = `${sentence(3, 200_000)} `.slice(0, mib);
  for (let left = size - 1; left > 0; left -= block.length) {
    yield block.slice(0, Math.min(left, block.length));
  }
  yield '\n';
}

function* randomOfSize(size: number, seed: number): Iterable<Buffer> {
  const block = binary(mib, seed);
  for (let at = 0; at < size; at += block.length) {
    const piece = Buffer.from(
      block.subarray(0, Math.min(block.length, size - at)),
    );
    piece.writeUInt32LE((at / block.length) >>> 0, 0);
    yield piece;
  }
}

const logLine = (i: number) =>
  `2026-02-01T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i % 1000).padStart(3, '0')}Z ${['INFO', 'DEBUG', 'WARN', 'INFO', 'ERROR'][i % 5]} worker-${i % 8} request ${100_000 + i} ${sentence(i, 5)} took ${(i * 7) % 900} ms`;

const logOfSize = (size: number): Iterable<string> => {
  const needleAt = Math.floor((size * 0.98) / 110);
  return textOfSize(size, (i) =>
    i === needleAt
      ? `${logLine(i)} NEEDLE: the one line to find, near the end`
      : logLine(i),
  );
};

const codeOfSize = (size: number) =>
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

const markdownOfSize = (size: number) =>
  textOfSize(size, (i) =>
    i % 20 === 0
      ? `## Section ${i / 20 + 1}`
      : i % 20 === 1
        ? ''
        : `- Item ${i}: **${sentence(i, 3)}**, \`${sentence(i + 1, 2)}\` and ${sentence(i + 2, 6)}.`,
  );

const encodingTexts: Readonly<Record<string, string>> = (() => {
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

const unicodeText =
  'English: Hello, world!\nMagyar: Árvíztűrő tükörfúrógép\nΕλληνικά: Γειά σου κόσμε\nРусский: Привет, мир\n日本語: こんにちは世界\n中文: 你好，世界\n한국어: 안녕하세요 세계\nעברית: שלום עולם\nالعربية: مرحبا بالعالم\nEmoji: 👋🌍🎉 👩‍💻 🏳️‍🌈\nCombining: é ä ñ\nZero width: a\u200Bb\u200Cc\u200Dd\n';

const realSources = [
  'src/shared/strings.ts',
  'src/tools/commander/page/listing.ts',
  'src/tools/commander/page/pane.tsx',
  'src/tools/commander/main/tool.ts',
  'src/shell/page/index.html',
  'esbuild.config.mts',
  'package.json',
].filter((source) => fs.existsSync(path.join(appRoot, source)));

const changedCode = (text: string) => {
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

const hungarianOf852: Readonly<Record<string, number>> = {
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

const codePage852 = (name: string) =>
  Buffer.from(
    name
      .split('')
      .map((character) => hungarianOf852[character] ?? character.charCodeAt(0)),
  );

const prose = (version: 1 | 2) =>
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

const plainPng = (width: number, height: number, hue: number) =>
  png(width, height, (x, y) => {
    const angle = (hue / 360) * 2 * Math.PI;
    return [
      shade(0.5 + 0.4 * Math.cos(angle) * (1 - y)),
      shade(0.5 + 0.4 * Math.cos(angle + 2.1) * x),
      shade(0.5 + 0.4 * Math.cos(angle + 4.2)),
    ];
  });

const orientedJpeg = (orientation: number) => {
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

const pages = (count: number, needlePage?: number): PdfPage[] =>
  Array.from({ length: count }, (_page, i) => ({
    lines: [
      `Page ${i + 1} of ${count}`,
      '',
      ...Array.from({ length: 30 }, (_, k) => sentence(i * 31 + k, 10)),
      ...(i + 1 === needlePage ? ['', 'NEEDLE: the one line to find'] : []),
    ],
  }));

function* largePdfPages(count: number): Iterable<PdfPage> {
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

export function plan({
  platform,
  large = false,
}: {
  readonly platform: Platform;
  readonly large?: boolean;
}): Plan {
  const windows = platform === 'win32';
  const items: Item[] = [];
  const guide: [string, string][] = [];
  const pairs: [string, string][] = [];
  const encodings: EncodedSample[] = [];
  const file = (
    where: string,
    content: Content | (() => Content),
    extra: Partial<Omit<FileItem, 'kind' | 'path' | 'content'>> = {},
  ) => {
    items.push({
      kind: 'file',
      path: where,
      content: typeof content === 'function' ? content : () => content,
      ...extra,
    });
  };
  const chunks = (
    where: string,
    size: number,
    made: () => Iterable<Content>,
  ) => {
    items.push({ kind: 'chunks', path: where, size, chunks: made });
  };
  const folder = (
    where: string,
    extra: Partial<Omit<FolderItem, 'kind' | 'path'>> = {},
  ) => {
    items.push({ kind: 'folder', path: where, ...extra });
  };
  const section = (where: string, description: string) => {
    guide.push([where, description]);
    folder(where);
  };

  section(
    'colors',
    'One empty file for every extension of every default color group, a program by its exec bit on macOS and Linux, files on a drive marking every file so, a macOS app, and files no group colors. Turn on Group by color with Ctrl+G.',
  );
  for (const { extensions } of defaultColorGroups()) {
    if (Array.isArray(extensions)) {
      for (const extension of extensions) {
        file(`colors/sample.${extension}`, '');
      }
    }
  }
  file('colors/source.ts', 'export const colored = "by its language";\n');
  file('colors/Makefile', 'all:\n\techo "colored by its whole name"\n');
  file('colors/Dockerfile', 'FROM alpine\n');
  file('colors/program', '#!/bin/sh\necho "a program without an extension"\n', {
    mode: 0o755,
  });
  file('colors/python3.12', '#!/bin/sh\necho "a versioned program"\n', {
    mode: 0o755,
  });
  file(
    'colors/notes-on-a-usb-stick.txt',
    'Every file of a FAT drive can run.\n',
    {
      mode: 0o755,
    },
  );
  file('colors/photo-on-a-usb-stick.jpg', '', { mode: 0o755 });
  file('colors/script-on-a-usb-stick.py', 'print("still Python")\n', {
    mode: 0o755,
  });
  folder('colors/Playground.app');
  file(
    'colors/Playground.app/Contents/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Playground</string></dict></plist>\n',
  );
  file(
    'colors/Playground.app/Contents/MacOS/Playground',
    '#!/bin/sh\necho "Hello from an app bundle"\n',
    { mode: 0o755 },
  );
  for (const plain of [
    'LICENSE',
    'server.key',
    'id_ed25519.pub',
    'core.dll',
    'data.bin',
    'contacts.vcf',
    'font.woff2',
  ]) {
    file(`colors/${plain}`, '');
  }

  section(
    'images',
    'Every image type the viewer previews, animated, transparent, wide, tall, tiny and large ones, a photo in each of the eight orientations its EXIF tag may give, its dark corner moving around in thumbnails with Mod+2, a broken one, an SVG with a script and one too large to preview. Open with F3, 3 for the preview, F to fit or show the real size.',
  );
  for (const { extension, versions } of imageKinds) {
    file(`images/sample.${extension}`, () => versions()[0]);
  }
  file('images/animated.gif', () => decoded(images.animated));
  file('images/transparent.png', () => decoded(images.transparent));
  file('images/wide.png', () =>
    png(1600, 48, (x, y) => [shade(x), shade(y), shade(1 - x)]),
  );
  file('images/tall.png', () =>
    png(48, 1600, (x, y) => [shade(y), shade(x), shade(1 - y)]),
  );
  file('images/tiny.png', () => png(1, 1, () => [220, 40, 40]));
  file('images/large.png', () =>
    png(3000, 2000, (x, y) => [
      shade(x),
      shade(0.5 + 0.5 * Math.sin(x * 20) * y),
      shade(1 - y),
    ]),
  );
  file('images/UPPERCASE.JPG', () => decoded(images.jpg[0]));
  for (let orientation = 1; orientation <= 8; orientation++) {
    file(`images/exif-orientation-${orientation}.jpg`, () =>
      orientedJpeg(orientation),
    );
  }
  file('images/broken.png', 'This is not a PNG at all.\n');
  file(
    'images/scripted.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">\n  <script>alert("never runs")</script>\n  <rect width="96" height="96" fill="#6a6"/>\n</svg>\n',
  );
  items.push({
    kind: 'sparse',
    path: 'images/over-the-image-limit.png',
    size: limits.maxImageSize + 1,
  });

  section(
    'markdown',
    'Markdown with everything the preview renders, Mermaid diagrams, HTML it sanitizes, images next to it, every extension, and files just under and over the size it previews.',
  );
  file(
    'markdown/everything.md',
    everything.replace('../../images/logo.png', 'logo.png'),
  );
  file('markdown/diagrams.md', diagrams);
  file(
    'markdown/sanitized.md',
    '# Sanitized\n\n<script>alert("never runs")</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src="x" onerror="alert(1)" alt="An image whose handler is dropped">\n\n<a href="javascript:alert(1)">A link whose script is dropped</a>\n\n<p style="color: red">A paragraph whose style is dropped</p>\n',
  );
  file(
    'markdown/images.md',
    '# Images\n\nNext to the file:\n\n![The logo](logo.png)\n\nFrom the web, shown as its alt text:\n\n![A picture on the web](https://example.com/picture.png)\n\nMissing:\n\n![A picture that is not there](missing.png)\n',
  );
  file('markdown/logo.png', () =>
    png(64, 64, (x, y) => [shade(x * 0.2), shade(0.4 + y * 0.3), 204]),
  );
  for (const extension of ['markdown', 'mdown', 'mkd', 'mkdn']) {
    file(
      `markdown/extension.${extension}`,
      `# A .${extension} file\n\nPreviewed like any **Markdown**.\n`,
    );
  }
  chunks(
    'markdown/just-under-the-preview-limit.md',
    limits.maxPreviewBytes - kib,
    () => markdownOfSize(limits.maxPreviewBytes - kib),
  );
  chunks(
    'markdown/over-the-preview-limit.md',
    limits.maxPreviewBytes + kib,
    () => markdownOfSize(limits.maxPreviewBytes + kib),
  );

  section(
    'pdf',
    'A short PDF, one of 300 pages with NEEDLE on page 250 to find with Mod+F, one locked with the password "playground", and a broken one.',
  );
  file('pdf/sample.pdf', () => pdf(pages(3)));
  file('pdf/many-pages.pdf', () => pdf(pages(300, 250)));
  file('pdf/locked.pdf', () => pdf(pages(2), 'playground'));
  file('pdf/broken.pdf', '%PDF-1.4\nThis is not a PDF after all.\n');

  section(
    'syntax',
    'Code in many languages; a .NET solution of C#, F#, Visual Basic, Razor and XAML with its projects, props, settings and resources; a Rust crate with its Cargo files; real sources of Fastforward; files just under and over the size the viewer colors; and lines just under and over the length it colors. Choose another language with L.',
  );
  for (const [name, content] of Object.entries({
    ...languages,
    ...dotnetFiles,
    ...rustFiles,
  })) {
    file(`syntax/${name}`, content);
  }
  for (const source of realSources) {
    file(`syntax/fastforward-${path.basename(source)}`, () =>
      fs.readFileSync(path.join(appRoot, source)),
    );
  }
  chunks(
    'syntax/limit-size-just-under-the-coloring-limit.ts',
    limits.maxColoredBytes - kib,
    () => codeOfSize(limits.maxColoredBytes - kib),
  );
  chunks(
    'syntax/limit-size-over-the-coloring-limit.ts',
    limits.maxColoredBytes + kib,
    () => codeOfSize(limits.maxColoredBytes + kib),
  );
  for (const [name, length] of [
    ['line-just-under-the-coloring-length.ts', syntaxLineLimit - 10],
    ['line-over-the-coloring-length.ts', syntaxLineLimit + 10],
  ] as const) {
    file(
      `syntax/limit-${name}`,
      `export const before = 1;\nexport const long = '${'x'.repeat(length - 24)}';\nexport const after = 2;\n`,
    );
  }

  section(
    'text',
    'Text for the viewer: lines just under and over the 64 KiB it shows whole, the longer ones in rows of 4 KiB, and of 1 and 10 MiB; LF, CRLF, CR and mixed line endings; a Markdown table padded as prettier pads it, with lines of more than a thousand spaces, which once made the viewer slow; emoji and Chinese, Japanese and Korean characters in a grid whose bars line up where widths are counted right; every byte value and a NUL byte for the hex view, 1; and more matches than it counts and a log with one NEEDLE near its end, to find with Mod+F. Show whitespace with `.`.',
  );
  for (const [name, length] of [
    ['long-line-just-under-64-kib.txt', limits.wholeLineBytes - 1],
    ['long-line-just-over-64-kib.txt', limits.wholeLineBytes + 1],
  ] as const) {
    file(
      `text/${name}`,
      () =>
        `short line\n${sentence(1, Math.ceil(length / 4)).slice(0, length)}\nshort line\n`,
    );
  }
  for (const [name, size] of [
    ['one-line-of-1-mib.txt', mib],
    ['one-line-of-10-mib.txt', 10 * mib],
  ] as const) {
    chunks(`text/${name}`, size, () => oneLineOfSize(size));
  }

  section(
    'encodings',
    'A text in every encoding the E menu offers, in a script it is for, with and without a byte order mark. Auto reads the ones without a mark in the code page of the system.',
  );
  for (const [encoding, text] of Object.entries(encodingTexts)) {
    const where = `encodings/${encoding}.txt`;
    const sample = `${encoding}: ${text}\n`;
    const bom = encoding.startsWith('utf-16') ? '\uFEFF' : '';
    file(where, () => encoded(`${bom}${sample}`, encoding));
    encodings.push({ path: where, encoding, text: sample });
  }
  const bomless = `utf-16le without a byte order mark: ${encodingTexts['utf-16le']}\n`;
  file('encodings/utf-16le-without-bom.txt', () =>
    encoded(bomless, 'utf-16le'),
  );
  encodings.push({
    path: 'encodings/utf-16le-without-bom.txt',
    encoding: 'utf-16le',
    text: bomless,
  });
  const withBom = `utf-8 with a byte order mark: ${encodingTexts['utf-8']}\n`;
  file('encodings/utf-8-with-bom.txt', () =>
    encoded(`\uFEFF${withBom}`, 'utf-8'),
  );
  encodings.push({
    path: 'encodings/utf-8-with-bom.txt',
    encoding: 'utf-8',
    text: withBom,
  });

  const three = ['one', 'two', 'three'];
  file('text/line-endings-lf.txt', `${three.join('\n')}\n`);
  file('text/line-endings-crlf.txt', `${three.join('\r\n')}\r\n`);
  file('text/line-endings-cr.txt', `${three.join('\r')}\r`);
  file('text/line-endings-mixed.txt', 'lf\ncrlf\r\ncr\rlf again\n');
  file('text/line-endings-no-final-newline.txt', 'no final newline');
  file('text/line-endings-empty.txt', '');
  file('text/line-endings-only-newlines.txt', '\n'.repeat(50));

  file('text/whitespace-padded-table.md', paddedTable(1));
  file(
    'text/whitespace-tabs-and-spaces.txt',
    'spaces    between\n\ttab at the start\n    four spaces at the start\ntrailing spaces   \ntrailing tab\t\n\t \tmixed\n',
  );

  file('text/emoji-grid.md', emojiGrid(1));
  file('text/unicode.txt', unicodeText);

  file('text/binary-every-byte.bin', () =>
    Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256)),
  );
  file('text/binary-nul-byte.txt', Buffer.from('text\0with a NUL byte\n'));
  file('text/binary-random.bin', () => binary(64 * kib, 7));

  file('text/find-more-matches-than-counted.txt', () =>
    lines(limits.maxMatches + 1000, (i) => `needle ${i + 1}`),
  );
  chunks('text/find-log-of-20-mib.log', 20 * mib, () => logOfSize(20 * mib));

  section(
    'sizes',
    'Files of 0 bytes up to 1 MiB around the edges a size is shown at, and one over 4 GiB stored sparse, which takes no room on the disk.',
  );
  for (const [name, size] of [
    ['0-bytes.txt', 0],
    ['1-byte.txt', 1],
    ['999-bytes.bin', 999],
    ['1000-bytes.bin', 1000],
    ['1023-bytes.bin', 1023],
    ['1024-bytes.bin', 1024],
    ['1-mib.bin', mib],
  ] as const) {
    file(`sizes/${name}`, () => binary(size, size + 1));
  }
  items.push({
    kind: 'sparse',
    path: 'sizes/over-4-gib-sparse.bin',
    size: 5 * gib + 3,
  });

  section(
    'dates',
    'Files and a folder dated from 1980 to 2100, in the time of this computer as their names say, past the year 2038 when 32-bit times end. Sort by Date.',
  );
  for (const [name, date] of [
    ['1980-01-01.txt', '1980-01-01T12:00:00'],
    ['1999-12-31.txt', '1999-12-31T23:59:00'],
    ['2000-01-01.txt', '2000-01-01T00:00:00'],
    ['2026-02-01.txt', '2026-02-01T09:30:00'],
    ['2038-01-19-after-32-bit.txt', '2038-01-19T03:14:08'],
    ['2100-01-01.txt', '2100-01-01T00:00:00'],
  ] as const) {
    file(`dates/${name}`, `Dated ${date}.\n`, { modified: new Date(date) });
  }
  items.push({
    kind: 'folder',
    path: 'dates/folder-of-1999',
    modified: new Date('1999-06-15T10:00:00'),
  });

  section(
    'names',
    'Names in many scripts, with emoji, spaces and odd characters, sorted naturally, with many dots or none, too long to show whole, in a path longer than Windows allowed once, and on macOS and Linux the names Windows refuses; on Linux two names differing only in case.',
  );
  for (const name of [
    'Árvíztűrő tükörfúrógép.txt',
    'こんにちは 世界.txt',
    '中文名字.txt',
    '한국어 이름.txt',
    'עברית.txt',
    'العربية.txt',
    'emoji 😀 👩‍💻 🇭🇺.txt',
    'two  spaces  inside.txt',
    ' a leading space.txt',
    '[brackets] and (parentheses).txt',
    "it's quoted.txt",
    '#hash %percent &ampersand.txt',
    'semi;colon,comma.txt',
    'archive.tar.gz',
    'many.dots.in.one.name.txt',
    '.env',
    'no-extension',
    'UPPERCASE.TXT',
    'report.pdf',
    'report.docx',
    'report.md',
    'file1.txt',
    'file2.txt',
    'file10.txt',
    'file 2 (copy).txt',
    `${'a name far too long to show whole in the column '.repeat(4).trim()}.txt`,
  ]) {
    file(`names/${name}`, '');
  }
  if (!windows) {
    for (const name of [
      'a:colon.txt',
      'back\\slash.txt',
      'trailing dot.',
      'trailing space ',
      'CON.txt',
      'a|pipe and a?question.txt',
    ]) {
      file(`names/${name}`, '');
    }
  }
  if (platform === 'linux') {
    file('names/Readme.md', '# Readme\n');
    file('names/README.md', '# README\n');
  }
  file(
    `names/${Array.from({ length: 5 }, (_, i) => `a-folder-with-a-name-long-enough-to-pass-the-old-limit-of-windows-${i + 1}`).join('/')}/deep.txt`,
    'A file in a path longer than 260 characters.\n',
  );

  section(
    'attributes',
    'Hidden files and folders, by their attribute on Windows and a leading dot elsewhere, a system file, a read-only one, a folder of only hidden files, an empty folder and a folder no one may read. Show hidden files with Ctrl+H.',
  );
  file(
    'attributes/.dot-file',
    'Hidden on macOS and Linux, shown on Windows.\n',
  );
  folder('attributes/.dot-folder');
  file('attributes/.dot-folder/inside.txt', '');
  if (windows) {
    file('attributes/hidden.txt', 'Hidden by its attribute.\n', {
      hidden: true,
    });
    folder('attributes/hidden-folder', { hidden: true });
    file('attributes/hidden-folder/inside.txt', '');
    file('attributes/desktop.ini', '[.ShellClassInfo]\n', {
      hidden: true,
      system: true,
    });
    folder('attributes/only-hidden-files');
    file('attributes/only-hidden-files/one.txt', '', { hidden: true });
    file('attributes/only-hidden-files/two.txt', '', { hidden: true });
  } else {
    folder('attributes/only-hidden-files');
    file('attributes/only-hidden-files/.one', '');
    file('attributes/only-hidden-files/.two', '');
  }
  if (platform === 'darwin') {
    file(
      'attributes/hidden-by-a-flag.txt',
      'Hidden in the Finder by its flag; the commander goes by the leading dot.\n',
      { flaggedHidden: true },
    );
  }
  file('attributes/read-only.txt', 'A file no one may change.\n', {
    readOnly: true,
  });
  folder('attributes/empty-folder');
  folder('attributes/unreadable', { unreadable: true });
  file('attributes/unreadable/secret.txt', 'Never listed.\n');

  section(
    'links',
    'Links to a file and a folder, a broken one, one to a link, two pointing at each other, one to the unreadable folder and, on Windows, a junction. Windows makes links only in Developer Mode or for an administrator; the script says when it could not.',
  );
  file('links/target.txt', 'The file the links point to.\n');
  folder('links/target-folder');
  file('links/target-folder/inside.txt', '');
  for (const [name, target, isFolder] of [
    ['link-to-file.txt', 'target.txt', false],
    ['link-to-folder', 'target-folder', true],
    ['broken-link.txt', 'missing.txt', false],
    ['link-to-link.txt', 'link-to-file.txt', false],
    ['loop-a', 'loop-b', false],
    ['loop-b', 'loop-a', false],
    ['link-to-unreadable', '../attributes/unreadable', true],
  ] as const) {
    items.push({
      kind: 'link',
      path: `links/${name}`,
      target,
      folder: isFolder,
    });
  }
  if (windows) {
    items.push({
      kind: 'junction',
      path: 'links/junction-to-folder',
      target: 'target-folder',
    });
  }

  section(
    'duplicates',
    'Files with copies of the same content under other names and in other folders, deeper ones for flat view, six copies of one text, files of one size that differ at their start or only past the first 64 KiB, a hard link to a file that has no copy, empty files and a link, to try Ctrl+Shift+G in the folder and in flat view.',
  );
  const photo = () => Buffer.concat([...randomOfSize(300 * kib, 7)]);
  for (const where of [
    'duplicates/photo.jpg',
    'duplicates/photo (1).jpg',
    'duplicates/backup/photo.jpg',
    'duplicates/backup/2024/IMG_0412.jpg',
    'duplicates/deep/a/b/c/photo copy.jpg',
  ]) {
    file(where, photo);
  }
  const notes =
    'Meeting notes\n\n- Ship the duplicates view\n- Look at the scrollbars\n';
  for (const where of [
    'duplicates/notes.txt',
    'duplicates/archive/notes-old.md',
    'duplicates/archive/2025/notes.txt',
  ]) {
    file(where, notes);
  }
  for (let copy = 1; copy <= 6; copy++) {
    file(`duplicates/many/copy-${copy}.txt`, 'One of six copies.\n');
  }
  file('duplicates/same-size-a.txt', 'AAAA: the same size as b\n');
  file('duplicates/same-size-b.txt', 'BBBB: the same size as a\n');
  const sameStart = Buffer.alloc(64 * kib, 'x');
  file(
    'duplicates/same-start-a.bin',
    Buffer.concat([sameStart, Buffer.from('ends as a')]),
  );
  file(
    'duplicates/same-start-b.bin',
    Buffer.concat([sameStart, Buffer.from('ends as b')]),
  );
  file(
    'duplicates/same-start-copy-of-a.bin',
    Buffer.concat([sameStart, Buffer.from('ends as a')]),
  );
  file('duplicates/unique.txt', 'No other file holds this.\n');
  items.push({
    kind: 'hardLink',
    path: 'duplicates/hard-link-to-unique.txt',
    target: 'duplicates/unique.txt',
  });
  file('duplicates/empty-1.txt', '');
  file('duplicates/empty-2.txt', '');
  items.push({
    kind: 'link',
    path: 'duplicates/link-to-notes.txt',
    target: 'notes.txt',
    folder: false,
  });

  section(
    'executables',
    'A real program of the system, scripts with and without an extension, a macOS app, a Linux launcher, a script without its exec bit and a text file with one.',
  );
  items.push({
    kind: 'copy',
    path: windows ? 'executables/where.exe' : 'executables/echo',
    from: windows
      ? path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'where.exe',
        )
      : '/bin/echo',
  });
  file('executables/tool', '#!/bin/sh\necho "a tool without an extension"\n', {
    mode: 0o755,
  });
  file('executables/python3.12', '#!/bin/sh\necho "a versioned program"\n', {
    mode: 0o755,
  });
  file('executables/build.sh', '#!/bin/sh\necho "built"\n', { mode: 0o755 });
  file(
    'executables/start.command',
    '#!/bin/sh\necho "started from the Finder"\n',
    { mode: 0o755 },
  );
  file('executables/not-executable.sh', '#!/bin/sh\necho "no exec bit"\n', {
    mode: 0o644,
  });
  file(
    'executables/notes-with-exec-bit.txt',
    'A text file with its exec bit set.\n',
    { mode: 0o755 },
  );
  file('executables/build.bat', '@echo off\necho built\n');
  file('executables/build.cmd', '@echo off\necho built\n');
  file('executables/build.ps1', 'Write-Output "built"\n');
  file(
    'executables/playground.desktop',
    '[Desktop Entry]\nType=Application\nName=Playground\nExec=echo playground\n',
    { mode: 0o755 },
  );
  folder('executables/Playground.app');
  file(
    'executables/Playground.app/Contents/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Playground</string></dict></plist>\n',
  );
  file(
    'executables/Playground.app/Contents/MacOS/Playground',
    '#!/bin/sh\necho "Hello from an app bundle"\n',
    { mode: 0o755 },
  );

  section(
    'formats',
    'Real files of common formats, which open in their apps with Enter: a Word document, a spreadsheet, rich text, an email, CSV with quoted fields, with semicolons and decimal commas as Excel writes in Hungary, separated by tabs, beyond ASCII, 200 columns wide and 100,000 rows long, a zip, a tar, a gzipped tar and file, and a WAV of one second.',
  );
  file('formats/letter.docx', () =>
    docx([
      'Dear playground,',
      'This document was written by the playground script.',
      'Árvíztűrő tükörfúrógép 😀',
    ]),
  );
  file('formats/budget.xlsx', () =>
    xlsx([
      ['Item', 'Cost'],
      ['Coffee', 4.5],
      ['Cake', 3.25],
    ]),
  );
  file(
    'formats/notes.rtf',
    '{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0\\fs24 Notes in {\\b rich} text.\\par}\n',
  );
  file(
    'formats/reply.eml',
    'From: Playground <playground@example.com>\r\nTo: You <you@example.com>\r\nSubject: A saved email\r\nDate: Sun, 1 Feb 2026 09:30:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAn email saved as a file.\r\n',
  );
  file(
    'formats/data.csv',
    'name,branches,tags\nplayground,47,true\nfiles,0,false\n',
  );

  for (const [name, content] of Object.entries(csvFiles)) {
    file(`formats/${name}`, content);
  }
  file('formats/csv-of-100000-rows.csv', () => csvRows(100_000));

  const packed = [
    { name: 'readme.txt', content: 'Packed by the playground.\n' },
    { name: 'folder/inside.txt', content: 'In a folder.\n' },
    { name: 'ünïcödé – 名前.txt', content: 'A name beyond ASCII.\n' },
  ];
  file('formats/bundle.zip', () => zip(packed));
  file('formats/bundle.tar', () => tar(packed));
  file('formats/bundle.tar.gz', () => gzip(tar(packed)));
  file('formats/notes.txt.gz', () => gzip(lines(1000, (i) => sentence(i, 8))));

  file('formats/tone.wav', () => wav(1, 440));

  section(
    'archives',
    `Archives to enter with Open with 7-Zip... in the menu of a file, or Mod+Left and Mod+Right on it: a zip of folders, tars plain and compressed, shown as the files of their tar, a document made of a zip, which Enter opens in its app, one compressed file, a zip inside a zip, an empty one, names Windows wrote in code page 852, names reaching outside the folder they would be extracted into, deep folders, ${(large ? 100_000 : 5000).toLocaleString('en-US')} files, a zip encrypted with the password playground, one with only some of its files encrypted with it, a 7z whose names are encrypted with it too, a zip encrypted with it holding a 7z whose names are encrypted with the password inner, a zip of images to see in thumbnails with Mod+2, flat with Ctrl+B too, a damaged one, one that is no archive${windows ? ', and one marked as downloaded' : ''}.`,
  );
  const project = [
    { name: 'README.md', content: '# A project packed by the playground\n' },
    { name: 'docs/guide.md', content: prose(1) },
    { name: 'src/app/main.ts', content: 'export const packed = true;\n' },
    { name: 'src/app/view.tsx', content: 'export const View = () => null;\n' },
    { name: 'ünïcödé – 名前.txt', content: 'A name beyond ASCII.\n' },
  ];
  const zippedProject = () =>
    zip([{ name: 'empty-folder/', content: '' }, ...project]);
  file('archives/project.zip', zippedProject);
  file('archives/project.tar', () => tar(project));
  file('archives/project.tar.gz', () => gzip(tar(project)));
  file('archives/project.tgz', () => gzip(tar(project)));
  file('archives/project.tar.zst', () => zstdCompressSync(tar(project)));
  file('archives/report.docx', () =>
    docx([
      'A document made of a zip.',
      'Enter opens it in its app, and Open with 7-Zip... shows the files it is made of.',
    ]),
  );
  file('archives/notes.txt.gz', () => gzip(lines(200, (i) => sentence(i, 8))));
  file('archives/nested.zip', () =>
    zip([
      { name: 'inner.zip', content: zippedProject() },
      { name: 'beside-it.txt', content: 'Beside the zip inside.\n' },
    ]),
  );
  file('archives/empty.zip', () => zip([]));
  file('archives/windows-cp852.zip', () =>
    zip([
      {
        name: codePage852('árvíztűrő tükörfúrógép.txt'),
        content: 'Named in code page 852.\n',
      },
      {
        name: codePage852('Mappa/ő.txt'),
        content: 'In a folder named in code page 852.\n',
      },
    ]),
  );
  file('archives/hostile-names.zip', () =>
    zip(
      [
        '../outside.txt',
        '../../further-outside.txt',
        'C:/absolute.txt',
        '/rooted.txt',
        'colon:stream.txt',
        'CON.txt',
        'trailing-dot.',
        'trailing-space ',
        'Same.txt',
        'same.txt',
        'back\\slash.txt',
        'question?.txt',
      ].map((name) => ({ name, content: `Named ${name} in the archive.\n` })),
    ),
  );
  file('archives/deep.zip', () =>
    zip([
      {
        name: `${Array.from({ length: 30 }, (_, i) => `level-${i + 1}`).join('/')}/bottom.txt`,
        content: 'Thirty folders down.\n',
      },
    ]),
  );
  file('archives/many-files.zip', () =>
    zip(
      Array.from({ length: large ? 100_000 : 5000 }, (_, i) => ({
        name: `folder-${String(Math.floor(i / 100)).padStart(4, '0')}/file-${String(i).padStart(6, '0')}.txt`,
        content: `File ${i}.\n`,
      })),
    ),
  );
  file('archives/encrypted.zip', () => zip(project, 'playground'));
  file('archives/partly-encrypted.zip', () =>
    zip(
      project.map((each) =>
        each.name.startsWith('docs/') || each.name.startsWith('src/')
          ? { ...each, password: 'playground' }
          : each,
      ),
    ),
  );
  file('archives/encrypted-names.7z', () =>
    sevenZipEncrypted(project, 'playground'),
  );
  file('archives/encrypted-nested.zip', () =>
    zip(
      [
        {
          name: 'inner-encrypted.7z',
          content: sevenZipEncrypted(project, 'inner'),
        },
        { name: 'beside-it.txt', content: 'Beside the 7z inside.\n' },
      ],
      'playground',
    ),
  );
  file('archives/images.zip', () =>
    zip(
      Array.from({ length: 80 }, (_, i) => ({
        name: `${i < 60 ? '' : 'more/'}image-${String(i + 1).padStart(2, '0')}.png`,
        content: plainPng(
          48 + ((i * 37) % 400),
          48 + ((i * 53) % 300),
          (i * 47) % 360,
        ),
      })),
    ),
  );
  file('archives/cut-short.zip', () => {
    const whole = zippedProject();
    return whole.subarray(0, Math.floor(whole.length / 2));
  });
  file('archives/not-an-archive.zip', 'Plain text, named as a zip.\n');
  if (windows) {
    file('archives/downloaded.zip', zippedProject);
    file(
      'archives/downloaded.zip:Zone.Identifier',
      '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/downloaded.zip\r\n',
    );
  }

  section(
    'thumbnails',
    `${large ? 2000 : 200} images of many sizes and colors, to scroll in thumbnails with Mod+2.`,
  );
  for (let i = 0; i < (large ? 2000 : 200); i++) {
    file(`thumbnails/image-${String(i + 1).padStart(4, '0')}.png`, () =>
      plainPng(48 + ((i * 37) % 400), 48 + ((i * 53) % 300), (i * 47) % 360),
    );
  }

  section(
    'compare',
    'Pairs of files to compare with Shift+F3 once both are marked, each differing in one way, or with one on each side.',
  );
  const pair = (
    name: string,
    one: [string, Content | (() => Content)],
    other: [string, Content | (() => Content)],
  ) => {
    file(`compare/${name}-${one[0]}`, one[1]);
    file(`compare/${name}-${other[0]}`, other[1]);
    pairs.push([`compare/${name}-${one[0]}`, `compare/${name}-${other[0]}`]);
  };
  pair('text', ['v1.md', prose(1)], ['v2.md', prose(2)]);
  const codeSource =
    realSources.find((source) => source.endsWith('.ts')) ?? realSources[0];
  pair(
    'code',
    ['v1.ts', () => fs.readFileSync(path.join(appRoot, codeSource))],
    [
      'v2.ts',
      () =>
        changedCode(fs.readFileSync(path.join(appRoot, codeSource), 'utf8')),
    ],
  );
  pair('emoji', ['v1.md', emojiGrid(1)], ['v2.md', emojiGrid(2)]);
  pair('padded-table', ['v1.md', paddedTable(1)], ['v2.md', paddedTable(2)]);
  pair(
    'whitespace-only',
    ['v1.ts', 'if (ready) {\n  go();\n}\n'],
    ['v2.ts', 'if (ready)  {\n\tgo();\n}\n'],
  );
  pair(
    'line-endings',
    ['lf.txt', `${three.join('\n')}\n`],
    ['crlf.txt', `${three.join('\r\n')}\r\n`],
  );
  pair(
    'encoding',
    ['utf-8.txt', () => encoded(unicodeText, 'utf-8')],
    ['utf-16le.txt', () => encoded(`\uFEFF${unicodeText}`, 'utf-16le')],
  );
  pair(
    'binary',
    ['v1.bin', () => binary(4096, 1)],
    ['v2.bin', () => binary(4096, 2)],
  );
  pair(
    'image',
    ['v1.png', () => imageKinds[0].versions()[0]],
    ['v2.png', () => imageKinds[0].versions()[1]],
  );
  pair('csharp', ['v1.cs', dotnetPair[0]], ['v2.cs', dotnetPair[1]]);
  pair('rust', ['v1.rs', rustPair[0]], ['v2.rs', rustPair[1]]);
  pair('identical', ['one.txt', prose(1)], ['two.txt', prose(1)]);
  pair('empty-and-full', ['empty.txt', ''], ['full.txt', prose(1)]);
  pair(
    'many-changes',
    ['v1.txt', () => lines(30_000, (i) => `line ${i + 1}`)],
    [
      'v2.txt',
      () =>
        lines(30_000, (i) =>
          i % 7 === 0 ? `changed line ${i + 1}` : `line ${i + 1}`,
        ),
    ],
  );
  file(
    'compare/settings-left.json',
    '{\n  "theme": "dark",\n  "fontSize": 13\n}\n',
  );
  file(
    'compare/settings-right.json',
    '{\n  "theme": "light",\n  "fontSize": 13,\n  "wrap": true\n}\n',
  );
  pairs.push(['compare/settings-left.json', 'compare/settings-right.json']);

  section(
    'operations',
    'Files to copy from copy-from into copy-to with F5 or move with F6, clashing in every way: the same file, another file of one name, a folder to merge and a read-only target; files to delete; and a file large enough to watch a copy go.',
  );
  file('operations/copy-from/same.txt', 'The same on both sides.\n');
  file('operations/copy-to/same.txt', 'The same on both sides.\n');
  file('operations/copy-from/different.txt', 'The one copied.\n', {
    modified: new Date('2026-02-02T10:00:00Z'),
  });
  file('operations/copy-to/different.txt', 'The one there, older.\n', {
    modified: new Date('2026-01-01T10:00:00Z'),
  });
  file('operations/copy-from/only-here.txt', 'Copied without a question.\n');
  file('operations/copy-from/merged/a.txt', 'Only in copy-from.\n');
  file('operations/copy-from/merged/b.txt', 'The one copied.\n');
  file('operations/copy-to/merged/b.txt', 'The one there.\n');
  file('operations/copy-to/merged/c.txt', 'Only in copy-to.\n');
  file('operations/copy-from/read-only-there.txt', 'The one copied.\n');
  file('operations/copy-to/read-only-there.txt', 'Read-only.\n', {
    readOnly: true,
  });
  file('operations/delete-me.txt', 'Delete me.\n');
  file('operations/delete-me-read-only.txt', 'Delete me too.\n', {
    readOnly: true,
  });
  file('operations/delete-me-folder/inside.txt', 'And me.\n');
  chunks(
    `operations/copy-from/big-${large ? '2-gib' : '64-mib'}.bin`,
    large ? 2 * gib : 64 * mib,
    () => randomOfSize(large ? 2 * gib : 64 * mib, 11),
  );

  const manyFiles = large ? 100_000 : 6000;
  section(
    'many',
    `${manyFiles.toLocaleString('en-US')} files in one folder, read a page at a time.`,
  );
  for (let i = 0; i < manyFiles; i++) {
    file(`many/file-${String(i + 1).padStart(6, '0')}.txt`, '');
  }

  const [fanOut, depth, perFolder] = large ? [6, 5, 10] : [5, 4, 5];
  section(
    'deep',
    `A tree ${depth} folders deep, ${fanOut} folders wide and ${perFolder} files in each, each named after the folders above it, of many sizes and dates, to list flat with Ctrl+B, sort and stop with Esc.`,
  );
  let grown = 0;
  const grow = (under: string, trail: string, level: number) => {
    for (let k = 0; k < perFolder; k++) {
      grown++;
      file(
        `${under}/file-${trail}${k + 1}.${['txt', 'ts', 'md', 'png', 'json'][k % 5]}`,
        'x'.repeat((grown * 7919) % 4096),
        {
          modified: new Date(
            2020 + (grown % 7),
            grown % 12,
            1 + (grown % 28),
            grown % 24,
            grown % 60,
          ),
        },
      );
    }
    if (level < depth) {
      for (let k = 0; k < fanOut; k++) {
        grow(
          `${under}/folder-${trail}${k + 1}`,
          `${trail}${k + 1}-`,
          level + 1,
        );
      }
    }
  };
  grow('deep', '', 1);

  section(
    'repository',
    'A git repository of its own, marked by the git icon, opened in a git tab with Shift+Enter; the other folders are in none, where the menu offers Clone... and Init.',
  );
  file('repository/README.md', '# A repository inside the playground\n');
  file('repository/main.ts', 'export const inside = "a repository";\n');
  items.push({ kind: 'repository', path: 'repository' });

  section(
    'churn',
    'Changed every half second while the script runs with --churn: files added, grown, renamed and deleted, to watch the commander follow.',
  );
  file(
    'churn/README.txt',
    'This folder stays as it is until the playground script runs with --churn:\n\n    npm run playground:files -- --churn\n\nIt then keeps the playground and changes this folder every half second, adding a file, growing growing.log, renaming a file back and forth and deleting the oldest added, until stopped with Ctrl+C, to watch the commander follow, in a folder and in flat view.\n',
  );

  if (large) {
    section(
      'huge',
      'A log of 200 MiB with one NEEDLE near its end, a padded table of 10 MiB, one line of 50 MiB and a PDF of 100 MiB.',
    );
    chunks('huge/log-of-200-mib.log', 200 * mib, () => logOfSize(200 * mib));
    file('huge/padded-table-of-10-mib.md', () => paddedTable(1, 7985));
    chunks('huge/one-line-of-50-mib.txt', 50 * mib, () =>
      oneLineOfSize(50 * mib),
    );
    items.push({
      kind: 'chunks',
      path: 'huge/pdf-of-100-mib.pdf',
      chunks: () => pdfParts(largePdfPages(2300), 2300),
    });
  }

  return { items, pairs, encodings, guide };
}

export function readme(made: Plan, skipped: readonly string[]): string {
  return `# Playground of files

Made by \`npm run playground:files\` to try the commander and the viewer of **Fastforward** by hand, anew each time it runs. \`--large\` adds the huge files, and \`--churn\` keeps changing the churn folder.

| Folder | What it is for |
|---|---|
${made.guide.map(([where, description]) => `| \`${where}\` | ${description} |`).join('\n')}
${skipped.length === 0 ? '' : `\n## Left out on this computer\n\n${skipped.map((reason) => `- ${reason}`).join('\n')}\n`}`;
}
