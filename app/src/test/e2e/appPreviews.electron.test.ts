import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { page, repository, sharedApp } from './appFixtures';
import { cellsOf, copied, keepCopied } from './cellsSeen';
import { gridLines } from './gridLines';
import { waitFor, writeOver } from '../helpers/fixtures';
import { untilSettled } from './waits';
import { commitRow, commitSeen } from './commitRows';
import { fileRow } from './fileRows';

const viewFromMenu = async (file: string) => {
  await page
    .locator('.diff-view .file-header', { hasText: file })
    .locator('.path-part')
    .last()
    .click({ button: 'right' });
  await page
    .locator('.context-menu.path-menu .menu-item', {
      hasText: strings.commander.openWithViewer,
    })
    .click();
};

const viewDiagram = async (
  from: 'first' | 'uncommitted',
  by: 'menu' | 'F3' = 'menu',
) => {
  const name = from === 'first' ? 'first' : '1 uncommitted change';
  if (!(await commitSeen(page, name)).selected) {
    await commitRow(page, name).click();
  }
  await fileRow(page, 'diagram.md', { kind: 'file' }).click();
  if (by === 'F3') {
    await page
      .locator('.diff-view .file-header', { hasText: 'diagram.md' })
      .waitFor();
    await page.keyboard.press('F3');
  } else {
    await viewFromMenu('diagram.md');
  }
  await page.locator('.viewer').waitFor();
};

const closeViewer = async () => {
  if (await page.locator('.viewer').isVisible()) {
    await page.locator('.viewer .column-body').first().focus();
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
  }
};

const codeCells = '.viewer .markdown pre code .cell-rows';

suite('App', () => {
  sharedApp({
    'diagram.md':
      '# Diagram\n\n```mermaid\ngraph LR\n  Fetch["Fetch<br/>every remote"] --> Merge\n```\n',
    'grid.md': ['# Grid', '', '```text', ...gridLines, '```', ''].join('\n'),
    'found.md': [
      '# Find beta',
      '',
      'Some **be**ta in prose, and a [link beta](#).',
      '',
      '```ts',
      'const beta = 1;',
      '```',
      '',
      ...Array.from({ length: 80 }, (_, at) => `Filler ${at}.\n`),
      'Last beta.',
      '',
    ].join('\n'),
    'folded.md': [
      '# Folded',
      '',
      '<details><summary>More</summary>',
      '',
      'A hidden gamma.',
      '',
      '</details>',
      '',
    ].join('\n'),
    'table.md': [
      '| Folder | What it is for | Size |',
      '|:--|:-:|--:|',
      `| \`colors\` | ${'words long enough to squeeze the other columns '.repeat(8)} | 12 |`,
      `| \`encodings\` | ${'more words that fill the line of the table '.repeat(8)} | 3 |`,
      '',
    ].join('\n'),
  });

  test('keeps the words of a table of a Markdown document viewed whole, a column of code as wide as its longest word rather than broken between its letters, and aligns its columns as its separator row says', async () => {
    await commitRow(page, 'first').click();
    await fileRow(page, 'table.md', { kind: 'file' }).click();
    await viewFromMenu('table.md');
    try {
      const table = page.locator('.viewer .markdown table');
      await table.waitFor();
      assert.deepStrictEqual(
        await table.evaluate((element) => ({
          codeLines: [...element.querySelectorAll('td code')].map(
            (code) => code.getClientRects().length,
          ),
          aligns: [...element.querySelectorAll('th')].map((cell) =>
            getComputedStyle(cell).textAlign.replace('-webkit-', ''),
          ),
        })),
        { codeLines: [1, 1], aligns: ['left', 'center', 'right'] },
      );
    } finally {
      await closeViewer();
    }
  });

  test('draws the code blocks of a Markdown document viewed as cells on the grid of our terminal, as the viewer draws text, so code padded for a terminal lines up in the preview too, its tabs stopping on that grid and its spaces dotted while whitespace is shown, on its key here too; a word of the code is selected on a double click and copied, as in a file viewed, and the prose around it selected with the pointer, which drops what was selected in the code', async () => {
    await commitRow(page, 'first').click();
    await fileRow(page, 'grid.md', { kind: 'file' }).click();
    await viewFromMenu('grid.md');
    try {
      await page.locator('.viewer .markdown pre code').waitFor();
      const code = cellsOf(page, codeCells);
      const onGrid = gridLines.slice(1).map(() => 0);
      const barsOff = async () => {
        const last: number[] = [];
        for (const { row, column } of await code.glyphs('|')) {
          last[row] = Math.max(last[row] ?? 0, column);
        }
        const [ruler, ...rows] = last;
        return rows.map((column) => column - (ruler ?? Number.NaN));
      };
      let offsets: number[] = [];
      await waitFor(async () => {
        offsets = await barsOff();
        return JSON.stringify(offsets) === JSON.stringify(onGrid);
      }, 'the bars on the grid').catch(() => undefined);
      assert.deepStrictEqual(offsets, onGrid);

      const dots = async () => (await code.dots()).length;
      await waitFor(async () => (await dots()) > 0, 'the spaces dotted');
      await page.locator('.viewer .viewer-body').first().focus();
      await page.keyboard.press('.');
      await waitFor(
        async () => (await dots()) === 0,
        'the spaces of the code plain once whitespace is hidden',
      );
      await page.keyboard.press('.');
      await waitFor(async () => (await dots()) > 0, 'the spaces dotted again');

      const word = await code.point(3, 16);
      await page.mouse.dblclick(word.x, word.y);
      await waitFor(
        async () =>
          (await code.rows()).some(({ selected }) => selected !== undefined),
        'the word selected in the code block',
      );
      await keepCopied(page);
      await page.keyboard.press('ControlOrMeta+C');
      await waitFor(
        async () => (await copied(page)) !== undefined,
        'the word copied',
      );
      const fromCode = await copied(page);
      const prose = page.locator('.viewer .markdown h1').first();
      const heading = await prose.boundingBox();
      assert.ok(heading, 'the document has no heading');
      await page.mouse.move(heading.x + 2, heading.y + heading.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        heading.x + heading.width / 2,
        heading.y + heading.height / 2,
        { steps: 4 },
      );
      await page.mouse.up();
      assert.deepStrictEqual(
        {
          fromCode,
          prose:
            (await page.evaluate(() => getSelection()?.toString() ?? ''))
              .length > 0,
          codeStillSelected: (await code.rows()).some(
            ({ selected }) => selected !== undefined,
          ),
        },
        { fromCode: 'party', prose: true, codeStillSelected: false },
      );
    } finally {
      await closeViewer();
    }
  });

  test('finds in a Markdown document previewed without leaving the preview, in its prose across bold and links and in its code drawn as cells, counting the matches, marking each and the current one, and each on the track of its scrollbar, and stepping through them in the order of the document on Enter', async () => {
    await commitRow(page, 'first').click();
    await fileRow(page, 'found.md', { kind: 'file' }).click();
    await viewFromMenu('found.md');
    try {
      await page.locator(codeCells).waitFor();
      await page.locator('.viewer .viewer-body').first().focus();
      await page.keyboard.press('ControlOrMeta+F');
      await page.locator('.viewer .search-box-input').waitFor();
      await page.keyboard.type('beta');
      const code = cellsOf(page, codeCells);
      const shown = async () => ({
        count: await page.locator('.viewer .search-count').textContent(),
        prose: await page.evaluate(() => [
          CSS.highlights.get('markdown-match')?.size ?? 0,
          [...(CSS.highlights.get('markdown-match-current') ?? [])].map(
            (range) => {
              const live = document.createRange();
              live.setStart(range.startContainer, range.startOffset);
              live.setEnd(range.endContainer, range.endOffset);
              return live.toString();
            },
          ),
        ]),
        code: (await code.rows()).flatMap(({ marks }) =>
          marks.map(({ name }) => name),
        ),
        preview: await page.locator('.viewer .markdown').isVisible(),
      });
      const first = await untilSettled(shown, 'the matches of beta');
      const marks = await untilSettled(
        () =>
          page.evaluate(() => {
            const preview = document.querySelector('.viewer .viewer-preview');
            const frame = document.querySelector(
              '.viewer .viewer-preview ~ .scrollbar-marks',
            );
            if (preview === null || frame === null) {
              return undefined;
            }
            const scroller = preview.getBoundingClientRect();
            const track = frame.getBoundingClientRect();
            const tops = [
              ...frame.querySelectorAll('.scrollbar-mark.match'),
            ].map((mark) => mark.getBoundingClientRect().top);
            return {
              marked: tops.length > 0,
              ordered: tops.every(
                (top, at) => at === 0 || top >= (tops[at - 1] ?? 0),
              ),
              overScrollbar:
                Math.abs(track.right - scroller.right) < 1 &&
                Math.abs(track.width - (scroller.width - preview.clientWidth)) <
                  1,
            };
          }),
        'the marks of beta on the scrollbar',
      );
      assert.deepStrictEqual(marks, {
        marked: true,
        ordered: true,
        overScrollbar: true,
      });
      for (let step = 0; step < 3; step++) {
        await page.keyboard.press('Enter');
      }
      const fourth = await untilSettled(shown, 'the fourth match current');
      assert.deepStrictEqual(
        { first, fourth },
        {
          first: {
            count: '1 of 5',
            prose: [4, ['beta']],
            code: ['match'],
            preview: true,
          },
          fourth: {
            count: '4 of 5',
            prose: [4, []],
            code: ['current'],
            preview: true,
          },
        },
      );
    } finally {
      await page.keyboard.press('Escape');
      await closeViewer();
    }
  });

  test('finds in the closed details of a Markdown document previewed, opening them to show the match it goes to, as a browser finding in a page does, rather than counting a match it could not show', async () => {
    await commitRow(page, 'first').click();
    await fileRow(page, 'folded.md', { kind: 'file' }).click();
    await viewFromMenu('folded.md');
    try {
      const details = page.locator('.viewer .markdown details');
      await details.waitFor();
      const opened = () =>
        details.evaluate((element) => element.hasAttribute('open'));
      assert.strictEqual(await opened(), false);
      await page.locator('.viewer .viewer-body').first().focus();
      await page.keyboard.press('ControlOrMeta+F');
      await page.locator('.viewer .search-box-input').waitFor();
      await page.keyboard.type('gamma');
      await waitFor(opened, 'the details open on its match');
      assert.strictEqual(
        await page.locator('.viewer .search-count').textContent(),
        '1 of 1',
      );
    } finally {
      await page.keyboard.press('Escape');
      await closeViewer();
    }
  });

  test('views a file of a diff in a tab of its own from the menu of the path on its header, its Markdown rendered with a Mermaid diagram drawn as an image of its SVG, its code hidden', async () => {
    await viewDiagram('first');
    try {
      const image = page.locator('.viewer .markdown-diagram img');
      await image.waitFor();
      const drawn = await image.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const svg = decodeURIComponent(img.src.split(',')[1]);
        return {
          width: img.naturalWidth,
          labels: ['Fetch', 'Merge'].every((label) => svg.includes(label)),
        };
      });
      assert.ok(drawn.width > 0, JSON.stringify(drawn));
      assert.ok(drawn.labels, JSON.stringify(drawn));
      assert.strictEqual(
        await page.locator('.viewer .markdown pre').isHidden(),
        true,
      );
    } finally {
      await closeViewer();
    }
  });

  test('views the file shown in a tab of its own on F3, and draws the diagrams of its Markdown again in the color scheme the system switches to, once', async () => {
    await viewDiagram('first', 'F3');
    const image = page.locator('.viewer .markdown-diagram img');
    const dark = await page.evaluate(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    try {
      await image.waitFor();
      const before = await image.getAttribute('src');
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
      await waitFor(
        async () => (await image.getAttribute('src')) !== before,
        'the diagram to be drawn again',
      );
      assert.strictEqual(await image.count(), 1);
      assert.strictEqual(
        await page.locator('.viewer .markdown pre').isHidden(),
        true,
      );
    } finally {
      await page.emulateMedia({ colorScheme: null });
      await closeViewer();
    }
  });

  test('keeps what a Markdown document viewed drew for the blocks an edit leaves alone, its diagrams and colored code, while the file changes under it', async () => {
    const file = path.join(repository.root, 'diagram.md');
    const committed = fs.readFileSync(file, 'utf8');
    const edited = (count: number) =>
      `${committed}\nEdited ${count} times.\n\n\`\`\`ts\nconst kept = 1;\n\`\`\`\n`;
    const preview = page.locator('.viewer .markdown');
    fs.writeFileSync(file, edited(1));
    let watching: JSHandle<{ undrawn: string[]; stop: () => void }> | undefined;
    try {
      await viewDiagram('uncommitted');
      await preview.locator('.markdown-diagram img').waitFor();
      await waitFor(
        async () =>
          (
            await cellsOf(
              page,
              '.viewer .markdown .language-ts .cell-rows',
            ).rows()
          )
            .flatMap(({ pieces }) => pieces)
            .some(({ kind, text }) => kind === 'keyword' && text === 'const'),
        'the code colored',
      );
      watching = await page.evaluateHandle(() => {
        const undrawn: string[] = [];
        const observer = new MutationObserver(() => {
          const shown = document.querySelector('.viewer .markdown');
          if (!shown?.querySelector('.markdown-diagram img')) {
            undrawn.push('diagram');
          }
          if (shown?.querySelector('pre:not([hidden]) .language-mermaid')) {
            undrawn.push('diagram code');
          }
          const code = shown?.querySelector('.language-ts .cell-rows');
          if (
            !(code instanceof HTMLElement) ||
            code.querySelector('canvas') === null ||
            code
              .seenRows?.()
              .some(({ pieces }) =>
                pieces.some(({ kind }) => kind === 'keyword'),
              ) !== true
          ) {
            undrawn.push('colored code');
          }
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        return { undrawn, stop: () => observer.disconnect() };
      });
      for (const count of [2, 3, 4]) {
        writeOver(file, edited(count));
        await preview
          .locator('p', { hasText: `Edited ${count} times.` })
          .waitFor();
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ undrawn }) => undrawn),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await closeViewer();
      await repository.git('checkout', '-q', 'HEAD', '--', 'diagram.md');
    }
    await commitRow(page, 'No uncommitted changes').waitFor();
  });
});
