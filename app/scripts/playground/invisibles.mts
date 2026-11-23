interface Invisible {
  readonly code: number;
  readonly short: string;
  readonly name: string;
}

interface InvisibleGroup {
  readonly title: string;
  readonly characters: readonly Invisible[];
}

const named = (
  first: number,
  names: readonly (readonly [string, string])[],
): Invisible[] =>
  names.map(([short, name], at) => ({ code: first + at, short, name }));

const c0 = named(0x00, [
  ['NUL', 'null'],
  ['SOH', 'start of heading'],
  ['STX', 'start of text'],
  ['ETX', 'end of text'],
  ['EOT', 'end of transmission'],
  ['ENQ', 'enquiry'],
  ['ACK', 'acknowledge'],
  ['BEL', 'bell'],
  ['BS', 'backspace'],
  ['HT', 'character tabulation'],
  ['LF', 'line feed'],
  ['VT', 'line tabulation'],
  ['FF', 'form feed'],
  ['CR', 'carriage return'],
  ['SO', 'shift out'],
  ['SI', 'shift in'],
  ['DLE', 'data link escape'],
  ['DC1', 'device control one'],
  ['DC2', 'device control two'],
  ['DC3', 'device control three'],
  ['DC4', 'device control four'],
  ['NAK', 'negative acknowledge'],
  ['SYN', 'synchronous idle'],
  ['ETB', 'end of transmission block'],
  ['CAN', 'cancel'],
  ['EM', 'end of medium'],
  ['SUB', 'substitute'],
  ['ESC', 'escape'],
  ['FS', 'information separator four'],
  ['GS', 'information separator three'],
  ['RS', 'information separator two'],
  ['US', 'information separator one'],
]);

const leftOut = new Set([0x00, 0x0a, 0x0d]);

const c1 = named(0x80, [
  ['PAD', 'padding character'],
  ['HOP', 'high octet preset'],
  ['BPH', 'break permitted here'],
  ['NBH', 'no break here'],
  ['IND', 'index'],
  ['NEL', 'next line'],
  ['SSA', 'start of selected area'],
  ['ESA', 'end of selected area'],
  ['HTS', 'character tabulation set'],
  ['HTJ', 'character tabulation with justification'],
  ['VTS', 'line tabulation set'],
  ['PLD', 'partial line forward'],
  ['PLU', 'partial line backward'],
  ['RI', 'reverse line feed'],
  ['SS2', 'single shift two'],
  ['SS3', 'single shift three'],
  ['DCS', 'device control string'],
  ['PU1', 'private use one'],
  ['PU2', 'private use two'],
  ['STS', 'set transmit state'],
  ['CCH', 'cancel character'],
  ['MW', 'message waiting'],
  ['SPA', 'start of guarded area'],
  ['EPA', 'end of guarded area'],
  ['SOS', 'start of string'],
  ['SGC', 'single graphic character introducer'],
  ['SCI', 'single character introducer'],
  ['CSI', 'control sequence introducer'],
  ['ST', 'string terminator'],
  ['OSC', 'operating system command'],
  ['PM', 'privacy message'],
  ['APC', 'application program command'],
]);

const known = new Map<number, readonly [string, string]>([
  [0x7f, ['DEL', 'delete']],
  [0x2028, ['LS', 'line separator']],
  [0x2029, ['PS', 'paragraph separator']],
  [0x20, ['SP', 'space']],
  [0xa0, ['NBSP', 'no-break space']],
  [0x1680, ['OSM', 'ogham space mark']],
  [0x2000, ['NQSP', 'en quad']],
  [0x2001, ['MQSP', 'em quad']],
  [0x2002, ['ENSP', 'en space']],
  [0x2003, ['EMSP', 'em space']],
  [0x2004, ['3MSP', 'three-per-em space']],
  [0x2005, ['4MSP', 'four-per-em space']],
  [0x2006, ['6MSP', 'six-per-em space']],
  [0x2007, ['FSP', 'figure space']],
  [0x2008, ['PSP', 'punctuation space']],
  [0x2009, ['THSP', 'thin space']],
  [0x200a, ['HSP', 'hair space']],
  [0x202f, ['NNBSP', 'narrow no-break space']],
  [0x205f, ['MMSP', 'medium mathematical space']],
  [0x3000, ['IDSP', 'ideographic space']],
  [0x200e, ['LRM', 'left-to-right mark']],
  [0x200f, ['RLM', 'right-to-left mark']],
  [0x61c, ['ALM', 'arabic letter mark']],
  [0x202a, ['LRE', 'left-to-right embedding']],
  [0x202b, ['RLE', 'right-to-left embedding']],
  [0x202c, ['PDF', 'pop directional formatting']],
  [0x202d, ['LRO', 'left-to-right override']],
  [0x202e, ['RLO', 'right-to-left override']],
  [0x2066, ['LRI', 'left-to-right isolate']],
  [0x2067, ['RLI', 'right-to-left isolate']],
  [0x2068, ['FSI', 'first strong isolate']],
  [0x2069, ['PDI', 'pop directional isolate']],
  [0xad, ['SHY', 'soft hyphen']],
  [0x600, ['ANS', 'arabic number sign']],
  [0x601, ['ASS', 'arabic sign sanah']],
  [0x602, ['AFM', 'arabic footnote marker']],
  [0x603, ['ASF', 'arabic sign safha']],
  [0x604, ['ASM', 'arabic sign samvat']],
  [0x605, ['ANMA', 'arabic number mark above']],
  [0x6dd, ['AEA', 'arabic end of ayah']],
  [0x70f, ['SAM', 'syriac abbreviation mark']],
  [0x890, ['APD', 'arabic pound mark above']],
  [0x891, ['APM', 'arabic piastre mark above']],
  [0x8e2, ['ADEA', 'arabic disputed end of ayah']],
  [0x180e, ['MVS', 'mongolian vowel separator']],
  [0x200b, ['ZWSP', 'zero width space']],
  [0x200c, ['ZWNJ', 'zero width non-joiner']],
  [0x200d, ['ZWJ', 'zero width joiner']],
  [0x2060, ['WJ', 'word joiner']],
  [0x2061, ['FA', 'function application']],
  [0x2062, ['IT', 'invisible times']],
  [0x2063, ['IS', 'invisible separator']],
  [0x2064, ['IP', 'invisible plus']],
  [0x206a, ['ISS', 'inhibit symmetric swapping']],
  [0x206b, ['ASS', 'activate symmetric swapping']],
  [0x206c, ['IAFS', 'inhibit arabic form shaping']],
  [0x206d, ['AAFS', 'activate arabic form shaping']],
  [0x206e, ['NADS', 'national digit shapes']],
  [0x206f, ['NODS', 'nominal digit shapes']],
  [0xfeff, ['BOM', 'zero width no-break space']],
  [0xfff9, ['IAA', 'interlinear annotation anchor']],
  [0xfffa, ['IAS', 'interlinear annotation separator']],
  [0xfffb, ['IAT', 'interlinear annotation terminator']],
  [0x110bd, ['KNS', 'kaithi number sign']],
  [0x110cd, ['KNSA', 'kaithi number sign above']],
  [0x1bca0, ['SLO', 'shorthand format letter overlap']],
  [0x1bca1, ['SCO', 'shorthand format continuing overlap']],
  [0x1bca2, ['SDS', 'shorthand format down step']],
  [0x1bca3, ['SUS', 'shorthand format up step']],
  [0x34f, ['CGJ', 'combining grapheme joiner']],
  [0x115f, ['HCF', 'hangul choseong filler']],
  [0x1160, ['HJF', 'hangul jungseong filler']],
  [0x3164, ['HF', 'hangul filler']],
  [0xffa0, ['HWHF', 'halfwidth hangul filler']],
  [0x17b4, ['KIVAQ', 'khmer vowel inherent aq']],
  [0x17b5, ['KIVAA', 'khmer vowel inherent aa']],
  [0x2800, ['BRB', 'braille pattern blank']],
  [0x301, ['ACUTE', 'combining acute accent, alone']],
  [0x20e3, ['KEYCAP', 'combining enclosing keycap, alone']],
  [0x1f3fb, ['SKIN1', 'emoji skin tone 1-2, alone']],
  [0xfffc, ['OBJ', 'object replacement character']],
  [0xfffd, ['REPL', 'replacement character']],
]);

const controlNames = new Map(
  [...c0, ...c1].map(({ code, short, name }) => [code, [short, name] as const]),
);

const isIn = (pattern: RegExp) => (code: number) =>
  pattern.test(String.fromCodePoint(code));

const isUnassigned = isIn(/\p{Cn}/u);

const assigned = (code: number) => !isUnassigned(code);

const isSurrogate = (code: number) => code >= 0xd800 && code <= 0xdfff;

const everyCode = Array.from({ length: 0x110000 }, (_, code) => code).filter(
  (code) => !isSurrogate(code),
);

const isTag = (code: number) => code >= 0xe0000 && code <= 0xe007f;

const direction = new Set([
  0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
  0x2068, 0x2069,
]);

const ordinals = ['one', 'two', 'three', 'four'];

const isPrivate = isIn(/\p{Co}/u);

function nameOf(code: number): readonly [string, string] {
  const given = known.get(code) ?? controlNames.get(code);
  if (given !== undefined) {
    return given;
  }
  if (code >= 0xfe00 && code <= 0xfe0f) {
    const number = code - 0xfe00 + 1;
    return [`VS${number}`, `variation selector-${number}`];
  }
  if (code >= 0xe0100 && code <= 0xe01ef) {
    const number = code - 0xe0100 + 17;
    return [`VS${number}`, `variation selector-${number}`];
  }
  if (code >= 0x180b && code <= 0x180f) {
    const at = code === 0x180f ? 3 : code - 0x180b;
    return [
      `FVS${at + 1}`,
      `mongolian free variation selector ${ordinals[at] ?? ''}`,
    ];
  }
  if (code === 0xe0001) {
    return ['TAG', 'language tag'];
  }
  if (code === 0xe007f) {
    return ['CTAG', 'cancel tag'];
  }
  if (code === 0xe0020) {
    return ['TSP', 'tag space'];
  }
  if (isTag(code) && assigned(code)) {
    const letter = String.fromCodePoint(code - 0xe0000);
    return [`T${letter}`, `tag ${letter}`];
  }
  if (code >= 0x13430 && code <= 0x1343f) {
    return ['EHF', 'egyptian hieroglyph format control'];
  }
  if (code >= 0x1d173 && code <= 0x1d17a) {
    return ['MBC', 'musical symbol beam or tie control'];
  }
  if ((code & 0xfffe) === 0xfffe || (code >= 0xfdd0 && code <= 0xfdef)) {
    return ['NONC', 'noncharacter'];
  }
  if (isPrivate(code)) {
    return ['PUA', 'private use'];
  }
  return assigned(code)
    ? ['FMT', 'format character']
    : ['UNAS', 'unassigned, which Unicode keeps ignorable'];
}

const group = (title: string, codes: readonly number[]): InvisibleGroup => ({
  title,
  characters: codes.map((code) => {
    const [short, name] = nameOf(code);
    return { code, short, name };
  }),
});

const where = (wanted: (code: number) => boolean) => everyCode.filter(wanted);

const isFormat = isIn(/\p{Cf}/u);

const isSeparator = isIn(/[\p{Zl}\p{Zp}]/u);

const isSpace = isIn(/\p{Zs}/u);

const isSelector = isIn(/\p{Variation_Selector}/u);

const isIgnorable = isIn(/\p{Default_Ignorable_Code_Point}/u);

const isControl = isIn(/\p{Cc}/u);

const planeEnds = Array.from({ length: 17 }, (_, plane) => [
  plane * 0x10000 + 0xfffe,
  plane * 0x10000 + 0xffff,
]).flat();

export const invisibleGroups: readonly InvisibleGroup[] = [
  {
    title:
      'C0 controls; LF and CR end lines, and NUL is in the hex samples, as the viewer takes a file holding it for bytes',
    characters: c0.filter(({ code }) => !leftOut.has(code)),
  },
  group('Delete', [0x7f]),
  { title: 'C1 controls', characters: c1 },
  group('Line and paragraph separators', where(isSeparator)),
  group('Spaces', where(isSpace)),
  group(
    'Direction marks, embeddings, overrides and isolates',
    [...direction].toSorted((one, other) => one - other),
  ),
  group(
    'Format characters',
    where(
      (code) =>
        isFormat(code) &&
        !direction.has(code) &&
        !isTag(code) &&
        assigned(code),
    ),
  ),
  group('Variation selectors', where(isSelector)),
  group(
    'Tag characters',
    where((code) => isTag(code) && isFormat(code) && assigned(code)),
  ),
  group(
    'Other characters Unicode lets render as nothing',
    where(
      (code) =>
        isIgnorable(code) &&
        assigned(code) &&
        !isFormat(code) &&
        !isSelector(code) &&
        !isControl(code) &&
        !isSpace(code),
    ),
  ),
  group('A symbol that looks like a space, drawn as the spaces are', [0x2800]),
  group(
    'Marks and modifiers with nothing to attach to',
    [0x301, 0x20e3, 0x1f3fb],
  ),
  group(
    'Replacement, object and private use characters, the object replacement character drawn as the invisible ones are',
    [0xfffc, 0xfffd, 0xe000, 0xf8ff, 0xf0000, 0xffffd, 0x100000, 0x10fffd],
  ),
  group('Noncharacters, drawn as the invisible ones are', [
    ...Array.from({ length: 0x20 }, (_, at) => 0xfdd0 + at),
    ...planeEnds,
  ]),
  group(
    'Unassigned code points Unicode keeps ignorable, a few of thousands',
    [0x2065, 0xfff0, 0xe0000, 0xe0002, 0xe0080, 0xe0fff],
  ),
];

interface DrawingRule {
  readonly title: string;
  readonly codes: readonly number[];
  readonly samples?: readonly string[];
}

export const drawingRules: readonly DrawingRule[] = [
  {
    title: 'The space: a dot the app draws, only while whitespace is shown',
    codes: [0x20],
  },
  {
    title:
      'The tab: → of the font, in the first cell of its stop, only while whitespace is shown',
    codes: [0x09],
  },
  {
    title:
      'Every other space, the no-break spaces and the braille blank too: ¤ of the font, always, as nothing in a usual text looks like them, as many cells as the space is wide',
    codes: [0xa0, 0x202f, 0x2003, 0x3000, 0x2800],
  },
  {
    title:
      'LF, CR and CRLF: they end the line, a CR alone too, signed after it by ␊, ␍ and ␍␊ of the font while whitespace is shown, so none has a line here; a wrapped row ends in ⏎',
    codes: [],
  },
  {
    title:
      'Every other character that shows nothing: ¤ of the font, always, a cell each, in the muted color of the signs, C0 and C1 controls, the delete, separators of lines, format characters, direction controls, which turn no text around, selectors, tags, fillers, noncharacters and the object replacement character alike; in Hex and Bytes every byte that is no printable ASCII',
    codes: [
      0x07, 0x0c, 0x1b, 0x7f, 0x85, 0xad, 0x200b, 0x2028, 0xfeff, 0x202e,
      0x2066, 0xfe0f, 0x3164, 0xe0067, 0xfffc, 0xfdd0,
    ],
  },
  {
    title:
      'Joined to an ordinary character, before or after it: split out of it onto a cell of its own, the character kept as it is, and a skin tone after a letter onto cells of its own',
    codes: [],
    samples: [
      'a joiner and a selector after letters:  a\u200Db  |\uFE0F|  x\uFE0F\uFE0Fx',
      'an arabic number sign before a digit:  \u06001',
      'a skin tone after a letter:  a\u{1F3FB}',
      'an accent is no such character, and stays on its letter:  e\u0301 a\u0308',
    ],
  },
  {
    title:
      'Inside an emoji: left whole, the joiners, selectors, skin tones and tags drawn as the one picture they make',
    codes: [],
    samples: [
      'a family, a heart as emoji, a keycap, a skin tone, a flag of tags:  👨\u200D👩\u200D👧  ❤\uFE0F  1\uFE0F⃣  👍🏽  🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    ],
  },
];

const codeName = (code: number) =>
  `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

function lineOf(code: number, [short, name]: readonly [string, string]) {
  const character = String.fromCodePoint(code);
  return `${codeName(code).padEnd(9)}${short.padEnd(7)}${name.padEnd(42)}|${character}|  a${character}b  x${character}${character}x`;
}

export function invisibleCatalog(): string {
  const lines = [
    'Every character that shows nothing, takes no room or turns text around, one a line:',
    'its code point, its short name, its name, then itself between bars, between letters and twice.',
    'Show whitespace with `.` to sign the spaces, the tabs and the line ends too; copy one to see it kept.',
    '',
  ];
  lines.push('# How the app draws them, a sample of each rule', '');
  for (const { title, codes, samples = [] } of drawingRules) {
    const shown = [
      ...codes.map((code) => lineOf(code, nameOf(code))),
      ...samples,
    ];
    lines.push(`## ${title}`, '', ...shown, ...(shown.length > 0 ? [''] : []));
  }
  lines.push('# Every character, by kind', '');
  for (const { title, characters } of invisibleGroups) {
    lines.push(`## ${title}`, '');
    for (const { code, short, name } of characters) {
      lines.push(lineOf(code, [short, name]));
    }
    lines.push('');
  }
  return lines.join('\n');
}

export const trojanSource = [
  '// Trojan Source: the right-to-left override and the isolates make the code read',
  '// otherwise than it runs. The string compared holds the comment that seems to follow it.',
  'const accessLevel = "user";',
  'if (accessLevel != "user\u202E \u2066// Check if admin\u2069 \u2066") {',
  '  console.log("You are an admin.");',
  '}',
  '',
  '/* An override in a comment seems to end it early: \u202E } \u2066if (isAdmin)\u2069 \u2066 begin admins only */',
  '',
  '// A zero-width space inside a name makes two names that look alike.',
  'const user\u200BName = "ada";',
  'const userName = "grace";',
  '',
  '// A no-break space inside a string, and a Hangul filler that looks like a space.',
  'const price = "100\u00A0EUR";',
  'const \u3164 = "a name that looks like nothing";',
  '',
].join('\n');

export const invisibleProse = [
  'Soft hyphens, where long words may break: super\u00ADcali\u00ADfragilistic\u00ADexpi\u00ADali\u00ADdocious, Donau\u00ADdampf\u00ADschiff\u00ADfahrts\u00ADgesell\u00ADschaft.',
  'No-break spaces between numbers and units: 100\u00A0km, 5\u202F%, 3\u00A0000\u00A0Ft, Mr.\u00A0Smith.',
  'An ideographic space in Japanese: 日本語\u3000のテキスト.',
  'A zero-width non-joiner in Persian: می\u200Cخواهم.',
  'An Arabic letter mark before a number: \u061C123.',
  'A byte order mark in the middle of a line: before\uFEFFafter.',
  'Zero-width spaces where a long address may break: https://example.com/a\u200B/very\u200B/long\u200B/path.',
  'A word joiner that keeps two words on one row: no\u2060break.',
  'Invisible times and function application in math: 2\u2062x and f\u2061(x).',
  'Spaces of every width: en\u2002space, em\u2003space, thin\u2009space, hair\u200Aspace, figure\u2007space.',
  '',
].join('\n');

export const invisibleEmoji = [
  'Emoji joined by zero-width joiners, which should stay whole: 👨\u200D👩\u200D👧 👩\u200D💻 🏳\uFE0F\u200D🌈',
  'A heart as text and as emoji, by variation selectors: ❤\uFE0E ❤\uFE0F',
  'A skin tone: 👍🏽, a keycap: 1\uFE0F⃣',
  'The flag of Scotland, a black flag and tag characters: 🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  'The same tag characters alone between letters: a\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}b',
  'A zero-width joiner alone between letters: a\u200Db',
  '',
].join('\n');

const c1Codes = Array.from({ length: 0x20 }, (_, at) => 0x80 + at);

export const c1Utf8 = [
  'C1 controls decoded from UTF-8, each between bars:',
  c1Codes.map((code) => `|${String.fromCodePoint(code)}|`).join(' '),
  '',
].join('\n');

export function c1Windows1252(): Buffer {
  return Buffer.concat([
    Buffer.from(
      'The same bytes 0x80 to 0x9F in Windows-1252, where most are letters and signs:\n',
    ),
    ...c1Codes.map((code) => Buffer.from([0x7c, code, 0x7c, 0x20])),
    Buffer.from('\n'),
  ]);
}

export const invisiblesCompared = {
  old: [
    'const total = price + tax;',
    'const name = "Ada Lovelace";',
    'if (isAdmin) {',
    '  grant();',
    '}',
    'const tabbed =\t"tab";',
    '',
  ].join('\n'),
  new: [
    'const total = price\u200B + tax;',
    'const name = "Ada\u00A0Lovelace";',
    'if (isAdmin\u202E) {',
    '  grant();\u2060',
    '}',
    'const tabbed = "tab";',
    '',
  ].join('\n'),
};
