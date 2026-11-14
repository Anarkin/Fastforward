import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { waitFor } from '../support/fixtures';
import { floodDone, floodReady } from './perfData';
import { launchedForPerf, measure, perfData, sleep } from './perfFixtures';
import { removeFolder, tempFolder } from '../support/repositories';

suite('Frames of the terminal', () => {
  const { flood } = perfData();
  const markers = tempFolder('perf-flood');
  const perf = launchedForPerf(
    {
      state: { tabs: [{ id: '1', tool: 'terminal' }], activeTab: '1' },
      settings: {
        tools: {
          terminal: { shell: process.execPath, shellArgs: [flood, markers] },
        },
      },
    },
    (page) => page.locator('.xterm').first().waitFor(),
  );

  afterAll(() => removeFolder(markers));

  test('printing 100,000 colored lines as fast as a program can', async () => {
    const { page } = perf();
    await waitFor(
      () => fs.existsSync(path.join(markers, floodReady)),
      'the program to wait for a key',
    );
    await page.locator('.xterm').first().click();
    const result = await measure(
      perf(),
      'terminal: 100,000 lines',
      async () => {
        await page.keyboard.press('x');
        const until = Date.now() + 8000;
        while (
          !fs.existsSync(path.join(markers, floodDone)) &&
          Date.now() < until
        ) {
          await sleep(50);
        }
      },
    );
    assert.ok(result.frames.updates > 0);
  });
});
