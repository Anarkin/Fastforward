import { deflateSync } from 'node:zlib';
import { images } from './gitImages.mts';

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
const pngChunk = (type: string, body: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};
type Color = (x: number, y: number) => readonly [number, number, number];

export const png = (width: number, height: number, color: Color) => {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      rows.set(color(x / width, y / height), row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};
export const shade = (value: number) => Math.round(255 * value);
export const binary = (length: number, seed: number) => {
  const bytes = Buffer.alloc(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
};
const words = ['fast', 'forward', 'commit', 'branch', 'merge', 'rebase', 'tag'];
export const sentence = (seed: number, count: number) =>
  Array.from(
    { length: count },
    (_, i) => words[(seed + i * 3) % words.length],
  ).join(' ');

export const everything = `# Everything Markdown renders

Text with *emphasis*, **strong**, ~~strike~~, \`inline code\` and a [link](https://example.com).
A bare address becomes a link too: https://example.com/docs

## Lists

- One
  - Nested
    - Deeper
- Two

1. First
2. Second

- [x] A task done
- [ ] A task left

## Table

| Left | Center | Right |
|:-----|:------:|------:|
| a | b | c |
| longer cell | 42 | 3.14 |

## Code

\`\`\`ts
export const answer: number = 42;
\`\`\`

\`\`\`python
print("Hello, world!")
\`\`\`

\`\`\`diff
- removed
+ added
\`\`\`

\`\`\`
no language at all
\`\`\`

## Quotes

> A quote
>> A quote in a quote

---

## HTML GitHub keeps

<details><summary>Click to open</summary>

Hidden until opened.

</details>

Press <kbd>Ctrl</kbd>+<kbd>C</kbd>, write H<sub>2</sub>O and E = mc<sup>2</sup>.

## Images

![The playground logo](../../images/logo.png)
`;
export const everythingChanged = everything
  .replace('- Two', '- Two\n- Three, new')
  .replace('| a | b | c |', '| a | b | c |\n| added | row | 7 |')
  .replace('Hidden until opened.', 'Hidden until opened, and changed.');
export const languages = {
  'sample.html': '<!doctype html>\n<p class="greeting">Hello, world!</p>\n',
  'sample.xml': '<greeting to="world">Hello</greeting>\n',
  'sample.yaml': 'greeting:\n  to: world\n  excited: true\n',
  'sample.toml': '[greeting]\nto = "world"\nexcited = true\n',
  'sample.sql': "SELECT 'Hello, world!' AS greeting;\n",
  'Sample.java':
    'class Sample {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}\n',
  'sample.kt': 'fun main() {\n    println("Hello, world!")\n}\n',
  'sample.swift': 'print("Hello, world!")\n',
  'sample.rb': 'puts "Hello, world!"\n',
  'sample.php': '<?php\necho "Hello, world!";\n',
  'sample.c':
    '#include <stdio.h>\n\nint main(void) {\n  puts("Hello, world!");\n}\n',
  'sample.cpp':
    '#include <iostream>\n\nint main() {\n  std::cout << "Hello, world!\\n";\n}\n',
  'sample.h': '#pragma once\n\nvoid greet(const char *world);\n',
  'sample.lua': 'print("Hello, world!")\n',
  'sample.ps1': 'Write-Output "Hello, world!"\n',
  'sample.bat': '@echo off\necho Hello, world!\n',
  'sample.ini': '[greeting]\nto=world\n',
  'sample.diff':
    '--- a/world\n+++ b/world\n@@ -1 +1 @@\n-Hello\n+Hello, world!\n',
  'sample.graphql': 'query Greeting {\n  world { hello }\n}\n',
  'Sample.vue':
    '<template>\n  <p>Hello, {{ world }}!</p>\n</template>\n\n<script setup>\nconst world = "world";\n</script>\n',
  'Sample.svelte':
    '<script>\n  let world = "world";\n</script>\n\n<p>Hello, {world}!</p>\n',
  'sample.tsx':
    'export const Greeting = () => <p className="greeting">Hello, world!</p>;\n',
  'sample.jsx': 'export const Greeting = () => <p>Hello, world!</p>;\n',
  'sample.scss': '$world: #06c;\n\n.greeting {\n  color: $world;\n}\n',
  'sample.less': '@world: #06c;\n\n.greeting {\n  color: @world;\n}\n',
  'sample.r': 'print("Hello, world!")\n',
  'sample.jl': 'println("Hello, world!")\n',
  'sample.hs': 'main :: IO ()\nmain = putStrLn "Hello, world!"\n',
  'sample.ex': 'IO.puts("Hello, world!")\n',
  'sample.dart': "void main() {\n  print('Hello, world!');\n}\n",
  'sample.scala': '@main def hello() = println("Hello, world!")\n',
  'sample.pl': 'print "Hello, world!\\n";\n',
  'sample.zig':
    'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello, world!\\n", .{});\n}\n',
  Dockerfile: 'FROM alpine\nCMD ["echo", "Hello, world!"]\n',
  Makefile: 'world:\n\techo "Hello, world!"\n',
};
export const vector = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">\n  <rect width="96" height="96" rx="16" fill="#eee"/>\n  <circle cx="48" cy="48" r="32" fill="${fill}"/>\n</svg>\n`;
export const decoded = (text: string) => Buffer.from(text, 'base64');
export const imageKinds = [
  {
    extension: 'png',
    terms: ['png', 'portable network graphics'],
    versions: () => [
      png(48, 48, (x, y) => [shade(x * 0.3), shade(0.4 + y * 0.4), 200]),
      png(48, 48, (x, y) => [220, shade(0.4 + y * 0.4), shade(x * 0.3)]),
    ],
  },
  {
    extension: 'jpg',
    terms: ['jpg', 'jpeg', 'photo'],
    versions: () => images.jpg.map(decoded),
  },
  {
    extension: 'jpeg',
    terms: ['jpeg', 'jpg', 'photo'],
    versions: () => images.jpeg.map(decoded),
  },
  { extension: 'gif', terms: ['gif'], versions: () => images.gif.map(decoded) },
  {
    extension: 'webp',
    terms: ['webp'],
    versions: () => images.webp.map(decoded),
  },
  {
    extension: 'avif',
    terms: ['avif'],
    versions: () => images.avif.map(decoded),
  },
  {
    extension: 'bmp',
    terms: ['bmp', 'bitmap'],
    versions: () => images.bmp.map(decoded),
  },
  {
    extension: 'ico',
    terms: ['ico', 'icon', 'favicon'],
    versions: () => images.ico.map(decoded),
  },
  {
    extension: 'svg',
    terms: ['svg', 'vector', 'xml'],
    versions: () => [vector('#06c'), vector('#c60')],
  },
];

const fence = '```';
export const diagrams = `# Diagrams

Mermaid diagrams are drawn; plain text diagrams stay as they are.

## A flowchart

${fence}mermaid
flowchart LR
  Page[Page] -- asks --> Main[Main process]
  Main -- checks --> Repository[(Repository)]
  Main -- runs --> Git{{git}}
  Git -- reads --> Repository
  Main -- sends rows --> Page
  Page -- tokenizes in --> Worker[Syntax worker]
${fence}

## A sequence diagram

${fence}mermaid
sequenceDiagram
  actor Person
  participant Page
  participant Main as Main process
  participant Remote
  Person->>Page: Pull
  Page->>Main: pull main
  Main->>Remote: git fetch --all
  Remote-->>Main: new commits
  Main->>Main: git merge --ff-only
  Main-->>Page: refs changed
  Page-->>Person: Pulled 3 commits
${fence}

## A state diagram

${fence}mermaid
stateDiagram-v2
  [*] --> Clean
  Clean --> Changed: edit a file
  Changed --> Staged: git add
  Staged --> Clean: git commit
  Changed --> Clean: git restore
  Staged --> Changed: git restore --staged
${fence}

## A diagram that cannot be drawn

${fence}mermaid
flowchart LR
  A -->
${fence}

## Plain text architecture

${fence}text
+--------------------------------------------------+
|                  Electron window                 |
|  +--------------------+   +-------------------+  |
|  |        Page        |   |   Syntax worker   |  |
|  |  React, markdown,  |-->|  shiki, Oniguruma |  |
|  |  images, diagrams  |<--|  TextMate grammars|  |
|  +---------^----------+   +-------------------+  |
+------------|-------------------------------------+
             | messages, checked on arrival
+------------v-------------------------------------+
|                   Main process                   |
|   history per worktree, refs, fetches, settings  |
+------------+--------------------------+----------+
             |                          |
        +----v----+               +-----v------+
        |   git   |-------------->| Repository |
        +---------+               +------------+
${fence}

${fence}text
 local                       origin
 -----                       ------
 main  o---o---o---o         main  o---o---o
                   \\                         \\
 topic              o---o    topic            o
                                              ^
            fetch  <------------------------- |
            push   -------------------------> |
${fence}

${fence}
Request flow, without a language

  [ Pull ] --> page --> main --> git fetch --all
                                   |
                                   v
                              git merge --ff-only
                                   |
                                   v
                     refs changed --> page redraws
${fence}
`;

interface Glyph {
  readonly text: string;
  readonly width: number;
}

const wide = (text: string): Glyph => ({ text, width: 2 });
const narrow = (text: string): Glyph => ({ text, width: 1 });
const gridWidth = 40;
const ruler = '....:....1....:....2....:....3....:....4|';
const gridRow = (glyphs: readonly Glyph[]) =>
  `${glyphs.map(({ text }) => text).join('')}${' '.repeat(gridWidth - glyphs.reduce((sum, { width }) => sum + width, 0))}|`;
const drift = (glyph: Glyph, rows: number) => [
  ruler,
  gridRow([]),
  ...Array.from({ length: rows }, (_, i) =>
    gridRow(Array.from({ length: i + 1 }, () => glyph)),
  ),
];
const rowsOf = (glyphs: readonly Glyph[]) => [
  ruler,
  ...glyphs.map((glyph) =>
    gridRow(
      Array.from(
        { length: Math.floor(gridWidth / 2 / glyph.width) },
        () => glyph,
      ),
    ),
  ),
  gridRow(glyphs),
];
const block = (title: string, rows: readonly string[]) =>
  `## ${title}\n\n${fence}text\n${rows.join('\n')}\n${fence}\n`;

export const emojiGrid = (version: 1 | 2) => {
  const family = wide(version === 1 ? '👨‍👩‍👧‍👦' : '👨‍👩‍👧‍👧');
  const toned = wide(version === 1 ? '👋🏽' : '👋🏿');
  return `# Emoji in a monospace grid

Each block is padded as a terminal counts widths: an emoji or a Chinese, Japanese or Korean character 2 columns, anything else 1. Where the grid holds, the bars line up.

${[
  block('Drift, one more emoji a row', drift(wide('😀'), 20)),
  block('Drift, one more Chinese character a row', drift(wide('漢'), 20)),
  block('Drift, one more Korean syllable a row', drift(wide('한'), 20)),
  block(
    'Joined by zero width joiners',
    rowsOf([wide('👩‍💻'), family, wide('🧑‍🚀'), wide('🏳️‍🌈'), wide('🐻‍❄️')]),
  ),
  block(
    'Skin tones',
    rowsOf([wide('👋🏻'), wide('👋🏼'), toned, wide('👋🏾'), wide('👍🏿')]),
  ),
  block('Flags', rowsOf([wide('🇭🇺'), wide('🇯🇵'), wide('🇺🇦'), wide('🇧🇷')])),
  block(
    'Keycaps and variation selectors',
    rowsOf([wide('1️⃣'), wide('#️⃣'), wide('❤️'), narrow('❤'), narrow('☺︎')]),
  ),
  block(
    'Combining marks',
    rowsOf([narrow('é'), narrow('ñ'), narrow('ạ̃'), narrow('Z̤͔ͧ̑')]),
  ),
  block(
    'Full width and half width',
    rowsOf([wide('Ａ'), wide('１'), narrow('ｱ'), narrow('ﾝ')]),
  ),
  block('Box drawing', [
    ruler,
    gridRow([
      narrow('┌'),
      ...Array.from({ length: 38 }, () => narrow('─')),
      narrow('┐'),
    ]),
    gridRow([
      narrow('│'),
      wide('😀'),
      wide('漢'),
      ...Array.from({ length: 34 }, () => narrow(' ')),
      narrow('│'),
    ]),
    gridRow([
      narrow('└'),
      ...Array.from({ length: 38 }, () => narrow('─')),
      narrow('┘'),
    ]),
  ]),
  block('Mixed on one line', [
    ruler,
    gridRow([
      narrow('a'),
      wide('漢'),
      wide('😀'),
      narrow('b'),
      wide('👩‍💻'),
      narrow('é'),
      wide('🇭🇺'),
      wide('한'),
      narrow('ｱ'),
      wide('Ａ'),
    ]),
  ]),
].join('\n')}`;
};

const displayWidth = (text: string) =>
  Array.from(text).reduce(
    (sum, character) =>
      sum + ((character.codePointAt(0) ?? 0) >= 0x2700 ? 2 : 1),
    0,
  );
const padTo = (text: string, width: number) =>
  `${text}${' '.repeat(Math.max(0, width - displayWidth(text)))}`;
const tiers = ['Core', 'Common', 'Advanced', 'Niche'];
const statuses = ['✅ Yes', '🟡 Partial', '❌ No'];
const longNote = Array.from(
  { length: 14 },
  (_, i) =>
    `note ${i + 1} of a cell so long that prettier pads every other cell of its column to it`,
).join('; ');

export const paddedTable = (version: 1 | 2, rows = 70) => {
  const header = [
    'Feature',
    'What it does',
    'Git command',
    'Tier',
    'Fastforward',
    'Notes',
  ];
  const body = Array.from({ length: rows }, (_, index) => {
    const n = index + 1;
    return [
      version === 2 && n === 3 ? `Feature ${n}b` : `Feature ${n}`,
      `What feature ${n} does, in a few words`,
      `\`git command-${n} --flag\``,
      tiers[n % tiers.length],
      statuses[n % statuses.length],
      n === 5 ? longNote : n % 4 === 0 ? `A shorter note on feature ${n}` : '',
    ];
  }).filter((_, index) => version === 1 || index !== 19);
  const widths = header.map((title, column) =>
    Math.max(
      displayWidth(title),
      ...body.map((row) => displayWidth(row[column])),
    ),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, column) => padTo(cell, widths[column])).join(' | ')} |`;
  const lines = [
    line(header),
    `|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`,
    ...body.map((cells, index) =>
      version === 2 && index === 6
        ? line(cells).replace(
            'What feature 7 does, in a few words',
            'What feature 7 does now, in other words',
          )
        : line(cells),
    ),
  ];
  return `# Whitespace test file

## Padded table, as prettier pads Markdown

${lines.join('\n')}

## Indented with tabs and spaces

\tone tab
        eight spaces
\t    a tab and four spaces
    \ta tab after four spaces

## Trailing whitespace

spaces after this line${'   '}
a tab after this line\t
${'          '}
\t\t

## A thousand spaces between two words

start${' '.repeat(1000)}end
`;
};
