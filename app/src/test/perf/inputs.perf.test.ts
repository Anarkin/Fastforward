import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { barOf, barParts } from '../e2e/scrollbarsShown';
import { dragged, sleep, wheelNotches } from './perfInput';

const playground = process.env.FASTFORWARD_PERF_PLAYGROUND;

const invented = tempFolder('perf-inputs');

function inventedFile(name: string, lines: () => string[]): string {
  const file = path.join(invented, name);
  fs.writeFileSync(file, lines().join('\n'));
  return file;
}

const words = (count: number, word: (at: number) => string) =>
  Array.from({ length: count }, (_, at) => word(at)).join(' ');

const inventedFiles = [
  inventedFile('minified.json', () => [
    JSON.stringify(
      Array.from({ length: 12_000 }, (_, at) => ({
        id: at,
        name: `item number ${at}`,
        tags: ['alpha', 'beta', 'gamma'],
        nested: { ok: at % 2 === 0, ratio: at / 7 },
      })),
    ),
  ]),
  inventedFile('cjk.txt', () =>
    Array.from({ length: 20_000 }, (_, line) =>
      words(12, (at) => '漢字かなカナ한글'.repeat(1 + ((line + at) % 3))),
    ),
  ),
  inventedFile('wide-lines.txt', () =>
    Array.from({ length: 3000 }, (_, line) =>
      words(700, (at) => `w${(line * 31 + at) % 997}`),
    ),
  ),
  inventedFile('tabs.ts', () =>
    Array.from(
      { length: 30_000 },
      (_, line) =>
        `${'\t'.repeat(line % 9)}const value${line} = compute(${line}, "text ${line}"); // note ${line}`,
    ),
  ),
  inventedFile('controls.txt', () =>
    Array.from({ length: 4000 }, (_, line) =>
      Array.from({ length: 150 }, (_character, at) => {
        const code = (line * 31 + at * 53 + ((line * at) % 11)) % 128;
        return String.fromCharCode([0, 9, 10, 13].includes(code) ? 65 : code);
      }).join(''),
    ),
  ),
  inventedFile('emoji.md', () =>
    Array.from({ length: 8000 }, (_, line) =>
      words(
        40,
        (at) => ['😀', '👩‍👩‍👧‍👦', '🇭🇺', 'text', '✅'][(line + at) % 5] ?? '',
      ),
    ),
  ),
];

const playgroundFiles =
  playground === undefined
    ? []
    : [
        'text/find-log-of-20-mib.log',
        'text/one-line-of-1-mib.txt',
        'text/long-line-just-over-64-kib.txt',
        'text/emoji-grid.md',
        'text/unicode.txt',
        'text/whitespace-tabs-and-spaces.txt',
        'text/whitespace-padded-table.md',
        'compare/padded-table-v1.md',
        'syntax/limit-size-just-under-the-coloring-limit.ts',
        'syntax/limit-line-just-under-the-coloring-length.ts',
        'syntax/fastforward-strings.ts',
        'formats/csv-of-100000-rows.csv',
        'formats/csv-wide-of-200-columns.csv',
        'markdown/just-under-the-preview-limit.md',
      ].map((name) => path.join(playground, name));

const only = process.env.FASTFORWARD_PERF_INPUT;

const files = [...inventedFiles, ...playgroundFiles].filter(
  (file) => only === undefined || file.includes(only),
);

const tools = [
  {
    name: 'viewer',
    pane: '.viewer-body',
    bar: '.viewer-body .scroll-proxy.vertical',
  },
  { name: 'editor', pane: '.editor .cm-scroller', bar: '.editor .cm-scroller' },
] as const;

afterAll(() => removeFolder(invented));

for (const wordWrap of [false, true]) {
  for (const file of files) {
    const mode = wordWrap ? 'wrapped' : 'unwrapped';
    suite(`Frames of ${path.basename(file)}, ${mode}`, () => {
      const perf = launchedForPerf(
        {
          state: {
            tabs: [
              { id: '1', tool: 'viewer', root: file },
              { id: '2', tool: 'editor', root: file },
            ],
            activeTab: '1',
          },
          settings: { scrolling: { smooth: true }, text: { wordWrap } },
        },
        (page) => page.locator('.viewer').waitFor(),
      );

      for (const [index, tool] of tools.entries()) {
        const named = `input: ${path.basename(file)}, ${tool.name}, ${mode}`;

        test(`${tool.name} wheel`, async () => {
          const { page } = perf();
          await page.locator('.tabs .tab').nth(index).click();
          const pane = page.locator(tool.pane).first();
          await pane.waitFor();
          if (tool.name === 'viewer') {
            await pane.focus();
            await page.keyboard.press('2');
            await page
              .locator(
                '.viewer :is(.viewer-row:not(.viewer-probe), .cell-rows[data-rows]:has(canvas))',
              )
              .first()
              .waitFor();
          } else {
            await page.locator('.editor .cm-line').first().waitFor();
          }
          await sleep(1500);
          const result = await measure(perf(), `${named}, wheel`, () =>
            wheelNotches(page, pane, 40),
          );
          assert.ok(result.frames.updates >= 0);
        });

        test(`${tool.name} drag`, async ({ skip }) => {
          const { page } = perf();
          const scrolls = await page
            .locator(tool.bar)
            .first()
            .evaluate(
              (scroller) => scroller.scrollHeight > scroller.clientHeight,
            );
          if (!scrolls) {
            skip('a file that fits its view has no scrollbar to drag');
          }
          const { box } = await barOf(page, tool.bar, 'vertical');
          const { thumb, start, end } = await barParts(page, box, 'vertical');
          assert.ok(thumb);
          const from = {
            x: thumb.left + thumb.width / 2,
            y: thumb.top + Math.min(thumb.height / 2, 12),
          };
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await sleep(300);
          const room = Math.max(
            40,
            (box.height - start.height - end.height - thumb.height) / 2,
          );
          const lower = thumb.top + thumb.height / 2 > box.top + box.height / 2;
          const result = await measure(perf(), `${named}, drag`, () =>
            dragged(page, from, { x: 0, y: lower ? -room : room }),
          );
          await page.mouse.up();
          assert.ok(result.frames.updates >= 0);
        });
      }
    });
  }
}
