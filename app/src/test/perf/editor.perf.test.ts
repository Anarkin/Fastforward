import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { heldKey, paced, sleep, wheelNotches } from './perfInput';

const folder = tempFolder('perf-editor');
const file = path.join(folder, 'occurrences.ts');
fs.writeFileSync(
  file,
  Array.from(
    { length: 20_000 },
    (_, line) =>
      `const value${line % 50} = compute(total, value${line % 50}, "text ${line}"); // total ${line}`,
  ).join('\n'),
);

afterAll(() => removeFolder(folder));

const pane = '.editor :is(.cm-scroller, .editor-scroller)';

const findMarked = (page: Page, marked: boolean) =>
  page.waitForFunction((wanted) => {
    const host = document.querySelector('.editor .editor-cells');
    return (
      (document.querySelector('.editor .find-match') !== null ||
        (host instanceof HTMLElement &&
          (host.seenRows?.() ?? []).some(({ marks }) =>
            marks.some(({ name }) => name !== 'occurrence'),
          ))) === wanted
    );
  }, marked);
const findInput = '.editor .column-title.searching input';

for (const wordWrap of [false, true]) {
  const mode = wordWrap ? 'wrapped' : 'unwrapped';
  suite(`Frames of the marks of the editor, ${mode}`, () => {
    const perf = launchedForPerf(
      {
        state: {
          tabs: [{ id: '1', tool: 'editor', root: file }],
          activeTab: '1',
        },
        settings: { scrolling: { smooth: true }, text: { wordWrap } },
      },
      (page) =>
        page
          .locator(
            '.editor .editor-cells[data-rows]:has(canvas), .editor .cm-editor:not(:has(.editor-cells)) .cm-line',
          )
          .first()
          .waitFor(),
    );

    const intoTotal = async () => {
      const { page } = perf();
      await page
        .locator(pane)
        .first()
        .click({ position: { x: 120, y: 8 } });
      await page.keyboard.press('ControlOrMeta+Home');
      for (let word = 0; word < 5; word++) {
        await page.keyboard.press('Control+ArrowRight');
      }
      await sleep(500);
    };

    test('cursor by words', async () => {
      await intoTotal();
      const result = await measure(
        perf(),
        `editor marks: ${mode}, cursor by words`,
        () => heldKey(perf().page, 'Control+ArrowRight', 60),
      );
      assert.ok(result.frames.updates >= 0);
    });

    test('cursor by rows', async () => {
      await intoTotal();
      const result = await measure(
        perf(),
        `editor marks: ${mode}, cursor by rows`,
        () => heldKey(perf().page, 'ArrowDown', 60),
      );
      assert.ok(result.frames.updates >= 0);
    });

    test('wheel with a word marked', async () => {
      await intoTotal();
      const { page } = perf();
      const result = await measure(
        perf(),
        `editor marks: ${mode}, wheel with a word marked`,
        () => wheelNotches(page, page.locator(pane).first(), 40),
      );
      assert.ok(result.frames.updates >= 0);
    });

    const findCleared = async () => {
      await intoTotal();
      const { page } = perf();
      await page.keyboard.press('ControlOrMeta+F');
      await page.locator(findInput).first().waitFor();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      await findMarked(page, false);
    };

    test('find typed', async () => {
      await findCleared();
      const { page } = perf();
      const typed = 'total';
      const result = await measure(
        perf(),
        `editor marks: ${mode}, find typed`,
        () =>
          paced(typed.length, 150, (at) => page.keyboard.type(typed[at] ?? '')),
      );
      assert.ok(result.frames.updates >= 0);
    });

    test('wheel with the find open', async () => {
      await findCleared();
      const { page } = perf();
      await page.keyboard.type('total');
      await findMarked(page, true);
      await sleep(500);
      const result = await measure(
        perf(),
        `editor marks: ${mode}, wheel with the find open`,
        () => wheelNotches(page, page.locator(pane).first(), 40),
      );
      await page.keyboard.press('Escape');
      assert.ok(result.frames.updates >= 0);
    });
  });
}
