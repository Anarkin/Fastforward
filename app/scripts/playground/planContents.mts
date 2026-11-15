import { type PdfPage } from './formats.mts';
import { sentence } from './samples.mts';

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
