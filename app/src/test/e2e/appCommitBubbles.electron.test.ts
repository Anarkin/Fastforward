import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { untilSettled } from './waits';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { commitBubble } from './commitRows';
import type { SeenCommit } from '../../tools/git/page/commitHits';

const crowds: readonly (readonly [number, readonly string[]])[] = [
  [
    3,
    Array.from(
      { length: 26 },
      (_, at) => `tags/v${at}.${'0'.repeat(at % 9)}${at}`,
    ),
  ],
  [
    20,
    Array.from(
      { length: 14 },
      (_, at) =>
        `heads/feature/${'abcdefghij'.slice(0, 1 + ((at * 3) % 10))}-${at}`,
    ),
  ],
  [
    45,
    [
      ...Array.from({ length: 9 }, (_, at) => `tags/release-${at * 7}`),
      ...Array.from(
        { length: 3 },
        (_, at) => `heads/fix-${'x'.repeat(at * 5)}`,
      ),
    ],
  ],
  [
    70,
    Array.from(
      { length: 5 },
      (_, at) => `tags/release-candidate-${'build'.repeat(at + 1)}`,
    ),
  ],
  [89, Array.from({ length: 40 }, (_, at) => `heads/topic/branch-${at}`)],
];

async function crowdedProfile(
  folder: string,
): Promise<{ profile: string; root: string; hashes: string[] }> {
  const profile = path.join(folder, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  const repository = await tempRepository(path.join(folder, 'repository'));
  for (let step = 0; step < 90; step++) {
    await repository.git('commit', '--allow-empty', '-m', `step ${step}`);
  }
  const hashes = (await repository.git('rev-list', 'HEAD')).trim().split('\n');
  for (const [at, names] of crowds) {
    for (const name of names) {
      const file = path.join(repository.root, '.git', 'refs', name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${hashes[at]}\n`);
    }
  }
  fs.writeFileSync(
    path.join(repository.root, '.git', 'refs', 'tags', 'solo'),
    `${hashes[30]}\n`,
  );
  fs.writeFileSync(
    path.join(profile, 'state.json'),
    JSON.stringify({
      tabs: [{ id: '1', tool: 'git', root: repository.root }],
      activeTab: '1',
    }),
  );
  fs.writeFileSync(
    path.join(profile, 'settings.user.json'),
    JSON.stringify({ tools: { git: { autoFetch: false } } }),
  );
  return { profile, root: repository.root, hashes };
}

const drawnRows = (list: Locator): Promise<readonly SeenCommit[]> =>
  list.evaluate(
    (element) =>
      element.querySelector<HTMLElement>('.graph-layer')?.seenCommits?.() ?? [],
  );

const linesOf = (row: SeenCommit): number =>
  new Set(row.bubbles.map((bubble) => bubble.top)).size;

const untilLaidOut = (list: Locator, subject?: string, lines = 1) =>
  waitFor(
    async () =>
      (await drawnRows(list)).some(
        (row) =>
          row.bubbles.length > 1 &&
          (subject === undefined || row.subject === subject) &&
          linesOf(row) >= lines,
      ),
    `bubbles laid out on ${lines} lines`,
  );

const bubbleInset = 6;

const bubbleGap = 4;

const rowPadding = 8;

function brokenLines(list: Locator): Promise<string[]> {
  return list.evaluate(
    (element, [inset, gap, padding]) => {
      const problems: string[] = [];
      const rows =
        element.querySelector<HTMLElement>('.graph-layer')?.seenCommits?.() ??
        [];
      for (const row of rows) {
        if (row.bubbles.length < 2) {
          continue;
        }
        const subject = row.subject ?? '';
        const lines = Map.groupBy(row.bubbles, (bubble) => bubble.top);
        if (Math.round(row.height / row.line) !== 2 + lines.size) {
          problems.push(`${subject}: ${lines.size} lines in ${row.height}px`);
        }
        const start = row.subjectLeft;
        const room = row.left + row.width - padding - start;
        let before: number | undefined;
        for (const bubbles of lines.values()) {
          const edges = bubbles.map((bubble) => ({
            from: bubble.left + inset,
            to: bubble.left + bubble.width + gap + inset,
          }));
          const first = edges[0];
          const last = edges.at(-1);
          if (first === undefined || last === undefined) {
            continue;
          }
          const used = last.to - start;
          if (edges.length > 1 && used > room + 0.01) {
            problems.push(`${subject}: ${used} of ${room} used`);
          }
          if (
            before !== undefined &&
            before + first.to - first.from <= room - 0.01
          ) {
            problems.push(
              `${subject}: broken before ${first.to - first.from} with ${room - before} left`,
            );
          }
          before = used;
        }
      }
      return problems;
    },
    [bubbleInset, bubbleGap, rowPadding] as const,
  );
}

suite('Commit bubbles', () => {
  for (const scale of [1, 1.25, 1.5, 1.75]) {
    test(`breaks the bubbles of a commit at ${scale * 100}% onto a line of their own only where the next would no longer fit the one before, at every width the column is dragged to, narrower and wider as far as it goes, if the window leaves it room to move at all, each row as tall as its lines and no more, and keeps the height the list scrolls through the same from its start to its end, as the list guessed one line of bubbles for a commit before drawing it and grew as it drew one with many, its thumb shrinking`, async () => {
      const folder = tempFolder('commit-bubbles');
      const app = await launchApp((await crowdedProfile(folder)).profile, {
        scale,
      });
      try {
        const page = await app.firstWindow();
        const list = page.locator('.virtual-rows.list.commit-rows');
        await untilLaidOut(list);
        const copies = await list.locator('.bubble-lab .badge').count();
        assert.ok(copies > 0 && copies < 10, `${copies} copies of bubbles`);
        const resizer = page.locator(
          'section.column[data-focus-name="commits"] .resizer',
        );
        const handle = await resizer.boundingBox();
        assert.ok(handle !== null);
        const y = handle.y + handle.height / 2;
        let x = handle.x + handle.width / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        const problems: string[] = [];
        const lineCounts = new Set<number>();
        const widths = new Set<number>();
        for (const by of [-23, 23]) {
          let still = 0;
          let last = Number.NaN;
          for (let step = 0; step < 40 && still < 2; step++) {
            x += by;
            await page.mouse.move(x, y, { steps: 2 });
            const seen = await untilSettled(
              async () => ({
                problems: await brokenLines(list),
                lines: (await drawnRows(list))
                  .filter((row) => row.bubbles.length > 1)
                  .reduce((sum, row) => sum + linesOf(row), 0),
                width: await list.evaluate((element) => element.clientWidth),
              }),
              'the bubbles to settle',
            );
            problems.push(...seen.problems.map((each) => `${x}: ${each}`));
            lineCounts.add(seen.lines);
            widths.add(seen.width);
            still = seen.width === last ? still + 1 : 0;
            last = seen.width;
          }
        }
        await page.mouse.up();
        assert.deepStrictEqual(problems, []);
        assert.ok(
          widths.size === 1 || lineCounts.size > 1,
          JSON.stringify({ lines: [...lineCounts], widths: [...widths] }),
        );
        const heights = new Set<number>();
        await list.evaluate((element) => {
          element.scrollTop = 0;
        });
        for (let step = 0; step < 40; step++) {
          const atEnd = await list.evaluate(async (element) => {
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            element.scrollTop += element.clientHeight / 2;
            return (
              element.scrollTop + element.clientHeight >=
              element.scrollHeight - 1
            );
          });
          heights.add(
            await untilSettled(
              () => list.evaluate((element) => element.scrollHeight),
              'the list to settle',
            ),
          );
          if (atEnd) {
            break;
          }
        }
        assert.strictEqual(heights.size, 1, [...heights].join(' -> '));
        assert.deepStrictEqual(await brokenLines(list), []);
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    });
  }

  test('keeps the commit atop the list where it is as the column is dragged and the commits above it gain or lose lines of bubbles, and lays a commit drawn with one bubble out anew once it gains many, cutting no row and keeping the height the list scrolls through the same, as a height measured for it before was kept', async () => {
    const folder = tempFolder('commit-bubbles-moving');
    const { profile, root, hashes } = await crowdedProfile(folder);
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      const list = page.locator('.virtual-rows.list.commit-rows');
      await untilLaidOut(list);
      const showAtTop = async (subject: string) => {
        await list.evaluate((element) => {
          element.scrollTop = 0;
        });
        const shown = await untilSettled(
          () =>
            list.evaluate((element, wanted) => {
              const row = (
                element
                  .querySelector<HTMLElement>('.graph-layer')
                  ?.seenCommits?.() ?? []
              ).find((each) => each.subject === wanted);
              if (row === undefined) {
                const before = element.scrollTop;
                element.scrollTop += element.clientHeight / 2;
                if (element.scrollTop === before) {
                  element.scrollTop = 0;
                }
                return `not drawn at ${Math.round(before)}`;
              }
              element.scrollTop +=
                row.top - element.getBoundingClientRect().top;
              return 'shown';
            }, subject),
          `${subject} at the top`,
          { accepted: (seen) => seen === 'shown' },
        );
        assert.strictEqual(shown, 'shown', subject);
      };
      const atop = () =>
        untilSettled(
          () =>
            list.evaluate((element) => {
              const top = element.getBoundingClientRect().top;
              const row = (
                element
                  .querySelector<HTMLElement>('.graph-layer')
                  ?.seenCommits?.() ?? []
              )
                .map((each) => ({
                  subject: each.subject,
                  at: each.top - top,
                  bottom: each.top + each.height - top,
                }))
                .filter((each) => each.bottom > 0.5 / devicePixelRatio)
                .toSorted((a, b) => a.at - b.at)[0];
              return `${row?.subject} at ${Math.round((row?.at ?? 0) * 4) / 4}`;
            }),
          'the list to settle',
        );
      await showAtTop('step 40');
      const kept = await atop();
      assert.match(kept, /^step 40 at /);
      const handle = await page
        .locator('section.column[data-focus-name="commits"] .resizer')
        .boundingBox();
      assert.ok(handle !== null);
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const by of [120, 260, 60]) {
        await page.mouse.move(x + by, y, { steps: 4 });
        assert.strictEqual(await atop(), kept, `dragged by ${by}`);
      }
      await page.mouse.up();
      await showAtTop('step 59');
      await commitBubble(page, 'solo').waitFor();
      for (let at = 0; at < 20; at++) {
        fs.writeFileSync(
          path.join(root, '.git', 'refs', 'tags', `grown-${at}`),
          `${hashes[30]}\n`,
        );
      }
      await untilLaidOut(list, 'step 59', 2);
      assert.deepStrictEqual(await brokenLines(list), []);
      await list.evaluate((element) => {
        element.scrollTop = 0;
      });
      const heights = new Set<number>();
      for (let step = 0; step < 40; step++) {
        const atEnd = await list.evaluate((element) => {
          element.scrollTop += element.clientHeight / 2;
          return (
            element.scrollTop + element.clientHeight >= element.scrollHeight - 1
          );
        });
        heights.add(
          await untilSettled(
            () => list.evaluate((element) => element.scrollHeight),
            'the list to settle',
          ),
        );
        if (atEnd) {
          break;
        }
      }
      assert.strictEqual(heights.size, 1, [...heights].join(' -> '));
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
