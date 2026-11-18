import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';

const sources = path.join(__dirname, '..');

function filesIn(folder: string): string[] {
  return fs
    .readdirSync(path.join(sources, folder), {
      recursive: true,
      encoding: 'utf8',
    })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(folder, file).split(path.sep).join('/'))
    .filter((file) => file !== 'test/lessons.test.ts')
    .toSorted();
}

const textOf = (file: string) =>
  fs.readFileSync(path.join(sources, file), 'utf8');

const filesWith = (folder: string, pattern: RegExp) =>
  filesIn(folder).filter((file) => pattern.test(textOf(file)));

const timesIn = (folder: string, pattern: RegExp) =>
  filesIn(folder).reduce(
    (count, file) => count + (textOf(file).match(pattern)?.length ?? 0),
    0,
  );

const fixedSleeps = 29;

suite('Lessons from past mistakes', () => {
  test('waits for a page to load again in no end-to-end test, as the app loads its pages again only for settings other than those it has and a save of its own under way replaces the settings a test wrote, so a test waited 30 seconds for a page that loaded no more; writeSettings writes them until the page shows them', () => {
    assert.deepStrictEqual(
      filesWith('test/e2e', /waitForEvent\(\s*['"]load['"]/),
      [],
    );
  });

  test('starts the app of an end-to-end test in launchApp alone, which keeps the pointer of the machine out of its windows, as a move of the real pointer took the pointer capture and dropped the tab a test dragged', () => {
    assert.deepStrictEqual(filesWith('test/e2e', /\b_electron\b/), [
      'test/e2e/appLaunch.ts',
    ]);
  });

  test('closes the app of an end-to-end test in closeOrKill alone, which answers the app that asks before it quits, as a test closing an app with a terminal tab or an unsaved file waited ten seconds and then stopped it', () => {
    assert.deepStrictEqual(
      filesWith('test', /\b(?:app|launched|electronApp)\.close\(\)/),
      ['test/e2e/appLaunch.ts'],
    );
  });

  test('stops a process by its id on Windows in stopTree alone, which holds the process open meanwhile, as taskkill stopped the process Windows gave the id of one ended by itself to, the next git of the app', () => {
    assert.deepStrictEqual(
      [
        ...filesWith('tools', /taskkill/i),
        ...filesWith('lib', /taskkill/i),
        ...filesWith('boot', /taskkill/i),
        ...filesWith('shell', /taskkill/i),
        ...filesWith('components', /taskkill/i),
      ],
      ['tools/git/main/processTree.ts'],
    );
  });

  test('sleeps for a time of its own choosing in no more places of the end-to-end tests than before, as a time long enough here was too short on a slower machine of CI and a wait for what the page shows needs none; lower the count as a sleep goes', () => {
    assert.strictEqual(
      timesIn(
        'test/e2e',
        /waitForTimeout\(|setTimeout\(\s*resolve,\s*[\d_]+\s*\)/g,
      ),
      fixedSleeps,
    );
  });

  test('measures text with the one range of the page, scratchRange, never with a range made for a measure, as every range made stays tied to the page until it is collected and is moved along at each change of the page, the editor making one a line at each redraw until dropping the lines of a scroll took 40 ms of a step under its scrollbar', () => {
    assert.deepStrictEqual(
      ['tools', 'lib', 'components', 'shell', 'boot'].flatMap((folder) =>
        filesWith(folder, /\bcreateRange\(/),
      ),
      ['lib/page/scratchRange.ts'],
    );
  });
});
