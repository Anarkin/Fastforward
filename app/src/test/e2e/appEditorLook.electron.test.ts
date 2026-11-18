import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  content,
  activeTab,
  editedText,
  select,
  backToCommander,
  edit,
  toStart,
  toEnd,
  sharedEditorApp,
} from './editorAppFixtures';

interface TextPlace {
  readonly top: number;
  readonly height: number;
  readonly font: string;
  readonly left: number;
  readonly right: number;
}

function namedAndStarred(
  root: Element,
  { name, star }: { readonly name: string; readonly star: string },
): readonly TextPlace[] {
  return [root.querySelector(name), root.querySelector(star)].map((part) => {
    let last: Node | null = null;
    if (part !== null) {
      const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        last = node;
      }
    }
    const range = document.createRange();
    if (last !== null) {
      range.selectNodeContents(last);
    }
    const rect = range.getBoundingClientRect();
    return {
      top: Math.round(rect.top * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      font:
        last?.parentElement === null || last?.parentElement === undefined
          ? ''
          : getComputedStyle(last.parentElement).fontFamily,
      left: rect.left,
      right: Math.min(
        rect.right,
        part?.getBoundingClientRect().right ?? rect.right,
      ),
    };
  });
}

async function starredAfter(
  root: Locator,
  parts: { readonly name: string; readonly star: string },
): Promise<void> {
  assert.strictEqual(await root.locator(parts.star).textContent(), '*');
  const [named, starred] = await root.evaluate(namedAndStarred, parts);
  assert.ok(named !== undefined && starred !== undefined);
  assert.deepStrictEqual(
    { top: starred.top, height: starred.height, font: starred.font },
    { top: named.top, height: named.height, font: named.font },
  );
  assert.ok(
    Math.abs(starred.left - named.right) < 0.5,
    `${starred.left} right after ${named.right}`,
  );
}

function firstLeftOf(element: Element): number {
  const first = document
    .createTreeWalker(element, NodeFilter.SHOW_TEXT)
    .nextNode();
  const range = document.createRange();
  if (first !== null) {
    range.setStart(first, 0);
    range.setEnd(first, 1);
  }
  return range.getBoundingClientRect().left;
}

const drawn = () =>
  page
    .locator('.editor .cm-selectionBackground')
    .first()
    .evaluate((element) => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--selection-background)';
      document.body.append(probe);
      const wanted = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [getComputedStyle(element).backgroundColor, wanted];
    });

suite('App editor', () => {
  sharedEditorApp();

  test('colors the code edited by its language as the viewer does, coloring again as it is typed', async () => {
    await backToCommander();
    await edit('code.ts');
    const keywords = content()
      .locator('.cm-line')
      .first()
      .locator('.syntax-keyword');
    await keywords.first().waitFor();
    assert.strictEqual(await keywords.first().textContent(), 'const');
    await toStart();
    await page.keyboard.type('// ');
    await waitFor(
      async () =>
        (
          await content()
            .locator('.cm-line')
            .first()
            .locator('.syntax-comment')
            .allTextContents()
        ).join('') === '// const a = 1;',
      'the line colored as a comment',
    );
    await content()
      .locator('.cm-line')
      .nth(1)
      .locator('.syntax-keyword')
      .first()
      .waitFor();
  });

  test('shows the whitespace, as it does by default, the spaces dotted, the tabs signed and a sign after each line that ends in CRLF, hides it once its button is pressed, and shows it again', async () => {
    fs.writeFileSync(path.join(opened, 'blanks.txt'), 'a  b\r\nc\td\n e\r\n');
    await backToCommander();
    await edit('blanks.txt');
    await waitFor(
      async () => (await editedText()) === 'a  b\nc\td\n e\n',
      'the text',
    );
    const toggle = page.locator('.editor button[title="Show Whitespace"]');
    await page.locator('.editor .space-dots path').waitFor();
    assert.strictEqual(
      await content().locator('.blank[data-glyph="→"]').count(),
      1,
    );
    const signed = await content()
      .locator('.cm-line')
      .evaluateAll((lines) =>
        lines.map((line) => line.querySelector('.ending-sign') !== null),
      );
    assert.deepStrictEqual(signed, [true, false, true, false]);
    await toggle.click();
    try {
      await page
        .locator('.editor .space-dots path')
        .waitFor({ state: 'detached' });
      assert.strictEqual(await content().locator('.ending-sign').count(), 0);
    } finally {
      await toggle.click();
    }
    await page.locator('.editor .space-dots path').waitFor();
  });

  test('selects text in the color the app selects its rows in, focused or not', async () => {
    fs.writeFileSync(path.join(opened, 'selected.txt'), 'one\ntwo\n');
    await backToCommander();
    await edit('selected.txt');
    await content().click();
    await page.keyboard.press('ControlOrMeta+A');
    const [focused, wanted] = await drawn();
    assert.strictEqual(focused, wanted);
    await page.locator('.editor .editor-path').click();
    await page
      .locator('.editor .cm-editor.cm-focused')
      .waitFor({ state: 'detached' });
    const [unfocused] = await drawn();
    assert.strictEqual(unfocused, wanted);
  });

  test('marks a file changed with a star right after its name, in its path and on its tab, in the font of each and on the line of the name', async () => {
    fs.writeFileSync(path.join(opened, 'starred.txt'), 'one\n');
    await backToCommander();
    await edit('starred.txt');
    await toEnd();
    await page.keyboard.type('!');
    const mark = page.locator('.editor .editor-mark.unsaved');
    await mark.waitFor();
    await starredAfter(page.locator('.editor .editor-path'), {
      name: '.path-title',
      star: '.editor-mark',
    });
    await starredAfter(activeTab(), {
      name: '.tab-name',
      star: '.tab-unsaved',
    });
  });

  test('starts the text of a file viewed where the editor starts it, after an empty column as wide as its line numbers', async () => {
    fs.writeFileSync(path.join(opened, 'columns.txt'), 'first line\nsecond\n');
    await backToCommander();
    await select('columns.txt');
    await page.keyboard.press('F3');
    const viewerRow = page.locator('.viewer .viewer-rows .viewer-row').first();
    await viewerRow.waitFor();
    const inViewer = await viewerRow.evaluate(firstLeftOf);
    await page.keyboard.press('F4');
    await waitFor(
      async () => (await editedText()) === 'first line\nsecond\n',
      'the text in the editor',
    );
    const inEditor = await content()
      .locator('.cm-line')
      .first()
      .evaluate(firstLeftOf);
    assert.ok(
      Math.abs(inViewer - inEditor) < 0.5,
      `${inViewer} in the viewer, ${inEditor} in the editor`,
    );
  });

  test('dots the spaces of a line of thousands of columns only around the columns in sight, and around those it is scrolled sideways to once it is, as every run of the line was measured and drawn wherever the editor scrolled', async () => {
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      Array.from({ length: 3 }, () =>
        Array.from({ length: 3000 }, (_, at) => `w${at}`).join(' '),
      ).join(String.fromCharCode(10)),
    );
    await backToCommander();
    await edit('wide.txt');
    await waitFor(
      async () => (await editedText()).startsWith('w0 w1 '),
      'the text',
    );
    await toStart();
    const scroller = page.locator('.editor .cm-scroller');
    const dotted = () =>
      scroller.evaluate((element) => {
        const starts = [
          ...(
            element.querySelector('.space-dots path')?.getAttribute('d') ?? ''
          ).matchAll(/M(-?[\d.]+) /g),
        ].map(([, x]) => Number(x));
        return {
          runs: starts.length,
          from: Math.min(...starts),
          to: Math.max(...starts),
          left: element.scrollLeft,
          wide: element.clientWidth,
        };
      });
    await waitFor(async () => (await dotted()).runs > 0, 'the dots');
    const atStart = await dotted();
    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth / 2;
    });
    await waitFor(async () => {
      const now = await dotted();
      return now.left > 0 && now.from > atStart.to;
    }, 'the dots of the columns scrolled to');
    const scrolled = await dotted();

    assert.ok(
      atStart.to - atStart.from < 3 * atStart.wide,
      JSON.stringify(atStart),
    );
    assert.ok(
      scrolled.from < scrolled.left + scrolled.wide &&
        scrolled.to > scrolled.left &&
        scrolled.to - scrolled.from < 3 * scrolled.wide,
      JSON.stringify(scrolled),
    );
  });
});
