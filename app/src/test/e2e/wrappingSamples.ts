const longLine = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
  ' ',
);

export const longLines = Array.from(
  { length: 200 },
  (_, index) => `line${index} ${longLine}`,
);
export const [firstLongLine] = longLines;

export const hyphenatedLine = Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('-');

export const dottedLine = `        ${Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('.')};`;

export const breakLines = [
  '--some-very-long-option-name '.repeat(12),
  'alpha–beta–gamma–delta–epsilon–zeta–eta–theta–iota–kappa '.repeat(6),
  'alpha—beta—gamma—delta—epsilon—zeta—eta—theta—iota—kappa '.repeat(6),
  'release-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20 '.repeat(6),
  ' -flag-one -flag-two -flag-three -flag-four --flag-five'.repeat(7),
  'x-1 a-b c- -d e--f g---h '.repeat(16),
  ' -ab'.repeat(80),
  ' -abc'.repeat(70),
  ' --abc'.repeat(60),
  ' —abc'.repeat(70),
  ' –abc'.repeat(70),
  'ab-12'.repeat(70),
  'ab-cd'.repeat(70),
  '12-34'.repeat(70),
  '12-ab'.repeat(70),
  'ab‐cd'.repeat(70),
  'ab–cd'.repeat(70),
  'ab—cd'.repeat(70),
  'ab–12'.repeat(70),
  'ab—12'.repeat(70),
  'ab--cd'.repeat(60),
  'ab---cd'.repeat(55),
  'ab——cd'.repeat(60),
  'ab-(cd)'.repeat(55),
  'ab-.cd'.repeat(60),
  'ab-"cd"'.repeat(55),
  'ab-\u00e9cd'.repeat(60),
  'ab-中文'.repeat(60),
  'ab\u00adcd'.repeat(70),
  'abcdefghij\u200b'.repeat(30),
  'hyphen\u00adated\u00adwords\u00adwith\u00adsoft\u00adhyphens '.repeat(6),
  'ab\u3000'.repeat(60),
  'abc\u3000'.repeat(50),
  'ab \u3000'.repeat(50),
  'ab\u2003'.repeat(60),
  'abc\u2003'.repeat(50),
  '\u672c\u6587\u306e\u3000\u5168\u89d2\u30b9\u30da\u30fc\u30b9\u3000\u3067\u533a\u5207\u308b\u3000\u6587\u7ae0\u3002\u3000'.repeat(
    8,
  ),
  'https://example.com/some/path/to/a-file.txt?query=value&other=1 '.repeat(6),
  '中文中文、中文。「中文」'.repeat(20),
  '😀 emoji😀word 🎉🎉 '.repeat(20),
  '\tindented\twith\ttabs and words '.repeat(12),
  `    ${'indented line with some words to wrap around the edge '.repeat(6)}`,
  'foo(bar).baz[qux]{quux}+corge;grault|garply/waldo&fred,plugh?xyzzy '.repeat(
    6,
  ),
];

export const longestLine = Array.from(
  { length: 4000 },
  (_, index) => `word${index}`,
).join(' ');

export const minifiedLine = `    ${'abcdef.'.repeat(10_000)}`;

export const breakCharacters = [
  ...Array.from({ length: 94 }, (_, index) => String.fromCharCode(33 + index)),
  ...Array.from(
    '‐–—―‒−\u00ad\u200b\u00a0\u2011\u202f\u2060\ufeff\u200d\u0301\u2009\u2002\u2003\u205f\t',
  ),
  ...Array.from('éßαя·•…″°€£±×÷§¶©™→∞«»¿¡‘’“”'),
  ...Array.from('中、。「」（）ア한ァー々・！？：，．〜゠'),
  '😀',
  '👍',
  '🇭',
];

export const breakContexts = ['a', ' ', '(', '中', 'é'];

export const breakSentences = [
  'Árvíztűrő tükörfúrógép — „idézőjel” és ‚másik’ (zárójel) – gondolatjel… vége.',
  'The “quick” brown fox’s jump—over the lazy dog—ended; well… maybe (not).',
  '日本語の文章です。「かぎかっこ」と（丸括弧）、句読点。ーァィゥ々〻！？',
  '本文の　全角スペース　で区切る　文章。　段落',
  '한국어 문장입니다. “따옴표”와 (괄호), 그리고 쉼표!',
  '中文句子，包含标点符号。“引号”和《书名号》！',
  '😀😀 emoji👍🏻 flags 🇭🇺🇺🇸 family 👨‍👩‍👧‍👦 keycap 1️⃣ ⚠️ done',
  'price: €12.50, £3, $4, 50%, 30°C, −5, ±2, 3×4, 6÷2, a→b, ∞',
  'x\u00a0y a\u2011b c\u202fd e\u2060f g\u200bh i\u00adj k\u200dl',
  'https://example.com/ünïcödé/path?q=é&r=中#frag',
  'ab-é é-ab é-1 a-é 1-é (é) [é] {é} é/é é.é é,é é;é é:é é!é é?é é%é',
  'Ελληνικά κείμενο — με παύλες· και «εισαγωγικά».',
  'Русский текст — с тире, «кавычками» и… многоточием.',
  'a‐b–c—d―e−f\tg\th',
];

export const paddedLine = `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes${' '.repeat(50)}|`;
