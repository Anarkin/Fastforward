const csvRow = (cells: readonly (string | number)[], separator = ',') =>
  cells
    .map((cell) =>
      typeof cell === 'string' && /[",;\t\n]/.test(cell)
        ? `"${cell.replaceAll('"', '""')}"`
        : String(cell),
    )
    .join(separator);

export const csvFiles: Readonly<Record<string, string>> = {
  'csv-quoted-fields.csv': `${[
    ['name', 'note', 'size'],
    ['plain', 'nothing to quote', 1],
    ['comma', 'one, two, three', 2],
    ['quote', 'she said "hello"', 3],
    ['newline', 'a line\nand another inside one field', 4],
    ['empty', '', 5],
  ]
    .map((row) => csvRow(row))
    .join('\r\n')}\r\n`,
  'csv-semicolons-as-excel-writes-in-hungary.csv': `﻿${[
    ['Név', 'Összeg', 'Dátum'],
    ['Árvíztűrő tükörfúrógép', '1 234,56', '2026.02.01.'],
    ['Kávé', '890,00', '2026.02.02.'],
    ['Sütemény', '1 250,50', '2026.02.03.'],
  ]
    .map((row) => csvRow(row, ';'))
    .join('\r\n')}\r\n`,
  'csv-tab-separated.tsv': `${[
    ['id', 'name', 'kind'],
    [1, 'emoji-grid.md', 'text'],
    [2, 'large.png', 'image'],
    [3, 'bundle.zip', 'archive'],
  ]
    .map((row) => row.join('\t'))
    .join('\n')}\n`,
  'csv-unicode.csv': `${[
    ['language', 'greeting'],
    ['Magyar', 'Szia, világ!'],
    ['日本語', 'こんにちは世界'],
    ['עברית', 'שלום עולם'],
    ['Emoji', '👋🌍 👩‍💻'],
  ]
    .map((row) => csvRow(row))
    .join('\n')}\n`,
  'csv-wide-of-200-columns.csv': `${[
    Array.from({ length: 200 }, (_, column) => `column ${column + 1}`),
    ...Array.from({ length: 50 }, (_row, row) =>
      Array.from({ length: 200 }, (_, column) => row * 200 + column),
    ),
  ]
    .map((row) => csvRow(row))
    .join('\n')}\n`,
};

export const csvRows = (count: number) =>
  `id,name,size,modified,kind\n${Array.from(
    { length: count },
    (_, i) =>
      `${i + 1},file-${i + 1}.txt,${(i * 7919) % 1_000_000},2026-02-${String((i % 28) + 1).padStart(2, '0')},${['text', 'image', 'archive', 'program'][i % 4]}`,
  ).join('\n')}\n`;
