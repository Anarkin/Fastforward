import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type { SeenRow } from '../../components/cells/page/seen';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { cellsOf, seenGlyphs, seenRows } from './cellsSeen';
import { diffRowsSeen } from './diffSeen';
import {
  inkSeen,
  leastInk,
  mostUnlike,
  unlikeCells,
  unlikeShare,
  unlikeWhere,
  type Box,
  type Seen,
} from './inkAlike';
import { untilSettled } from './waits';

const pig = '\u{1F437}';

const lines = [
  'API server #3',
  `Node.js${pig}asd 中文\tend`,
  "const controls = 'a\u0001b\u001bc\u007fd';",
  '  two  spaces, ｆｕｌｌ and 한국어',
  'a flag \u{1F1ED}\u{1F1FA}, a family \u{1F468}‍\u{1F469}‍\u{1F467} and a keycap 1️⃣',
];

const comparedColumns = 40;

const codeBlock = '.viewer .markdown pre code .cell-rows';

const boxOf = (rows: readonly SeenRow[]): Box | undefined => {
  const row = rows.find(({ text }) => text.startsWith(lines[0] ?? ''));
  return row === undefined
    ? undefined
    : {
        left: row.left - row.column * row.advance,
        top: row.top,
        width: comparedColumns * row.advance,
        height: lines.length * row.height,
      };
};

const signsIn = (glyphs: readonly { row: number; column: number }[]) =>
  glyphs
    .toSorted((one, other) => one.row - other.row)
    .map(({ column }) => column);

interface Compared {
  readonly pixels: boolean;
  readonly before?: readonly number[];
}

const alikeTo = (
  one: Seen,
  other: Seen,
  { pixels, before }: Compared = { pixels: true },
) => {
  const cellsApart = unlikeCells(one, other, comparedColumns, lines.length)
    .map((at) => [Math.floor(at / comparedColumns), at % comparedColumns])
    .filter(
      ([row = 0, column = 0]) =>
        before === undefined || column < (before[row] ?? comparedColumns),
    );
  assert.deepStrictEqual(
    {
      viewerInked: one.inked > leastInk,
      otherInked: other.inked > leastInk,
      cellsApart,
      pixelsAlike:
        !pixels ||
        one.phase !== other.phase ||
        unlikeShare(one, other) < mostUnlike,
    },
    {
      viewerInked: true,
      otherInked: true,
      cellsApart: [],
      pixelsAlike: true,
    },
    `${unlikeShare(one, other)} of the ink unlike, the text starting ${one.phase} and ${other.phase} of a device pixel in, most unlike in the cells ${unlikeWhere(one, other, comparedColumns, lines.length)}`,
  );
};

suite('App text drawn alike', () => {
  let app: ElectronApplication;
  let page: Page;

  const show = (tab: number) => page.locator('.tabs .tab').nth(tab).click();

  const settled = async (
    box: () => Promise<Box | undefined>,
    what: string,
  ): Promise<Seen> => {
    const boxed = async () => {
      let found: Box | undefined;
      await waitFor(async () => {
        found = await box();
        return found !== undefined;
      }, what);
      assert.ok(found);
      return found;
    };
    let last = await inkSeen(app, page, await boxed());
    await untilSettled(async () => {
      last = await inkSeen(app, page, await boxed());
      return last.hash;
    }, what);
    return last;
  };

  const viewed = async () => {
    await show(0);
    return settled(
      async () => boxOf(await seenRows(page)),
      'the viewer drawn at rest',
    );
  };

  const sideOfDiff = (side: number) => async () =>
    boxOf((await diffRowsSeen(page)).filter((row) => row.side === side));

  const laidOut = async (split: boolean) => {
    await show(1);
    if ((await page.locator('.diff-view.side-by-side').count()) > 0 !== split) {
      await page
        .locator('.compare-view .toolbar[role="group"] button')
        .nth(split ? 1 : 0)
        .click();
    }
    await waitFor(
      async () =>
        (await page.locator('.diff-view.side-by-side').count()) > 0 === split,
      `the diff ${split ? 'side by side' : 'inline'}`,
    );
  };

  beforeAll(async () => {
    const folder = tempFolder('text-drawn-alike');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    const file = path.join(opened, 'lines.txt');
    const other = path.join(opened, 'other.txt');
    const notes = path.join(opened, 'notes.md');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    fs.writeFileSync(other, `${[...lines, 'an added line'].join('\n')}\n`);
    fs.writeFileSync(notes, `\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: file },
          { id: '2', tool: 'diff', compare: { old: file, new: other } },
          { id: '3', tool: 'viewer', root: notes },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false },
        text: { wordWrap: false, highlightOccurrences: false },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(
      async () => (await seenRows(page)).length >= lines.length,
      'the viewer drawn',
    );
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('draws a text in the inline diff as the viewer draws it, alike to the brightness of every pixel where it starts as far into a device pixel and cell by cell where not: whitespace shown and each line ending signed, a tab to its stop, wide characters, an emoji, a flag, a family and a keycap on two cells and control characters as their signs', async () => {
    const text = await viewed();
    await laidOut(false);
    alikeTo(
      text,
      await settled(sideOfDiff(0), 'the inline diff drawn at rest'),
    );
  });

  test('draws a text on either side of the diff side by side as the viewer draws it', async () => {
    const text = await viewed();
    await laidOut(true);
    alikeTo(text, await settled(sideOfDiff(0), 'the old side drawn at rest'));
    alikeTo(text, await settled(sideOfDiff(1), 'the new side drawn at rest'));
  });

  test('draws the lines of a code block of a Markdown preview as the viewer draws them, cell by cell on the ground of the block, each line ending signed where the viewer signs it while whitespace is shown', async () => {
    const text = await viewed();
    const ends = signsIn(await seenGlyphs(page, strings.symbols.lineFeed));
    assert.strictEqual(ends.length, lines.length);
    await show(2);
    await page.locator(codeBlock).waitFor();
    alikeTo(
      text,
      await settled(
        async () => boxOf(await cellsOf(page, codeBlock).rows()),
        'the code block drawn at rest',
      ),
      { pixels: false, before: ends },
    );
    assert.deepStrictEqual(
      signsIn(await cellsOf(page, codeBlock).glyphs(strings.symbols.lineFeed)),
      ends,
    );
  });
});
