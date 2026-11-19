import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { settledLooks, showTab, sizedWindow, tabs } from './tabReturns';
import { untilSettled } from './waits';

const longText = Array.from(
  { length: 400 },
  (_, index) => `${index} ${'line '.repeat(index % 30)}`,
).join('\n');

const kinds = [
  'commander',
  'viewer',
  'editor',
  'diff',
  'git',
  'commander',
  'viewer',
] as const;

const once = 5;

const named = (index: number) => `${kinds[index]}${index < once ? '' : ' 2'}`;

const longHold = 5000;

const shownWithin = 3000;

const alike = 0.003;

interface Drawn {
  readonly at: number;
  readonly picture: string;
}

async function drawnSwitchingTo(
  page: Page,
  index: number,
): Promise<{ readonly before: Drawn; readonly after: readonly Drawn[] }> {
  const session = await page.context().newCDPSession(page);
  const drawn: Drawn[] = [];
  session.on('Page.screencastFrame', (frame) => {
    drawn.push({ at: Date.now(), picture: frame.data });
    void session
      .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      .catch(() => undefined);
  });
  await session.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
  });
  await page.mouse.move(2, 2);
  await page.locator('.tooltip').waitFor({ state: 'detached' });
  await waitFor(() => drawn.length > 0, 'a picture of the tab left');
  await untilSettled(
    () => Promise.resolve(drawn.length),
    'the picture of the tab left to rest',
    { quiet: 150 },
  );
  const before = drawn.at(-1);
  assert.ok(before);
  const taken = drawn.length;
  const pressed = Date.now();
  await tabs(page).nth(index).click();
  await page.mouse.move(2, 2);
  await waitFor(
    async () =>
      (await tabs(page).nth(index).getAttribute('aria-selected')) === 'true',
    `tab ${index} shown`,
  );
  await settledLooks(page);
  await untilSettled(
    () => Promise.resolve(drawn.length),
    'the picture of the tab switched to to rest',
    { quiet: 300 },
  );
  await session.send('Page.stopScreencast');
  await session.detach();
  return {
    before,
    after: drawn
      .slice(taken)
      .map(({ at, picture }) => ({ at: at - pressed, picture })),
  };
}

function unlike(
  app: ElectronApplication,
  pictures: readonly string[],
  others: readonly string[],
  above: number,
): Promise<number[][]> {
  return app.evaluate(
    ({ nativeImage }, { compared, against, top }) => {
      const read = (picture: string) => {
        const image = nativeImage.createFromBuffer(
          Buffer.from(picture, 'base64'),
        );
        return { ...image.getSize(), pixels: image.toBitmap() };
      };
      const references = against.map(read);
      return compared.map((picture) => {
        const one = read(picture);
        const from = Math.ceil(one.height * top) * one.width * 4;
        return references.map((other) => {
          if (other.width !== one.width || other.height !== one.height) {
            return 1;
          }
          let differing = 0;
          for (let at = from; at < one.pixels.length; at += 4) {
            if (
              Math.abs(one.pixels[at] - other.pixels[at]) > 8 ||
              Math.abs(one.pixels[at + 1] - other.pixels[at + 1]) > 8 ||
              Math.abs(one.pixels[at + 2] - other.pixels[at + 2]) > 8
            ) {
              differing += 1;
            }
          }
          return differing / ((one.pixels.length - from) / 4);
        });
      });
    },
    { compared: pictures, against: others, top: above },
  );
}

suite('App switching tabs', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-tab-switching');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(path.join(opened, 'long.txt'), longText);
    fs.writeFileSync(path.join(opened, 'edited.txt'), longText);
    fs.writeFileSync(path.join(opened, 'older.txt'), `${longText}\nolder`);
    fs.writeFileSync(
      path.join(opened, 'other.txt'),
      longText.split('\n').toReversed().join('\n'),
    );
    const listed = path.join(folder, 'listed');
    fs.mkdirSync(listed);
    for (let index = 0; index < 40; index++) {
      fs.writeFileSync(path.join(listed, `entry ${index}.md`), String(index));
    }
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'long.txt': longText });
    fs.mkdirSync(profile, { recursive: true });
    const roots = [
      { root: opened },
      { root: path.join(opened, 'long.txt') },
      { root: path.join(opened, 'edited.txt') },
      {
        compare: {
          old: path.join(opened, 'older.txt'),
          new: path.join(opened, 'long.txt'),
        },
      },
      { root: repository.root },
      { root: listed },
      { root: path.join(opened, 'other.txt') },
    ];
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: kinds.map((tool, index) => ({
          id: String(index + 1),
          tool,
          ...roots[index],
        })),
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tabs: { holdMilliseconds: longHold } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await sizedWindow(app);
    await waitFor(
      async () => (await tabs(page).count()) === kinds.length,
      'every tab',
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    for (let index = 0; index < kinds.length; index++) {
      await showTab(page, index);
      await settledLooks(page);
    }
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('shows a tab switched back to in one step, every picture drawn below the tabs that of the tab left or that of the tab once settled, never the bare window or a tab half drawn, whichever tool it switches from and to, and shows it within three seconds', async () => {
    const above = await page.evaluate(() => {
      const tool = document.querySelector('.repository');
      return tool === null ? 0 : tool.getBoundingClientRect().top / innerHeight;
    });
    assert.ok(above > 0 && above < 0.2, `the tools start at ${above}`);
    const halfDrawn: string[] = [];
    for (const to of kinds.keys()) {
      for (const from of kinds.keys()) {
        if (
          from === to ||
          (kinds[from] !== kinds[to] && (from >= once || to >= once))
        ) {
          continue;
        }
        const [left, tool] = [named(from), named(to)];
        await showTab(page, from);
        await settledLooks(page);
        const { before, after } = await drawnSwitchingTo(page, to);
        const settled = after.at(-1);
        assert.ok(settled, `${left} to ${tool}: nothing was drawn`);
        const differences = await unlike(
          app,
          after.map(({ picture }) => picture),
          [before.picture, settled.picture],
          above,
        );
        const [apart = 0] = differences.at(-1) ?? [];
        assert.ok(apart > alike, `${left} to ${tool}: the two tabs look alike`);
        const steps = after.map(({ at }, frame) => {
          const [toLeft, toSettled] = differences[frame];
          return toSettled <= alike
            ? 'settled'
            : toLeft <= alike
              ? 'left'
              : `half drawn at ${at} ms, ${(toLeft * 100).toFixed(1)}% from the tab left and ${(toSettled * 100).toFixed(1)}% from the one settled`;
        });
        const wrong = steps.filter(
          (step) => step !== 'settled' && step !== 'left',
        );
        const shownAt = after[steps.indexOf('settled')]?.at ?? Infinity;
        if (wrong.length > 0 || shownAt > shownWithin) {
          halfDrawn.push(
            `${left} to ${tool}: ${wrong.join('; ') || `shown after ${shownAt} ms`}`,
          );
        }
      }
    }
    assert.deepStrictEqual(halfDrawn, []);
  });
});
