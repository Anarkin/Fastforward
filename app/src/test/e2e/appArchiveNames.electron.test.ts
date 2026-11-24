import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { waitFor } from '../helpers/fixtures';
import { viewerTexts } from './cellsSeen';
import { diffTexts } from './diffSeen';

const editorTexts = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const host = document.querySelector('.editor-cells');
    return host instanceof HTMLElement && host.querySelector('canvas') !== null
      ? (host.seenRows?.() ?? []).map((row) => row.text)
      : [];
  });

suite('App, files named as archives of Electron', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;
  const tab = (index: number) => page.locator('.tabs .tab').nth(index);

  beforeAll(async () => {
    folder = tempFolder('archive-names');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile);
    const old = path.join(folder, 'old.asar');
    const changed = path.join(folder, 'foo.asar');
    fs.writeFileSync(old, 'alpha\n');
    fs.writeFileSync(changed, 'alpha\nbeta\n');
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: changed },
          { id: '2', tool: 'editor', root: changed },
          { id: '3', tool: 'diff', compare: { old, new: changed } },
        ],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('views, edits and compares a file named foo.asar as the file it is, as Electron took it for one of its archives and every tool said it could not read it, an invalid package', async () => {
    const seen: Record<string, string[]> = {};

    await tab(0).click();
    await waitFor(
      async () => (seen.viewer = await viewerTexts(page)).length === 2,
      'the file viewed',
    );
    await tab(1).click();
    await waitFor(
      async () =>
        (seen.editor = (await editorTexts(page)).slice(0, 2)).length === 2,
      'the file edited',
    );
    await tab(2).click();
    await waitFor(
      async () => (seen.diff = await diffTexts(page, 'added')).length === 1,
      'the files compared',
    );

    assert.deepStrictEqual(seen, {
      viewer: ['alpha', 'beta'],
      editor: ['alpha', 'beta'],
      diff: ['beta'],
    });
  });
});
