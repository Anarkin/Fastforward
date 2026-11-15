export const gridRuler = '....:....1....:....2....:....3....:....4|';

export const gridLines = [
  gridRuler,
  ...(
    [
      ['😀', 2],
      ['😀'.repeat(10), 20],
      ['🎉 🎉 🎉 🎉 🎉 party', 20],
      ['中文中文中文', 12],
      ['日本語のテキスト', 16],
      ['한국어 텍스트', 13],
      ['😀😀😀 中文中文 abc', 19],
      ['Árvíztűrő tükörfúrógép', 22],
      ['👨‍👩‍👧‍👦 family of four', 17],
      ['⚠ text      ⚠️ emoji', 20],
      ['🇭🇺 flag', 7],
      ['1️⃣ keycap', 9],
      ['👍🏽 skin tone', 12],
      ['Café au lait', 12],
      ['ＡＢＣ fullwidth', 16],
      ['├── ★ → ± ° …', 13],
      ['abcd\t', 8],
      ['abc😀\t', 8],
      ['😀😀\t', 8],
      ['x😀😀😀\t', 8],
      ['ab中\t', 8],
      ['中中中\t', 8],
    ] as const
  ).map(([text, columns]) => `${text}${' '.repeat(40 - columns)}|`),
];

export function barsOffGrid(code: readonly Element[]): number[] {
  const lefts: number[] = [];
  for (const element of code) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let left = Number.NaN;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.includes('|')) {
        const range = document.createRange();
        const at = node.data.lastIndexOf('|');
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        left = range.getBoundingClientRect().left;
      }
    }
    lefts.push(left);
  }
  const [ruler, ...rows] = lefts;
  return rows.map((left) => Math.round((left - ruler) * 10) / 10 + 0);
}

export function linesOffGrid(code: Element): number[] {
  const lefts: number[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let line = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      continue;
    }
    for (let at = 0; at < node.length; at++) {
      if (node.data[at] === '\n') {
        line++;
      } else if (node.data[at] === '|') {
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        lefts[line] = range.getBoundingClientRect().left;
      }
    }
  }
  const [ruler, ...rows] = lefts;
  return rows.map((left) => Math.round((left - ruler) * 10) / 10);
}
