import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { viewerShows } from './cellsSeen';
import { storedZip } from '../helpers/zips';
import { clickLine } from './commanderRows';
import {
  opened,
  page,
  right,
  rowNames,
  selected,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('enters a zip from the menu of the file through 7-Zip, listing what it holds as the folders of the side, views a file of it on F3 from a copy, and leaves it going back selecting the zip', async () => {
    const zip = path.join(opened, 'packed.zip');
    fs.writeFileSync(
      zip,
      storedZip([
        ['docs/readme.md', '# readme'],
        ['top.txt', 'the top of the zip'],
      ]),
    );
    await clickLine(page, right(), 'packed', { button: 'right' });
    await page
      .locator('.context-menu .menu-item', {
        hasText: strings.commander.openWithSevenZip,
      })
      .click();
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,top.txt',
      'the zip to be listed as a folder',
    );
    await select('top');
    await page.keyboard.press('F3');
    await page.locator('.tabs .tab.active', { hasText: 'top.txt' }).waitFor();
    await viewerShows(page, 'the top of the zip');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await selected()).includes('packed'),
      'the folder of the zip with the zip selected',
    );
    fs.rmSync(zip);
    await waitFor(
      async () => !(await rowNames()).includes('packed.zip'),
      'the zip to be gone',
    );
  });

  test('enters a zip on its own side with Mod+Right, and copies a folder of it into the folder of the other side on F5 once confirmed, taken out with 7-Zip through the process that copies', async () => {
    const zip = path.join(opened, 'packed-copy.zip');
    const into = path.join(opened, 'unpackinto');
    fs.mkdirSync(into);
    fs.writeFileSync(
      zip,
      storedZip([
        ['docs/readme.md', '# readme'],
        ['top.txt', 'the top of the zip'],
      ]),
    );
    const left = page.locator('.commander-pane').nth(0);
    const popup = page.locator('.confirm-popup');
    await select('unpackinto');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === into,
      'the left side to open the target',
    );
    await select('packed-copy');
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,top.txt',
      'the zip to be entered on its own side',
    );

    await select('docs');
    await page.keyboard.press('F5');
    await popup.waitFor();
    await page.keyboard.press('Enter');
    await waitFor(
      () => fs.existsSync(path.join(into, 'docs', 'readme.md')),
      'the folder to be copied out of the zip',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(into, 'docs', 'readme.md'), 'utf8'),
      '# readme',
    );

    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await selected()).includes('packed-copy'),
      'the folder of the zip with the zip selected',
    );
    fs.rmSync(zip);
    fs.rmSync(into, { recursive: true });
    await waitFor(async () => {
      const names = await rowNames();
      return (
        !names.includes('packed-copy.zip') && !names.includes('unpackinto')
      );
    }, 'the zip and the folder copied into to be gone');
  });
});
