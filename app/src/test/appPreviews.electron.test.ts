import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { page, profile, repository, sharedApp } from './appFixtures';
import { waitFor } from './fixtures';

const paragraphs = Array.from(
  { length: 200 },
  (_, index) => `Paragraph ${index}`,
);

const focusColor = () =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-focus')
      .trim(),
  );

suite('App', () => {
  sharedApp({
    'notes.md': `${paragraphs.join('\n\n')}\n`,
    'diagram.md':
      '# Diagram\n\n```mermaid\ngraph LR\n  Fetch["Fetch<br/>every remote"] --> Merge\n```\n',
  });

  test('keeps the minimap on the part in view while a Markdown preview scrolls, though the preview is one row however tall', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'notes.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    await page.locator('.markdown p', { hasText: 'Paragraph 199' }).waitFor();
    await page
      .locator('.diff-view .minimap-viewport')
      .waitFor({ state: 'attached' });
    const steps = await page
      .locator('.diff-view .virtual-rows')
      .evaluate(async (list) => {
        const view =
          list.parentElement?.querySelector<HTMLElement>('.minimap-viewport');
        if (!view) {
          throw new Error('No part in view on the minimap');
        }
        const seen = [];
        for (let step = 0; step < 10; step++) {
          list.scrollTop += 100;
          await new Promise((drawn) =>
            requestAnimationFrame(() => requestAnimationFrame(drawn)),
          );
          seen.push({
            scrolled: (100 * list.scrollTop) / list.scrollHeight,
            marked: parseFloat(view.style.top),
          });
        }
        return seen;
      });
    for (const { scrolled, marked } of steps) {
      assert.ok(Math.abs(scrolled - marked) < 0.1, JSON.stringify(steps));
    }
  });

  test('draws a Mermaid diagram in a Markdown preview as an image of its SVG, its code hidden', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'diagram.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    const image = page.locator('.markdown-diagram img');
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
    assert.strictEqual(await page.locator('.markdown pre').isHidden(), true);
  });

  test('draws the diagrams of a Markdown preview again in the color scheme the system switches to, once', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'diagram.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    const image = page.locator('.markdown-diagram img');
    await image.waitFor();
    const before = await image.getAttribute('src');
    const dark = await page.evaluate(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    try {
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
      await waitFor(
        async () => (await image.getAttribute('src')) !== before,
        'the diagram to be drawn again',
      );
      assert.strictEqual(await image.count(), 1);
      assert.strictEqual(await page.locator('.markdown pre').isHidden(), true);
    } finally {
      await page.emulateMedia({ colorScheme: null });
    }
  });

  test('keeps what a Markdown preview drew for the blocks an edit leaves alone, its diagrams and colored code, while the working tree changes under it', async () => {
    const file = path.join(repository.root, 'diagram.md');
    const committed = fs.readFileSync(file, 'utf8');
    const edited = (count: number) =>
      `${committed}\nEdited ${count} times.\n\n\`\`\`ts\nconst kept = 1;\n\`\`\`\n`;
    const newSide = page.locator('.markdown-pane:last-child > .markdown');
    fs.writeFileSync(file, edited(1));
    let watching: JSHandle<{ undrawn: string[]; stop: () => void }> | undefined;
    try {
      await page.locator('.row.file', { hasText: 'diagram.md' }).click();
      await page
        .getByRole('button', { name: strings.diff.showPreview })
        .click();
      await newSide.locator('.markdown-diagram img').waitFor();
      await newSide.locator('.syntax-keyword', { hasText: 'const' }).waitFor();
      watching = await page.evaluateHandle(() => {
        const undrawn: string[] = [];
        const observer = new MutationObserver(() => {
          const preview = document.querySelector(
            '.markdown-pane:last-child > .markdown',
          );
          if (!preview?.querySelector('.markdown-diagram img')) {
            undrawn.push('diagram');
          }
          if (preview?.querySelector('pre:not([hidden]) .language-mermaid')) {
            undrawn.push('diagram code');
          }
          if (!preview?.querySelector('.language-ts .syntax-keyword')) {
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
        fs.writeFileSync(file, edited(count));
        await newSide
          .locator('p', { hasText: `Edited ${count} times.` })
          .waitFor();
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ undrawn }) => undrawn),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await repository.git('checkout', '-q', 'HEAD', '--', 'diagram.md');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('applies settings edited by hand while it runs, and says what is wrong with them', async () => {
    const file = path.join(profile, 'settings.user.json');
    const colored = page.waitForEvent('load');
    fs.writeFileSync(
      file,
      JSON.stringify({
        colors: { light: { focus: '#123456' }, dark: { focus: '#123456' } },
      }),
    );
    await colored;
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() === '#123456',
    );
    assert.strictEqual(await focusColor(), '#123456');
    const broken = page.waitForEvent('load');
    fs.writeFileSync(file, '{ "showAllFiles": tru');
    await broken;
    await page
      .locator('.notice.error', { hasText: 'not valid JSON' })
      .waitFor();
    const emptied = page.waitForEvent('load');
    fs.writeFileSync(file, '{}');
    await emptied;
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() !== '#123456',
    );
  });
});
