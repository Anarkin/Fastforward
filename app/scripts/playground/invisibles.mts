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

export const invisibleGroups: readonly InvisibleGroup[] = [
  {
    title:
      'C0 controls, always drawn as their pictures; LF and CR end lines, and NUL is in the hex samples, as the viewer takes a file holding it for bytes',
    characters: c0.filter(({ code }) => !leftOut.has(code)),
  },
  {
    title: 'Delete',
    characters: [{ code: 0x7f, short: 'DEL', name: 'delete' }],
  },
  { title: 'C1 controls', characters: c1 },
  {
    title: 'Line and paragraph separators',
    characters: [
      { code: 0x2028, short: 'LS', name: 'line separator' },
      { code: 0x2029, short: 'PS', name: 'paragraph separator' },
    ],
  },
  {
    title: 'Spaces',
    characters: [
      { code: 0x20, short: 'SP', name: 'space' },
      { code: 0xa0, short: 'NBSP', name: 'no-break space' },
      { code: 0x1680, short: 'OSM', name: 'ogham space mark' },
      ...named(0x2000, [
        ['NQSP', 'en quad'],
        ['MQSP', 'em quad'],
        ['ENSP', 'en space'],
        ['EMSP', 'em space'],
        ['3MSP', 'three-per-em space'],
        ['4MSP', 'four-per-em space'],
        ['6MSP', 'six-per-em space'],
        ['FSP', 'figure space'],
        ['PSP', 'punctuation space'],
        ['THSP', 'thin space'],
        ['HSP', 'hair space'],
      ]),
      { code: 0x202f, short: 'NNBSP', name: 'narrow no-break space' },
      { code: 0x205f, short: 'MMSP', name: 'medium mathematical space' },
      { code: 0x3000, short: 'IDSP', name: 'ideographic space' },
    ],
  },
  {
    title: 'Zero-width and format characters',
    characters: [
      { code: 0x200b, short: 'ZWSP', name: 'zero width space' },
      { code: 0x200c, short: 'ZWNJ', name: 'zero width non-joiner' },
      { code: 0x200d, short: 'ZWJ', name: 'zero width joiner' },
      { code: 0x2060, short: 'WJ', name: 'word joiner' },
      { code: 0xfeff, short: 'BOM', name: 'zero width no-break space' },
      { code: 0xad, short: 'SHY', name: 'soft hyphen' },
      { code: 0x34f, short: 'CGJ', name: 'combining grapheme joiner' },
      { code: 0x180e, short: 'MVS', name: 'mongolian vowel separator' },
      ...named(0x2061, [
        ['FA', 'function application'],
        ['IT', 'invisible times'],
        ['IS', 'invisible separator'],
        ['IP', 'invisible plus'],
      ]),
      ...named(0x206a, [
        ['ISS', 'inhibit symmetric swapping'],
        ['ASS', 'activate symmetric swapping'],
        ['IAFS', 'inhibit arabic form shaping'],
        ['AAFS', 'activate arabic form shaping'],
        ['NADS', 'national digit shapes'],
        ['NODS', 'nominal digit shapes'],
      ]),
    ],
  },
  {
    title: 'Direction marks, embeddings, overrides and isolates',
    characters: [
      { code: 0x200e, short: 'LRM', name: 'left-to-right mark' },
      { code: 0x200f, short: 'RLM', name: 'right-to-left mark' },
      { code: 0x61c, short: 'ALM', name: 'arabic letter mark' },
      ...named(0x202a, [
        ['LRE', 'left-to-right embedding'],
        ['RLE', 'right-to-left embedding'],
        ['PDF', 'pop directional formatting'],
        ['LRO', 'left-to-right override'],
        ['RLO', 'right-to-left override'],
      ]),
      ...named(0x2066, [
        ['LRI', 'left-to-right isolate'],
        ['RLI', 'right-to-left isolate'],
        ['FSI', 'first strong isolate'],
        ['PDI', 'pop directional isolate'],
      ]),
    ],
  },
  {
    title: 'Characters that look like nothing',
    characters: [
      { code: 0x115f, short: 'HCF', name: 'hangul choseong filler' },
      { code: 0x1160, short: 'HJF', name: 'hangul jungseong filler' },
      { code: 0x3164, short: 'HF', name: 'hangul filler' },
      { code: 0xffa0, short: 'HWHF', name: 'halfwidth hangul filler' },
      { code: 0x2800, short: 'BRB', name: 'braille pattern blank' },
      { code: 0x17b4, short: 'KIVAQ', name: 'khmer vowel inherent aq' },
      { code: 0x17b5, short: 'KIVAA', name: 'khmer vowel inherent aa' },
    ],
  },
  {
    title: 'Variation selectors',
    characters: [
      { code: 0xfe00, short: 'VS1', name: 'variation selector-1' },
      { code: 0xfe0e, short: 'VS15', name: 'variation selector-15, as text' },
      { code: 0xfe0f, short: 'VS16', name: 'variation selector-16, as emoji' },
      { code: 0xe0100, short: 'VS17', name: 'variation selector-17' },
      {
        code: 0x180b,
        short: 'FVS1',
        name: 'mongolian free variation selector one',
      },
    ],
  },
  {
    title: 'Tag characters',
    characters: [
      { code: 0xe0001, short: 'TAG', name: 'language tag' },
      { code: 0xe0020, short: 'TSP', name: 'tag space' },
      { code: 0xe0041, short: 'TA', name: 'tag latin capital letter a' },
      { code: 0xe0067, short: 'Tg', name: 'tag latin small letter g' },
      { code: 0xe007f, short: 'CTAG', name: 'cancel tag' },
    ],
  },
  {
    title: 'Interlinear annotation and object replacement',
    characters: [
      { code: 0xfff9, short: 'IAA', name: 'interlinear annotation anchor' },
      { code: 0xfffa, short: 'IAS', name: 'interlinear annotation separator' },
      { code: 0xfffb, short: 'IAT', name: 'interlinear annotation terminator' },
      { code: 0xfffc, short: 'OBJ', name: 'object replacement character' },
    ],
  },
];

const codeName = (code: number) =>
  `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

export function invisibleCatalog(): string {
  const lines = [
    'Every character that shows nothing, takes no room or turns text around, one a line:',
    'its code point, its short name, its name, then itself between bars, between letters and twice.',
    'Show whitespace with `.` to see which the app signs; copy one to see it kept.',
    '',
  ];
  for (const { title, characters } of invisibleGroups) {
    lines.push(`## ${title}`, '');
    for (const { code, short, name } of characters) {
      const character = String.fromCodePoint(code);
      lines.push(
        `${codeName(code).padEnd(9)}${short.padEnd(7)}${name.padEnd(42)}|${character}|  a${character}b  x${character}${character}x`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

export const trojanSource = [
  '// Trojan Source: the right-to-left override and the isolates make the code read',
  '// otherwise than it runs. The string compared holds the comment that seems to follow it.',
  'const accessLevel = "user";',
  'if (accessLevel != "user‮ ⁦// Check if admin⁩ ⁦") {',
  '  console.log("You are an admin.");',
  '}',
  '',
  '/* An override in a comment seems to end it early: ‮ } ⁦if (isAdmin)⁩ ⁦ begin admins only */',
  '',
  '// A zero-width space inside a name makes two names that look alike.',
  'const user​Name = "ada";',
  'const userName = "grace";',
  '',
  '// A no-break space inside a string, and a Hangul filler that looks like a space.',
  'const price = "100 EUR";',
  'const ㅤ = "a name that looks like nothing";',
  '',
].join('\n');

export const invisibleProse = [
  'Soft hyphens, where long words may break: super­cali­fragilistic­expi­ali­docious, Donau­dampf­schiff­fahrts­gesell­schaft.',
  'No-break spaces between numbers and units: 100 km, 5 %, 3 000 Ft, Mr. Smith.',
  'An ideographic space in Japanese: 日本語　のテキスト.',
  'A zero-width non-joiner in Persian: می‌خواهم.',
  'An Arabic letter mark before a number: ؜123.',
  'A byte order mark in the middle of a line: before﻿after.',
  'Zero-width spaces where a long address may break: https://example.com/a​/very​/long​/path.',
  'A word joiner that keeps two words on one row: no⁠break.',
  'Invisible times and function application in math: 2⁢x and f⁡(x).',
  'Spaces of every width: en space, em space, thin space, hair space, figure space.',
  '',
].join('\n');

export const invisibleEmoji = [
  'Emoji joined by zero-width joiners, which should stay whole: 👨‍👩‍👧 👩‍💻 🏳️‍🌈',
  'A heart as text and as emoji, by variation selectors: ❤︎ ❤️',
  'A skin tone: 👍🏽, a keycap: 1️⃣',
  'The flag of Scotland, a black flag and tag characters: 🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  'The same tag characters alone between letters: a\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}b',
  'A zero-width joiner alone between letters: a‍b',
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
    'const total = price​ + tax;',
    'const name = "Ada Lovelace";',
    'if (isAdmin‮) {',
    '  grant();⁠',
    '}',
    'const tabbed = "tab";',
    '',
  ].join('\n'),
};
