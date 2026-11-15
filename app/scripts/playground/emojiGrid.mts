const fence = '```';

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
