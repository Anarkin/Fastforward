const pig = '\u{1F437}';

export const drawnAlikeLines = [
  'API server #3',
  `Node.js${pig}asd 中文\tend`,
  "const controls = 'a\u0001b\u001bc\u007fd';",
  '  two  spaces, ｆｕｌｌ and 한국어',
  'a flag \u{1F1ED}\u{1F1FA}, a family \u{1F468}‍\u{1F469}‍\u{1F467} and a keycap 1️⃣',
] as const;

const firstPrintable = 0x20;

const deleteCode = 0x7f;

function beforeControls(line: string): string {
  for (let at = 0; at < line.length; at++) {
    const code = line.charCodeAt(at);
    if (code < firstPrintable || code === deleteCode) {
      return line.slice(0, at);
    }
  }
  return line;
}

export const printedAlikeLines = drawnAlikeLines
  .map(beforeControls)
  .filter((line) => line !== '');
