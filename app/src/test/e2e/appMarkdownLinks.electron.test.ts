import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { plainOf } from '../../lib/shared/sentences';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';

const filler = Array.from(
  { length: 80 },
  (_, line) => `Filler line ${String(line)}.`,
).join('\n\n');

suite('App Markdown links', () => {
  let app: ElectronApplication;
  let page: Page;
  let docs: string;

  const headingAtTop = (heading: string) =>
    page.evaluate((text) => {
      const shown = [...document.querySelectorAll('.markdown h2')].find(
        (each) =>
          each.textContent === text && each.getBoundingClientRect().height > 0,
      );
      const scroller = shown?.closest('.viewer-body');
      if (shown === undefined || !scroller) {
        return undefined;
      }
      return Math.abs(
        shown.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top,
      );
    }, heading);

  const activeTab = () =>
    page.locator('.tabs .tab[aria-selected="true"]').textContent();

  beforeAll(async () => {
    const folder = tempFolder('markdown-links');
    const profile = path.join(folder, 'profile');
    docs = path.join(folder, 'docs');
    fs.mkdirSync(path.join(docs, 'sub'), { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(docs, 'sub', 'a.txt'), 'a');
    fs.writeFileSync(
      path.join(docs, 'guide.md'),
      [
        '# Guide',
        '',
        '[the end](#the-end) [other](other.md#second-part) [sub](sub/) [gone](gone.md)',
        '',
        filler,
        '',
        '## The end',
        '',
        filler,
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(docs, 'other.md'),
      ['# Other', '', filler, '', '## Second part', '', filler, ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'viewer', root: path.join(docs, 'guide.md') }],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: false } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.markdown h1').waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('scrolls to the heading a link of the document names, as GitHub anchors it, colored as a link', async () => {
    const link = page.locator('.markdown a', { hasText: 'the end' });
    const [color, focus] = await link.evaluate((shown) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-focus)';
      document.body.append(probe);
      const colors = [
        getComputedStyle(shown).color,
        getComputedStyle(probe).color,
      ];
      probe.remove();
      return colors;
    });
    assert.strictEqual(color, focus);
    await link.click();
    await waitFor(
      async () => ((await headingAtTop('The end')) ?? Infinity) < 1,
      'The end at the top of the preview',
    );
  });

  test('follows a link to another document to its heading in a viewer tab of its own, a link to a folder into a commander tab, and says a link to nothing leads nowhere', async () => {
    await page.locator('.markdown a', { hasText: 'other' }).click();
    await waitFor(
      async () => (await activeTab())?.includes('other.md') === true,
      'a viewer tab of other.md',
    );
    await waitFor(
      async () => ((await headingAtTop('Second part')) ?? Infinity) < 1,
      'Second part at the top of the preview of other.md',
    );

    await page.locator('.tabs .tab', { hasText: 'guide.md' }).click();
    await page.locator('.markdown a', { hasText: 'other' }).click();
    await waitFor(
      async () => (await activeTab())?.includes('other.md') === true,
      'the viewer tab of other.md shown again',
    );
    assert.strictEqual(
      await page.locator('.tabs .tab', { hasText: 'other.md' }).count(),
      1,
    );

    await page.locator('.tabs .tab', { hasText: 'guide.md' }).click();
    await page.locator('.markdown a', { hasText: 'sub' }).click();
    await waitFor(
      async () => (await page.locator('.commander-pane').count()) > 0,
      'a commander tab of the folder',
    );

    await page.locator('.tabs .tab', { hasText: 'guide.md' }).click();
    await page.locator('.markdown a', { hasText: 'gone' }).click();
    const gone = path.join(docs, 'gone.md');
    const expected = plainOf(strings.viewer.linkLeadsNowhere(gone)).replace(
      `"${gone}"`,
      gone,
    );
    await waitFor(
      async () =>
        (await page.locator('.card.notice').allTextContents()).includes(
          expected,
        ),
      'a notice that the link leads nowhere',
    ).catch(async (error: unknown) => {
      throw new Error(
        `${String(error)}: ${JSON.stringify(await page.locator('.card').allTextContents())} rather than ${expected}`,
      );
    });
  });

  test('opens the menu of the path a link names on a right click, as on any path of the app', async () => {
    await page.locator('.tabs .tab', { hasText: 'guide.md' }).click();
    await page.locator('.markdown a', { hasText: 'other' }).click({
      button: 'right',
    });
    await page
      .locator('.context-menu.path-menu .menu-item', {
        hasText: strings.commander.openWithViewer,
      })
      .waitFor();
    await page.keyboard.press('Escape');
  });
});
