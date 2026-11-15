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
