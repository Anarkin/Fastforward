import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { wheelNotches } from './perfInput';
import { commitsDrawn } from '../e2e/commitRows';

const commits = 20_000;

function crowdedHistory(): string {
  const parts: string[] = [];
  for (let at = 1; at <= commits; at++) {
    const message = `Step ${at}`;
    parts.push(
      `commit refs/heads/main\nmark :${at}\ncommitter Perf <perf@example.com> ${1_700_000_000 + at * 60} +0000\ndata ${message.length}\n${message}\n${at > 1 ? `from :${at - 1}\n` : ''}`,
    );
  }
  for (let at = 10; at <= commits; at += 10) {
    for (const tag of ['web', 'api', 'cli', 'docs']) {
      parts.push(
        `reset refs/tags/${tag}@${at / 10}.${at % 7}.0\nfrom :${at}\n`,
      );
    }
  }
  for (let at = 250; at <= commits; at += 500) {
    for (let branch = 0; branch < 12; branch++) {
      parts.push(`reset refs/heads/topic/${at}-${branch}\nfrom :${at}\n`);
    }
  }
  return parts.join('');
}

function crowdedRepository(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  for (const [args, input] of [
    [['init', '-q', '-b', 'main'], undefined],
    [['fast-import', '--quiet'], crowdedHistory()],
  ] as const) {
    const result = spawnSync('git', ['-C', root, ...args], {
      input,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    assert.strictEqual(result.status, 0, result.stderr);
  }
}

const folder = tempFolder('perf-bubbles');
const repository = path.join(folder, 'repository');
crowdedRepository(repository);

afterAll(() => removeFolder(folder));

suite('Frames of a commit list crowded with bubbles', () => {
  const perf = launchedForPerf(
    {
      state: {
        tabs: [
          { id: '1', tool: 'commander', root: folder },
          { id: '2', tool: 'git', root: repository },
        ],
        activeTab: '1',
      },
      settings: {
        scrolling: { smooth: true },
        tools: { git: { autoFetch: false } },
      },
    },
    (page) => page.locator('.commander').first().waitFor(),
  );
  const commitList = () => perf().page.locator('.virtual-rows.list').first();

  test('showing the git tab of 20,000 commits, every tenth with four tags', async () => {
    const { page } = perf();
    const result = await measure(
      perf(),
      'bubbles: show the git tab',
      async () => {
        await page.locator('.tabs .tab').nth(1).click();
        await commitsDrawn(page);
      },
      1000,
    );
    assert.ok(result.frames.updates > 0);
  });

  test('scrolling the commit list crowded with bubbles with a mouse wheel', async () => {
    const result = await measure(perf(), 'bubbles: commit list, wheel', () =>
      wheelNotches(perf().page, commitList(), 40),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('dragging the column of the commit list crowded with bubbles wider and back', async () => {
    const { page } = perf();
    const handle = await page
      .locator('section.column[data-focus-name="commits"] .resizer')
      .boundingBox();
    assert.ok(handle !== null);
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    const result = await measure(
      perf(),
      'bubbles: drag the commit column',
      async () => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 300, y, { steps: 30 });
        await page.mouse.move(x, y, { steps: 30 });
        await page.mouse.up();
      },
    );
    assert.ok(result.frames.updates > 0);
  });
});
