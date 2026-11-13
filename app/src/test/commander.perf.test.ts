import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { waitFor } from './fixtures';
import { codeFile, imagesFolder, logFile, manyFolder } from './perfData';
import {
  heldKey,
  launchedForPerf,
  measure,
  perfData,
  sleep,
  wheelNotches,
} from './perfFixtures';

function stem(file: string): string {
  return file.slice(0, file.lastIndexOf('.'));
}

suite('Frames of the commander, the viewer and the editor', () => {
  const { files } = perfData();
  const perf = launchedForPerf(
    {
      state: {
        tabs: [{ id: '1', tool: 'commander', root: files }],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true } },
    },
    (page) =>
      page
        .locator('.commander-pane')
        .nth(1)
        .locator('.commander-row', { hasText: manyFolder })
        .waitFor(),
  );
  const page = () => perf().page;
  const right = () => page().locator('.commander-pane').nth(1);
  const row = (name: string) =>
    right().locator('.commander-row', { hasText: name }).first();
  const select = async (name: string) => {
    await row(name).click();
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes(name) === true,
      `${name} to be selected`,
    );
  };
  const openFolder = async (name: string, inside: string) => {
    await select(name);
    await page().keyboard.press('Enter');
    await row(inside).waitFor();
  };
  const backUp = async () => {
    await page().keyboard.press('Backspace');
    await row(manyFolder).waitFor();
  };

  test('scrolling a folder of 20,000 files with a mouse wheel', async () => {
    await openFolder(manyFolder, 'file-');
    const result = await measure(perf(), 'commander: 20,000 files, wheel', () =>
      wheelNotches(page(), right(), 40),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('paging down a folder of 20,000 files with PageDown held', async () => {
    const result = await measure(
      perf(),
      'commander: 20,000 files, PageDown held',
      () => heldKey(page(), 'PageDown', 30),
    );
    assert.ok(result.frames.updates > 0);
    await backUp();
  });

  test('listing 21,000 files in flat view as they are read', async () => {
    const result = await measure(
      perf(),
      'commander: flat view of 21,000 files',
      async () => {
        await page().keyboard.press('Control+B');
        await sleep(3000);
      },
    );
    assert.ok(result.frames.updates > 0);
    await page().keyboard.press('Control+B');
    await row(manyFolder).waitFor();
  });

  test('scrolling the thumbnails of 1,000 images with a mouse wheel as they are made', async () => {
    await openFolder(imagesFolder, 'image-0000');
    await page().keyboard.press('Control+2');
    await sleep(1000);
    const result = await measure(
      perf(),
      'commander: 1,000 thumbnails, wheel',
      () => wheelNotches(page(), right(), 30, 60),
    );
    assert.ok(result.frames.updates > 0);
    await page().keyboard.press('Control+1');
    await backUp();
  });

  test('scrolling a log of 30 MB in the viewer with a mouse wheel', async () => {
    await select(stem(logFile));
    await page().keyboard.press('F3');
    await page()
      .locator('.viewer .viewer-row:not(.commander-viewer-probe)')
      .first()
      .waitFor();
    const result = await measure(perf(), 'viewer: 30 MB log, wheel', () =>
      wheelNotches(page(), page().locator('.viewer-body'), 40),
    );
    assert.ok(result.frames.updates > 0);
    await page().keyboard.press('Escape');
    await page().locator('.viewer').waitFor({ state: 'detached' });
  });

  test('scrolling a file of 20,000 lines in the editor with a mouse wheel', async () => {
    await select(stem(codeFile));
    await page().keyboard.press('F4');
    await page().locator('.editor .cm-line').first().waitFor();
    const result = await measure(perf(), 'editor: 20,000 lines, wheel', () =>
      wheelNotches(page(), page().locator('.editor .cm-scroller'), 40),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('typing into a file of 20,000 lines in the editor', async () => {
    const lines = page().locator('.editor .cm-line');
    await lines.nth(Math.floor((await lines.count()) / 2)).click();
    await page().keyboard.press('End');
    const result = await measure(perf(), 'editor: typing', () =>
      page().keyboard.type(' const typed = input.size + 1;'.repeat(2), {
        delay: 80,
      }),
    );
    assert.ok(result.frames.updates > 0);
    const tab = page().locator('.tabs .tab.active');
    await waitFor(async () => {
      if (!((await tab.textContent()) ?? '').includes('*')) {
        return true;
      }
      await page().keyboard.press('Control+Z');
      return false;
    }, 'the typing to be undone');
  });
});
