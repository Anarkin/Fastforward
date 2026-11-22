import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { afterAll, inject, suite, test } from 'vitest';
import { barOf, barParts } from '../e2e/scrollbarsShown';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { perfBuild } from './perfData';
import { dragged, heldKey, paced, sleep, wheelNotches } from './perfInput';

const placed = process.env.FASTFORWARD_PERF_WINDOW;

function git(cwd: string, args: readonly string[]): string {
  const ran = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (ran.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${ran.stderr}`);
  }
  return ran.stdout.trim();
}

function versionsOf(file: string) {
  const folder = path.dirname(file);
  const [commit, parent] = git(folder, [
    'log',
    '-2',
    '--format=%H',
    '--',
    file,
  ]).split('\n');
  if (commit === undefined || parent === undefined) {
    throw new Error(`${file} has no two versions in git`);
  }
  return {
    repository: path.resolve(git(folder, ['rev-parse', '--show-toplevel'])),
    commit,
    parent,
    subject: git(folder, ['log', '-1', '--format=%s', commit]),
  };
}

function windowPlace(): object {
  if (placed === undefined) {
    return {};
  }
  const [x = 0, y = 0, width = 0, height = 0] = placed.split(',').map(Number);
  return {
    windows: [{ id: '1', tabs: ['1', '2', '3', '4', '5'], active: '1' }],
    windowPlaces: {
      '1': { bounds: { x, y, width, height }, maximized: false },
    },
  };
}

function noted(name: string, times: object): void {
  const file = path.join(inject('perfResults'), 'opens.json');
  const before: unknown = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  fs.writeFileSync(
    file,
    `${JSON.stringify({ ...(typeof before === 'object' ? before : {}), [name]: times }, null, 2)}\n`,
  );
}

const views = [
  {
    name: 'viewer',
    tab: 1,
    pane: '.viewer-body',
    rows: '.viewer-rows .viewer-row, .viewer-rows .cell-rows[data-rows]',
    bar: '.viewer-body .scroll-proxy.vertical',
  },
  {
    name: 'editor',
    tab: 2,
    pane: '.editor .cm-scroller',
    rows: '.editor .cm-line',
    bar: '.editor .cm-scroller',
  },
  {
    name: 'diff',
    tab: 3,
    pane: '.compare-view .diff-view .virtual-rows',
    rows: '.compare-view .diff-view .virtual-row .diff-line',
    bar: '.compare-view .diff-view > .virtual-rows',
  },
  {
    name: 'git',
    tab: 4,
    pane: '.diff-view .virtual-rows',
    rows: '.diff-view .virtual-row .diff-line',
    bar: '.diff-view > .virtual-rows',
  },
] as const;

const typed = 'const typed = value + 1; // typed here';

const drawnAsCells = (process.env.FASTFORWARD_PERF_WEBGL ?? '')
  .split(',')
  .includes(path.basename(perfBuild));

const slowestScenario = 600_000;

export function framesOfFile(
  asked: string | undefined,
  wordWrap: boolean,
  title: string,
  scrollsDown = true,
): void {
  const mode = wordWrap ? 'wrapped' : 'unwrapped';
  const options = { timeout: slowestScenario };
  suite.skipIf(asked === undefined)(
    `Frames of ${title}, ${mode}`,
    options,
    () => {
      const file = path.resolve(asked ?? '');
      const base = path.basename(file);
      const { repository, commit, parent, subject } =
        asked === undefined
          ? { repository: '', commit: '', parent: '', subject: '' }
          : versionsOf(file);
      const empty = tempFolder('perf-file');
      afterAll(() => removeFolder(empty));
      const perf = launchedForPerf(
        {
          state: {
            tabs: [
              { id: '1', tool: 'commander', root: empty },
              { id: '2', tool: 'viewer', root: file },
              { id: '3', tool: 'editor', root: file },
              {
                id: '4',
                tool: 'diff',
                compare: {
                  old: file,
                  new: file,
                  oldVersion: { rev: parent, file },
                  newVersion: { rev: commit, file },
                },
              },
              { id: '5', tool: 'git', root: repository },
            ],
            activeTab: '1',
            ...windowPlace(),
          },
          settings: {
            scrolling: { smooth: true },
            text: { wordWrap, ...(drawnAsCells && { webgl: true }) },
          },
        },
        (page) => page.locator('.commander-pane').first().waitFor(),
      );

      const timedOpen = async (
        name: string,
        open: () => Promise<void>,
        rows: Locator,
      ) => {
        const times: { rows?: number; colors?: number } = {};
        const result = await measure(
          perf(),
          name,
          async () => {
            const from = performance.now();
            await open();
            await rows.first().waitFor();
            times.rows = Math.round(performance.now() - from);
            await rows
              .locator('[class*="syntax-"]')
              .or(perf().page.locator('.cell-rows[data-colored]'))
              .first()
              .waitFor({ timeout: 20_000 })
              .then(
                () => {
                  times.colors = Math.round(performance.now() - from);
                },
                () => undefined,
              );
          },
          1000,
        );
        noted(name, {
          ...times,
          size: await perf().page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
            scale: window.devicePixelRatio,
          })),
        });
        assert.ok(result.frames.updates >= 0);
      };

      for (const view of views) {
        const named = `file: ${base}, ${view.name}, ${mode}`;
        const pane = () => perf().page.locator(view.pane).first();
        const toTop = async () => {
          const { page } = perf();
          if (view.name === 'editor') {
            await page.locator('.editor .cm-content').first().focus();
          } else {
            await pane().focus();
          }
          await page.keyboard.press('Control+Home');
          await sleep(700);
        };

        if (view.name === 'git') {
          test('git commit selected', async () => {
            const { page } = perf();
            await page.locator('.tabs .tab').nth(view.tab).click();
            const row = page.locator('.commit', { hasText: subject }).first();
            await row.waitFor();
            await sleep(1000);
            await timedOpen(
              `${named}, select the commit`,
              () => row.click(),
              page.locator(view.rows),
            );
          });

          test('git file opened', async () => {
            const { page } = perf();
            const listed = page.locator('.row.file', { hasText: base }).first();
            await listed.waitFor();
            await sleep(1000);
            await timedOpen(
              `${named}, open the file`,
              () => listed.click(),
              page.locator(view.rows),
            );
          });
        } else {
          test(`${view.name} opened`, async () => {
            const { page } = perf();
            await timedOpen(
              `${named}, open`,
              () => page.locator('.tabs .tab').nth(view.tab).click(),
              page.locator(view.rows),
            );
          });
        }

        test.skipIf(!scrollsDown)(`${view.name} wheel`, async () => {
          const { page } = perf();
          await toTop();
          const result = await measure(perf(), `${named}, wheel`, () =>
            wheelNotches(page, pane(), 40),
          );
          assert.ok(result.frames.updates > 0);
        });

        test.skipIf(wordWrap)(`${view.name} wheel sideways`, async () => {
          const { page } = perf();
          await toTop();
          await page.keyboard.down('Shift');
          const result = await measure(perf(), `${named}, wheel sideways`, () =>
            wheelNotches(page, pane(), 40),
          );
          await page.keyboard.up('Shift');
          assert.ok(result.frames.updates >= 0);
        });

        const barDragged = async (
          how: string,
          sweeps: number,
          steps: number,
        ) => {
          const { page } = perf();
          await toTop();
          const { box } = await barOf(page, view.bar, 'vertical');
          const { thumb, start, end } = await barParts(page, box, 'vertical');
          assert.ok(thumb);
          const from = {
            x: thumb.left + thumb.width / 2,
            y: thumb.top + Math.min(thumb.height / 2, 12),
          };
          const room =
            box.height - start.height - end.height - thumb.height - 40;
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await sleep(300);
          try {
            const result = await measure(
              perf(),
              `${named}, ${how}`,
              async () => {
                for (let sweep = 0; sweep < sweeps; sweep++) {
                  await dragged(page, from, { x: 0, y: room }, steps);
                }
              },
            );
            assert.ok(result.frames.updates > 0);
          } finally {
            await page.mouse.up();
          }
        };

        test.skipIf(!scrollsDown)(`${view.name} drag`, () =>
          barDragged('drag', 1, 150),
        );

        test.skipIf(!scrollsDown)(`${view.name} drag quickly`, () =>
          barDragged('drag quickly', 5, 20),
        );

        if (view.name === 'editor') {
          test.skipIf(!scrollsDown)('editor cursor by rows', async () => {
            const { page } = perf();
            await toTop();
            const result = await measure(
              perf(),
              `${named}, cursor by rows`,
              () => heldKey(page, 'ArrowDown', 60),
            );
            assert.ok(result.frames.updates >= 0);
          });

          test('editor typing', async () => {
            const { page } = perf();
            await toTop();
            for (let row = 0; row < 30; row++) {
              await page.keyboard.press('ArrowDown');
            }
            await page.keyboard.press('Home');
            await sleep(700);
            const result = await measure(perf(), `${named}, typing`, () =>
              paced(typed.length, 80, (at) =>
                page.keyboard.type(typed[at] ?? ''),
              ),
            );
            for (let at = 0; at < typed.length; at++) {
              await page.keyboard.press('Control+Z');
            }
            assert.ok(result.frames.updates >= 0);
          });
        }
      }
    },
  );
}
