import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../shared/strings';
import {
  gridLines,
  linesOffGrid,
  page,
  profile,
  repository,
  sharedApp,
} from './appFixtures';
import { waitFor } from './fixtures';

const focusColor = () =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-focus')
      .trim(),
  );

const viewDiagram = async (
  from: 'first' | 'uncommitted',
  by: 'button' | 'F3' = 'button',
) => {
  const commit =
    from === 'first'
      ? page.locator('.commit', { hasText: 'first' })
      : page.locator('.commit.working-tree', {
          hasText: '1 uncommitted change',
        });
  await commit.waitFor();
  if (!((await commit.getAttribute('class')) ?? '').includes('selected')) {
    await commit.click();
  }
  await page.locator('.row.file', { hasText: 'diagram.md' }).click();
  if (by === 'F3') {
    await page
      .locator('.diff-view .file-header', { hasText: 'diagram.md' })
      .waitFor();
    await page.keyboard.press('F3');
  } else {
    await page
      .locator('.diff-view .file-header', { hasText: 'diagram.md' })
      .getByRole('button', { name: strings.diff.viewFile })
      .click();
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

suite('App', () => {
  sharedApp({
    'diagram.md':
      '# Diagram\n\n```mermaid\ngraph LR\n  Fetch["Fetch<br/>every remote"] --> Merge\n```\n',
    'grid.md': ['# Grid', '', '```text', ...gridLines, '```', ''].join('\n'),
  });

  test('draws the code blocks of a Markdown document viewed on the grid of our terminal, as the viewer and the diff draw text, so code padded for a terminal lines up in the preview too', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'grid.md' }).click();
    await page
      .locator('.diff-view .file-header', { hasText: 'grid.md' })
      .getByRole('button', { name: strings.diff.viewFile })
      .click();
    try {
      const code = page.locator('.viewer .markdown pre code');
      await code.waitFor();
      const onGrid = gridLines.slice(1).map(() => 0);
      await waitFor(
        async () =>
          JSON.stringify(await code.evaluate(linesOffGrid)) ===
          JSON.stringify(onGrid),
        'the bars on the grid',
      );
    } finally {
      await closeViewer();
    }
  });

  test('views a file of a diff in a tab of its own from the button on its header, its Markdown rendered with a Mermaid diagram drawn as an image of its SVG, its code hidden', async () => {
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
      await preview.locator('.syntax-keyword', { hasText: 'const' }).waitFor();
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
          if (!shown?.querySelector('.language-ts .syntax-keyword')) {
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
