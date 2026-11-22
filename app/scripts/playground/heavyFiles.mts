export interface HeavyFile {
  readonly name: string;
  readonly heavy: string;
  readonly before: string;
  readonly after: string;
  readonly oneLine?: true;
}

type Random = () => number;

function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const below = (random: Random, count: number) => Math.floor(random() * count);

const pick = <Item,>(random: Random, items: readonly Item[]): Item =>
  items[below(random, items.length)];

const newline = String.fromCharCode(10);
const tab = String.fromCharCode(9);

const names = [
  'a',
  'b',
  'c',
  'n',
  'm',
  'r',
  't',
  'u',
  'v',
  'q',
  'SHN',
  'DEPTH',
  'RT',
  'D16',
  'LOD',
  'pipes',
  'stat',
  'ubo',
  'bg',
  'cast',
  'view',
  'box',
  'mat',
  'tile',
];

const calls = [
  'tex',
  'plane',
  'layout',
  'mod',
  'ck',
  'fill',
  'draw',
  'bind',
  'mix',
  'clamp',
  'lerp',
  'pack',
];

const operators = ['+', '-', '*', '/', '||', '&&', '===', '<', '>', '?'];

function term(random: Random, depth: number): string {
  const kind = depth > 2 ? below(random, 3) : below(random, 7);
  const name = pick(random, names);
  switch (kind) {
    case 0:
      return String(below(random, 4096));
    case 1:
      return name;
    case 2:
      return `${name}[${below(random, 8)}]`;
    case 3:
      return `${pick(random, calls)}(${term(random, depth + 1)}, ${term(random, depth + 1)})`;
    case 4:
      return `(${term(random, depth + 1)} ${pick(random, operators)} ${term(random, depth + 1)})`;
    case 5:
      return `'${name}-${below(random, 100)}'`;
    default:
      return `${name}.${pick(random, calls)}([${term(random, depth + 1)}], { ${pick(random, names)}: ${term(random, depth + 1)} })`;
  }
}

function statement(random: Random): string {
  const name = `${pick(random, names)}${below(random, 90)}`;
  switch (below(random, 6)) {
    case 0:
      return `const ${name} = ${term(random, 0)}, ${pick(random, names)}${below(random, 9)} = ${term(random, 1)};`;
    case 1:
      return `if (${term(random, 1)} > ${below(random, 64)}) ${pick(random, calls)}(${term(random, 1)}); else ${name} = ${term(random, 1)};`;
    case 2:
      return `for (let i = 0; i < ${below(random, 32)}; i++) { ${pick(random, calls)}(${term(random, 1)}, i); }`;
    case 3:
      return `${name}.${pick(random, calls)}(${term(random, 0)}, [${term(random, 1)}, ${term(random, 1)}]);`;
    case 4:
      return `return ${term(random, 0)} ? ${term(random, 1)} : ${term(random, 1)};`;
    default:
      return `await ${pick(random, calls)}(\`${pick(random, names)} \${${term(random, 2)}} of \${${name}}\`);`;
  }
}

function codeLine(random: Random, statements: number): string {
  return Array.from({ length: statements }, () => statement(random)).join(' ');
}

function denseCode(lines: number, seed: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: lines }, (_, index) =>
    index % 40 === 0
      ? `// ${pick(random, calls)} every ${pick(random, names)} once its ${pick(random, names)} is ${pick(random, calls)}ed, ${index}`
      : codeLine(
          random,
          index % 10 === 7 ? 6 + below(random, 8) : 1 + below(random, 3),
        ),
  );
}

function reworked(
  lines: readonly string[],
  seed: number,
  reword: (line: string, random: Random) => string,
  added: (random: Random, index: number) => string,
): string[] {
  const random = seeded(seed);
  return lines.flatMap((line, index) => {
    if (index % 53 === 11) {
      return [];
    }
    const kept = index % 7 === 3 ? reword(line, random) : line;
    return index % 61 === 17 ? [kept, added(random, index)] : [kept];
  });
}

const renumbered = (line: string, random: Random): string =>
  line.replace(/[0-9]+/, () => String(5000 + below(random, 4000)));

const words = [
  'the',
  'files',
  'of',
  'every',
  'side',
  'shown',
  'read',
  'folder',
  'with',
  'a',
  'line',
  'under',
  'path',
  'once',
  'selected',
  'marked',
  'archive',
  'copied',
  'window',
  'scrolled',
  'drawn',
  'whole',
];

function sentence(random: Random, length: number): string {
  return Array.from({ length }, () => pick(random, words)).join(' ');
}

function prose(lines: number, seed: number, least: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: lines }, () =>
    sentence(random, least + below(random, least)),
  );
}

const rewordedHalf = (line: string, random: Random): string =>
  line
    .split(' ')
    .map((word, at) => (at % 2 === 1 ? pick(random, words) : word))
    .join(' ');

const drawnControls = [
  1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 127,
];

function controlLine(random: Random): string {
  const length = 200 + below(random, 1300);
  return Array.from({ length }, () => {
    const kind = below(random, 20);
    if (kind < 3) {
      return String.fromCharCode(pick(random, drawnControls));
    }
    if (kind === 3) {
      return String.fromCharCode(0x100 + below(random, 0x40));
    }
    return String.fromCharCode(33 + below(random, 94));
  }).join('');
}

function controls(lines: number, seed: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: lines }, () => controlLine(random));
}

const respelled = (line: string, random: Random): string =>
  Array.from(line, (character, at) =>
    Math.floor(at / 12) % 3 === 1
      ? String.fromCharCode(33 + below(random, 94))
      : character,
  ).join('');

function table(rows: number, columns: number, seed: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_cell, column) =>
      column % 3 === 0 ? `${pick(random, words)}${row}` : below(random, 9999),
    ).join(tab),
  );
}

const recelled = (line: string, random: Random): string =>
  line
    .split(tab)
    .map((cell, at) => (at % 5 === 2 ? String(below(random, 9999)) : cell))
    .join(tab);

const wideRuns = [
  [0x4e00, 0x9fa5],
  [0x3041, 0x3096],
  [0x30a1, 0x30fa],
  [0xac00, 0xd7a3],
  [0xff01, 0xff5e],
  [0x1f600, 0x1f64f],
  [0x1f680, 0x1f6c5],
] as const;

function wideWord(random: Random): string {
  const [from, to] = pick(random, wideRuns);
  return String.fromCodePoint(
    ...Array.from(
      { length: 1 + below(random, 5) },
      () => from + below(random, to - from + 1),
    ),
  );
}

function wideLine(random: Random): string {
  return Array.from({ length: 12 + below(random, 24) }, (_, at) =>
    at % 4 === 3 ? pick(random, words) : wideWord(random),
  ).join(' ');
}

function wide(lines: number, seed: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: lines }, () => wideLine(random));
}

const rewidened = (line: string, random: Random): string =>
  line
    .split(' ')
    .map((word, at) => (at % 3 === 1 ? wideWord(random) : word))
    .join(' ');

function minified(statements: number, seed: number): string[] {
  return [
    codeLine(seeded(seed), statements).replaceAll('; ', ';'),
    '//# sourceMappingURL=minified.js.map',
  ];
}

function controlRun(random: Random, length: number): string {
  return Array.from({ length }, (_, at) =>
    String.fromCharCode(
      at % 3 === 1 ? pick(random, drawnControls) : 97 + below(random, 26),
    ),
  ).join('');
}

function mixedPiece(random: Random, kind: number): string {
  switch (kind % 5) {
    case 0:
      return statement(random);
    case 1:
      return `['${wideWord(random)}', '${wideWord(random)} ${wideWord(random)}', "${wideWord(random)}"],`;
    case 2:
      return [
        `${pick(random, names)}${below(random, 90)}`,
        below(random, 9999),
        pick(random, words),
        below(random, 9999),
      ].join(tab);
    case 3:
      return `'${controlRun(random, 9 + below(random, 24))}';`;
    default:
      return `/* ${sentence(random, 3 + below(random, 6))} */`;
  }
}

function mixedLine(random: Random, pieces: number): string {
  const first = below(random, 5);
  return Array.from({ length: pieces }, (_, at) =>
    mixedPiece(random, first + at),
  ).join(' ');
}

function piecesOf(random: Random, index: number): number {
  if (index % 50 === 23) {
    return 80;
  }
  return index % 10 === 7 ? 10 + below(random, 8) : 2 + below(random, 5);
}

function mixedLines(lines: number, seed: number): string[] {
  const random = seeded(seed);
  return Array.from({ length: lines }, (_, index) =>
    mixedLine(random, piecesOf(random, index)),
  );
}

const anotherWord = (random: Random, at: number): string =>
  at % 4 === 1 ? wideWord(random) : pick(random, words);

const remixed = (line: string, random: Random): string =>
  line
    .split(' ')
    .map((word, at) => (at % 2 === 1 ? anotherWord(random, at) : word))
    .join(' ');

const text = (lines: readonly string[]) => `${lines.join(newline)}${newline}`;

export function heavyFiles(): HeavyFile[] {
  const dense = denseCode(3000, 1);
  const reworded = prose(3000, 2, 10);
  const controlled = controls(800, 3);
  const tabbed = table(4000, 24, 4);
  const widened = wide(2000, 5);
  const [bundle = '', map = ''] = minified(4500, 6);
  const paragraphs = prose(500, 7, 300);
  const nemesis = mixedLines(3000, 8);
  return [
    {
      name: 'dense.js',
      heavy:
        'code of some thirty tokens a line, every tenth line several hundred characters long',
      before: text(dense),
      after: text(
        reworked(dense, 11, renumbered, (random) => codeLine(random, 2)),
      ),
    },
    {
      name: 'reworded.txt',
      heavy: 'every seventh line with half of its words changed',
      before: text(reworded),
      after: text(
        reworked(reworded, 12, rewordedHalf, (random) => sentence(random, 12)),
      ),
    },
    {
      name: 'controls.txt',
      heavy:
        'lines of up to 1,500 characters, a control character among every seven',
      before: text(controlled),
      after: text(reworked(controlled, 13, respelled, controlLine)),
    },
    {
      name: 'tabs.tsv',
      heavy: 'rows of 24 cells with a tab between each',
      before: text(tabbed),
      after: text(
        reworked(
          tabbed,
          14,
          recelled,
          (random, index) => table(1, 24, index + below(random, 9))[0] ?? '',
        ),
      ),
    },
    {
      name: 'wide.txt',
      heavy:
        'Chinese, Japanese and Korean characters, fullwidth forms and emoji, three words of four',
      before: text(widened),
      after: text(reworked(widened, 15, rewidened, wideLine)),
    },
    {
      name: 'minified.js',
      heavy: 'code on one line of some 300,000 characters',
      before: text([bundle, map]),
      after: text([renumbered(bundle, seeded(16)), map]),
      oneLine: true,
    },
    {
      name: 'prose.txt',
      heavy: 'paragraphs of 300 to 600 words on a line each',
      before: text(paragraphs),
      after: text(
        reworked(paragraphs, 17, rewordedHalf, (random) =>
          sentence(random, 300),
        ),
      ),
    },
    {
      name: 'nemesis.js',
      heavy:
        'every cost of the others in every line: dense code, strings of wide characters, cells with a tab between each, control characters and comments, every tenth line several hundred characters long and every fiftieth several thousand',
      before: text(nemesis),
      after: text(
        reworked(nemesis, 18, remixed, (random) => mixedLine(random, 4)),
      ),
    },
  ];
}
