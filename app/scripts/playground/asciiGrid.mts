const fence = '```';

const controls: readonly (readonly [string, string])[] = [
  ['NUL', 'null'],
  ['SOH', 'start of heading'],
  ['STX', 'start of text'],
  ['ETX', 'end of text'],
  ['EOT', 'end of transmission'],
  ['ENQ', 'enquiry'],
  ['ACK', 'acknowledge'],
  ['BEL', 'bell'],
  ['BS', 'backspace'],
  ['HT', 'horizontal tab'],
  ['LF', 'line feed'],
  ['VT', 'vertical tab'],
  ['FF', 'form feed'],
  ['CR', 'carriage return'],
  ['SO', 'shift out'],
  ['SI', 'shift in'],
  ['DLE', 'data link escape'],
  ['DC1', 'device control 1'],
  ['DC2', 'device control 2'],
  ['DC3', 'device control 3'],
  ['DC4', 'device control 4'],
  ['NAK', 'negative acknowledge'],
  ['SYN', 'synchronous idle'],
  ['ETB', 'end of transmission block'],
  ['CAN', 'cancel'],
  ['EM', 'end of medium'],
  ['SUB', 'substitute'],
  ['ESC', 'escape'],
  ['FS', 'file separator'],
  ['GS', 'group separator'],
  ['RS', 'record separator'],
  ['US', 'unit separator'],
];

const deleteCode = 127;
const notWritten = new Set([0, 10, 13]);
const gridWidth = 40;
const ruler = '....:....1....:....2....:....3....:....4|';

const character = (code: number) => String.fromCharCode(code);

const gridRow = (text: string) => `${text.padEnd(gridWidth)}|`;

const named = (code: number, short: string, name: string) =>
  `${`${String(code).padStart(3)} ${code.toString(16).toUpperCase().padStart(2, '0')} ${short.padEnd(3)} ${name}`.padEnd(gridWidth - 1)}${notWritten.has(code) ? ' ' : character(code)}|`;

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, at) => character(from + at)).join(
    '',
  );

const block = (title: string, rows: readonly string[]) =>
  `## ${title}\n\n${fence}text\n${rows.join('\n')}\n${fence}\n`;

export const asciiGrid = (version: 1 | 2) => {
  const [bell, backspace, formFeed, escape] = [7, 8, 12, 27].map(character);
  const [group, record, unit] = [29, 30, 31].map(character);
  const drifting = character(version === 1 ? 1 : 2);
  const color = version === 1 ? 31 : 32;
  const every = controls
    .map((_, code) => code)
    .filter((code) => !notWritten.has(code) && code !== 9);
  return `# ASCII in a monospace grid

Every character of ASCII, codes 0 to 127, written as itself, but for NUL, which would make the file binary, and LF and CR, which would end the line. Each block is padded as if a control character took 1 column, the tab too, which stands right before a tab stop. Where the grid holds, the bars line up.

Outside the blocks, a sentence with a bell (${bell}), an escape (${escape}) and a delete (${character(deleteCode)}) in it.

${[
  block('Control characters, each at the end of its row', [
    ruler,
    ...controls.map(([short, name], code) => named(code, short, name)),
    named(deleteCode, 'DEL', 'delete'),
  ]),
  block('Drift, one more control character a row', [
    ruler,
    gridRow(''),
    ...Array.from({ length: 20 }, (_, row) =>
      gridRow(drifting.repeat(row + 1)),
    ),
  ]),
  block('Every control character but the tab on one row', [
    ruler,
    gridRow(`${every.map(character).join('')}${character(deleteCode)}`),
  ]),
  block('Printable characters, and the delete after them', [
    ruler,
    gridRow(range(32, 63)),
    gridRow(range(64, 95)),
    gridRow(range(96, 127)),
  ]),
  block('In the middle of text', [
    ruler,
    gridRow(`${escape}[${color}merror:${escape}[0m the build failed`),
    gridRow(`printf 'done${bell}'`),
    gridRow(
      `N${backspace}NA${backspace}AM${backspace}ME${backspace}E, as man printed bold`,
    ),
    gridRow(`name${unit}Ada${record}name${unit}Grace${group}`),
    gridRow(`page one${formFeed}page two`),
  ]),
].join('\n')}`;
};
