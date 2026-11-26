import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { hugeFile, reworkSubject, wideSubject } from './perfData';
import { launchedForPerf, measure, perfData } from './perfFixtures';
import { heldKey, touchpadScroll, wheelNotches } from './perfInput';
import { commitRow, commitsDrawn } from '../e2e/commitRows';
import { fileRow } from '../e2e/fileRows';

suite('Frames of the git tool', () => {
  const { repository } = perfData();
  const perf = launchedForPerf(
    {
      state: {
        tabs: [{ id: '1', tool: 'git', root: repository }],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true }, text: { wordWrap: true } },
    },
    (page) => commitsDrawn(page),
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
    await commitRow(page, reworkSubject).click();
    const file = fileRow(page, hugeFile, { kind: 'file' });
    await file.waitFor();
    const result = await measure(
      perf(),
      'git: open a diff of 20,000 lines',
      async () => {
        await file.click();
        await page
          .locator('.diff-view .diff-cells[data-rows]:has(canvas)')
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

  test('scrolling every change of a commit of 500 hunks, its lines wrapped, with a mouse wheel', async () => {
    const { page } = perf();
    const every = fileRow(page, 'All Changes', { kind: 'header' });
    if ((await every.count()) === 0) {
      await toTop();
      await commitRow(page, reworkSubject).click();
    }
    await every.click();
    await page.locator('.diff-view .hunk-divider').first().waitFor();
    const diff = page.locator('.diff-view .virtual-rows').first();
    const from = await diff.evaluate((list) => list.scrollTop);
    const result = await measure(perf(), 'git: every change, wheel', () =>
      wheelNotches(page, diff, 40),
    );
    assert.ok(result.frames.updates > 0);
    assert.ok((await diff.evaluate((list) => list.scrollTop)) > from);
  });
});

suite('Frames of the files of a commit', () => {
  const { wide } = perfData();
  const perf = launchedForPerf(
    {
      state: {
        tabs: [{ id: '1', tool: 'git', root: wide }],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true } },
    },
    async (page) => {
      await commitsDrawn(page, 1);
      await commitRow(page, wideSubject).click();
      await fileRow(page, 'file49.ts', { kind: 'file' }).first().waitFor();
    },
  );
  const fileList = () =>
    perf().page.locator('.column').nth(1).locator('.virtual-rows').first();

  test('scrolling the files of a commit of 20,000 files with a mouse wheel', async () => {
    const result = await measure(perf(), 'git: files, wheel', () =>
      wheelNotches(perf().page, fileList(), 40),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('scrolling the files of a commit with a touchpad', async () => {
    const result = await measure(perf(), 'git: files, touchpad', () =>
      touchpadScroll(perf().page, fileList(), 8000, 4000),
    );
    assert.ok(result.frames.updates > 0);
  });
});
