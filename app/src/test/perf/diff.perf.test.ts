import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { paddedTable } from './perfData';
import { launchedForPerf, measure } from './perfFixtures';
import { sleep, wheelNotches } from './perfInput';

const words = [
  'the',
  'files',
  'of',
  'every',
  'side',
  'shown',
  'read',
  'folder',
  'with',
  'a',
  'line',
  'under',
  'path',
  'once',
  'selected',
  'marked',
  'archive',
  'copied',
];

function row(index: number, changed: boolean): string {
  const notes = Array.from(
    { length: 120 + (index % 7) * 20 },
    (_, at) => words[(index * 7 + at) % words.length],
  ).join(' ');
  return `| Feature ${index} | What it does ${index} | Ctrl+${index % 12} | Common | ✅ Yes | ${changed ? 'Changed: ' : ''}${notes}, \`code ${index}\` |`;
}

function features(changedEvery: number): string {
  const rows = Array.from({ length: 300 }, (_, index) =>
    row(index, changedEvery > 0 && index % changedEvery === 7),
  );
  return [
    '# FEATURES',
    '',
    '| Feature | What it does | Key | Tier | Fastforward | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function git(cwd: string, args: readonly string[]): string {
  const ran = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Perf',
      GIT_AUTHOR_EMAIL: 'perf@example.com',
      GIT_COMMITTER_NAME: 'Perf',
      GIT_COMMITTER_EMAIL: 'perf@example.com',
    },
  });
  if (ran.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${ran.stderr}`);
  }
  return ran.stdout.trim();
}

const folder = tempFolder('perf-diff');
const file = path.join(folder, 'FEATURES.md');
git(folder, ['init', '-q', '-b', 'main']);
fs.writeFileSync(file, features(0));
git(folder, ['add', '.']);
git(folder, ['commit', '-q', '-m', 'Add the features']);
const before = git(folder, ['rev-parse', 'HEAD']);
fs.writeFileSync(file, features(40));
git(folder, ['commit', '-q', '-am', 'Change a few features']);
const after = git(folder, ['rev-parse', 'HEAD']);
const padded = path.join(folder, 'padded.md');
fs.writeFileSync(padded, `${paddedTable(300).join('\n')}\n`);
git(folder, ['add', '.']);
git(folder, ['commit', '-q', '-m', 'Add a padded table']);
const paddedBefore = git(folder, ['rev-parse', 'HEAD']);
fs.writeFileSync(padded, `${paddedTable(300, 40).join('\n')}\n`);
git(folder, ['commit', '-q', '-am', 'Change a few rows']);
const paddedAfter = git(folder, ['rev-parse', 'HEAD']);

function comparedForPerf(
  compared: string,
  old: string,
  changed: string,
  settings: unknown,
) {
  const perf = launchedForPerf(
    {
      state: {
        tabs: [
          {
            id: '1',
            tool: 'diff',
            compare: {
              old: compared,
              new: compared,
              oldVersion: { rev: old, file: compared },
              newVersion: { rev: changed, file: compared },
            },
          },
        ],
        activeTab: '1',
      },
      settings,
    },
    (page) =>
      page.locator('.compare-view .diff-view .virtual-row').nth(10).waitFor(),
  );
  const diff = () =>
    perf().page.locator('.compare-view .diff-view .virtual-rows').first();
  const toTop = async () => {
    await diff().focus();
    await perf().page.keyboard.press('Control+Home');
  };
  const scrolled = async (name: string) => {
    await toTop();
    const result = await measure(perf(), `diff: ${name}`, () =>
      wheelNotches(perf().page, diff(), 40),
    );
    assert.ok(result.frames.updates > 0);
  };
  return { perf, diff, scrolled };
}

const notGliding = {
  scrolling: { smooth: false },
  text: { wordWrap: true },
};

suite('Frames of the diff tool', () => {
  const { perf, diff, scrolled } = comparedForPerf(
    file,
    before,
    after,
    notGliding,
  );

  test('scrolling a Markdown file of long lines compared whole, side by side, wrapped, its whitespace shown and colored', async () => {
    await scrolled('long lines, side by side, wrapped');
  });

  test('scrolling it inline', async () => {
    await perf()
      .page.locator('.compare-view .segmented button')
      .first()
      .click();
    await scrolled('long lines, inline, wrapped');
    await perf().page.locator('.compare-view .segmented button').last().click();
  });

  test('scrolling it with its whitespace hidden', async () => {
    await diff().focus();
    await perf().page.keyboard.press('.');
    await scrolled('long lines, side by side, wrapped, no whitespace');
    await diff().focus();
    await perf().page.keyboard.press('.');
  });

  test('scrolling it uncolored', async () => {
    await perf().page.locator('.compare-view .language-button button').click();
    await perf()
      .page.locator('.menu-item', { hasText: 'Plain Text' })
      .first()
      .click();
    await scrolled('long lines, side by side, wrapped, plain text');
  });

  test('scrolling it unwrapped', async () => {
    await diff().focus();
    await perf().page.keyboard.press('w');
    await scrolled('long lines, side by side, unwrapped, plain text');
  });
});

suite('Frames of the diff tool on a table padded with spaces', () => {
  afterAll(() => removeFolder(folder));
  const { perf, diff, scrolled } = comparedForPerf(
    padded,
    paddedBefore,
    paddedAfter,
    notGliding,
  );

  test('scrolling a Markdown table padded with a thousand spaces a line, side by side, wrapped', async () => {
    await scrolled('padded table, side by side, wrapped');
  });

  test('scrolling the padded table inline', async () => {
    await perf()
      .page.locator('.compare-view .segmented button')
      .first()
      .click();
    await scrolled('padded table, inline, wrapped');
    await perf().page.locator('.compare-view .segmented button').last().click();
  });

  test('scrolling the padded table unwrapped', async () => {
    await diff().focus();
    await perf().page.keyboard.press('w');
    await scrolled('padded table, side by side, unwrapped');
  });

  test('scrolling the padded table sideways, unwrapped', async () => {
    const { page } = perf();
    await diff().focus();
    await page.keyboard.press('Control+Home');
    await sleep(500);
    await page.keyboard.down('Shift');
    const result = await measure(
      perf(),
      'diff: padded table, side by side, unwrapped, sideways',
      () => wheelNotches(page, diff(), 40),
    );
    await page.keyboard.up('Shift');
    assert.ok(result.frames.updates > 0);
  });
});
