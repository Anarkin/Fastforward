import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { hugeFile, reworkSubject } from './perfData';
import {
  heldKey,
  launchedForPerf,
  measure,
  perfData,
  touchpadScroll,
  wheelNotches,
} from './perfFixtures';

suite('Frames of the git tool', () => {
  const { repository } = perfData();
  const perf = launchedForPerf(
    {
      state: {
        tabs: [{ id: '1', tool: 'git', root: repository }],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true } },
    },
    (page) => page.locator('.commit').nth(30).waitFor(),
  );
  const commitList = () => perf().page.locator('.virtual-rows.list').first();
  const toTop = async () => {
    await commitList().focus();
    await perf().page.keyboard.press('Home');
  };

  test('scrolling the commit list of 55,000 commits with a mouse wheel', async () => {
    await toTop();
    const result = await measure(perf(), 'git: commit list, wheel', () =>
      wheelNotches(perf().page, commitList(), 40),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('scrolling the commit list with a touchpad', async () => {
    await toTop();
    const result = await measure(perf(), 'git: commit list, touchpad', () =>
      touchpadScroll(perf().page, commitList(), 8000, 4000),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('paging down the commit list with PageDown held', async () => {
    await toTop();
    const result = await measure(
      perf(),
      'git: commit list, PageDown held',
      () => heldKey(perf().page, 'PageDown', 30),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('opening the diff of a file of 20,000 lines', async () => {
    const { page } = perf();
    await toTop();
    await page.locator('.commit', { hasText: reworkSubject }).click();
    const file = page.locator('.row.file', { hasText: hugeFile });
    await file.waitFor();
    const result = await measure(
      perf(),
      'git: open a diff of 20,000 lines',
      async () => {
        await file.click();
        await page
          .locator('.diff-view .virtual-row .diff-line')
          .first()
          .waitFor();
      },
      1000,
    );
    assert.ok(result.frames.updates > 0);
  });

  test('scrolling the diff of a file of 20,000 lines with a mouse wheel', async () => {
    const { page } = perf();
    const diff = page.locator('.diff-view .virtual-rows').first();
    await diff.waitFor();
    const result = await measure(perf(), 'git: diff, wheel', () =>
      wheelNotches(page, diff, 40),
    );
    assert.ok(result.frames.updates > 0);
  });
});
