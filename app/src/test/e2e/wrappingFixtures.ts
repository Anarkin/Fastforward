import * as path from 'node:path';
import * as esbuild from 'esbuild';
import type { JSHandle, Locator } from 'playwright-core';
import type * as lineBreaksModule from '../../lib/page/lineBreaks';
import type * as textWidthsModule from '../../lib/page/textWidths';
import type * as wordWrapModule from '../../lib/page/wordWrap';
import { page } from './appFixtures';

export async function drawnCodeRow(): Promise<number> {
  return page
    .locator('.diff-line')
    .first()
    .evaluate((line) => parseFloat(getComputedStyle(line).lineHeight));
}

export async function codeRow(lineHeight: number): Promise<number> {
  const ratio = await page.evaluate(() => devicePixelRatio);
  return Math.round(12 * lineHeight * ratio) / ratio;
}

export function near(actual: number | undefined, expected: number): boolean {
  return actual !== undefined && Math.abs(actual - expected) < 0.01;
}

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

export type PageWrapping = Pick<typeof lineBreaksModule, 'lineBreaks'> &
  Pick<typeof textWidthsModule, 'cellWidthsOf' | 'terminalCells'> &
  Pick<typeof wordWrapModule, 'wrapIndent' | 'wrapStarts'>;

export async function wrappingInPage(): Promise<JSHandle<PageWrapping>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { lineBreaks } from './lineBreaks';",
        "export { cellWidthsOf, terminalCells } from './textWidths';",
        "export { wrapIndent, wrapStarts } from './wordWrap';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', '..', 'lib', 'page'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'wrappingOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageWrapping>(
    `${built.outputFiles[0].text};wrappingOfTheApp`,
  );
}

export function browserStarts(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    if (!code) {
      throw new Error('No code');
    }
    const range = document.createRange();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const starts: number[] = [];
    let lastTop = Number.NaN;
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) {
        continue;
      }
      for (let at = 0; at < node.length; at++) {
        const unit = node.data.charCodeAt(at);
        if (unit >= 0xdc00 && unit <= 0xdfff) {
          continue;
        }
        range.setStart(node, at);
        range.setEnd(
          node,
          Math.min(
            node.length,
            unit >= 0xd800 && unit <= 0xdbff ? at + 2 : at + 1,
          ),
        );
        const rect = range.getBoundingClientRect();
        if (
          rect.height > 0 &&
          !(Math.abs(rect.top - lastTop) < rect.height / 2)
        ) {
          starts.push(offset + at);
          lastTop = rect.top;
        }
      }
      offset += node.length;
    }
    const style = getComputedStyle(code);
    const sample = document.createElement('span');
    sample.style.font = style.font;
    sample.style.letterSpacing = style.letterSpacing;
    sample.style.whiteSpace = 'pre';
    sample.textContent = '0'.repeat(100);
    document.body.append(sample);
    const char = sample.getBoundingClientRect().width / 100;
    sample.remove();
    return {
      text: code.textContent ?? '',
      starts,
      boxed: [...code.querySelectorAll('.cell')].map(
        (cell) => cell.textContent ?? '',
      ),
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent),
      char,
    };
  });
}

export const firsts = (rows: readonly { first: string }[]) =>
  rows.map((row) => row.first);

export const lineHeights = () =>
  page
    .locator('.diff-view .virtual-row .diff-line')
    .evaluateAll((lines) =>
      lines.map(
        (line) => Math.round(line.getBoundingClientRect().height * 10) / 10,
      ),
    );

export const paddedLine = `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes${' '.repeat(50)}|`;

export function wrappedRows(
  line: Locator,
): Promise<{ last: string; follows: boolean }[]> {
  return line.evaluate((element) => {
    const code = element.querySelector('.code');
    if (!code) {
      throw new Error('No code');
    }
    const text = code.textContent ?? '';
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text) || node.length !== text.length) {
      throw new Error('Not one text node');
    }
    const range = document.createRange();
    const ends = new Map<number, { right: number; last: string }>();
    for (let offset = 0; offset < text.length; offset++) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      ends.set(Math.round(rect.top), {
        right: rect.right,
        last: text[offset],
      });
    }
    const marks = Array.from(
      element.querySelectorAll('.wrap-break'),
      (mark) => mark.getBoundingClientRect().left,
    );
    return [...ends.values()].slice(0, -1).map(({ right, last }, index) => ({
      last,
      follows: Math.abs((marks[index] ?? Infinity) - right) < 1,
    }));
  });
}

export function laidOutCode(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    if (!code) {
      throw new Error('No code');
    }
    const rows = new Map<
      number,
      { first: string; start: number; last: string; right: number }
    >();
    const range = document.createRange();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) {
        continue;
      }
      for (let offset = 0; offset < node.length; offset++) {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        const character = node.data[offset];
        const top = Math.round(rect.top);
        const row = rows.get(top) ?? {
          first: character,
          start: NaN,
          last: character,
          right: rect.right,
        };
        if (Number.isNaN(row.start) && character !== ' ') {
          row.start = rect.left;
        }
        rows.set(top, { ...row, last: character, right: rect.right });
      }
    }
    const style = getComputedStyle(code);
    const sample = document.createElement('span');
    sample.style.font = style.font;
    sample.style.letterSpacing = style.letterSpacing;
    sample.style.whiteSpace = 'pre';
    sample.textContent = '0'.repeat(100);
    document.body.append(sample);
    const char = sample.getBoundingClientRect().width / 100;
    sample.remove();
    return {
      text: code.textContent ?? '',
      rows: [...rows.values()],
      marks: Array.from(
        element.querySelectorAll('.wrap-break'),
        (mark) => mark.getBoundingClientRect().left,
      ),
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent),
      char,
    };
  });
}

export const pressWrap = () => page.keyboard.press('w');

export const matchInView = () =>
  page.evaluate(() => {
    const list = document.querySelector('.diff-view .virtual-rows');
    const marks = [
      ...document.querySelectorAll('.diff-view mark.find-match.current'),
    ];
    if (!list || marks.length === 0) {
      return false;
    }
    const { top, bottom } = list.getBoundingClientRect();
    return marks.every((mark) => {
      const box = mark.getBoundingClientRect();
      return box.top >= top && box.bottom <= bottom;
    });
  });

export const clickView = (name: string) => () =>
  page.getByRole('button', { name }).click();

export async function marksFollowRows(line: Locator): Promise<boolean> {
  const rows = await wrappedRows(line);
  return (
    rows.length > 1 && rows.every((row) => row.last === '-' && row.follows)
  );
}
