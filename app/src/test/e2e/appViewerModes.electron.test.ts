import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { firstViewerRow } from './viewerAppFixtures';

const pressedMode = () =>
  page
    .locator('.viewer .toolbar[role="group"] [aria-pressed="true"]')
    .getAttribute('data-tip');

suite('App commander', () => {
  sharedCommanderApp();

  test('keeps what a viewing tab was switched to show its file as while another tab is shown, for when it is shown again, and views the file as at first in a tab opened after it closed, which can take its id', async () => {
    fs.writeFileSync(path.join(opened, 'kept.md'), '# Kept\n');
    const viewerTab = page.locator('.tabs [role="tab"]', {
      hasText: 'kept.md',
    });
    try {
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewPreview,
        'the preview',
      );
      await page
        .locator('.viewer .toolbar[role="group"]')
        .getByRole('button', { name: strings.viewer.viewText })
        .click();
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewText,
        'the text',
      );

      await page
        .locator('.tabs [role="tab"]', { hasText: 'Commander' })
        .click();
      await page.locator('.viewer').waitFor({ state: 'detached' });
      await viewerTab.click();
      await page.locator('.viewer').waitFor();
      assert.strictEqual(await pressedMode(), strings.viewer.viewText);

      await page.locator('.viewer .column-body').first().focus();
      await page.keyboard.press('Escape');
      await viewerTab.waitFor({ state: 'detached' });
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewPreview,
        'the preview of a tab opened anew',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.locator('.viewer .column-body').first().focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'kept.md'));
      await waitFor(
        async () => !(await rowNames()).includes('kept.md'),
        'the file to be gone from the list',
      );
    }
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 2 and 1 or the buttons', async () => {
    fs.writeFileSync(
      path.join(opened, 'data.bin'),
      Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256)),
    );
    await select('data');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'a binary file to open as text',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('1');
    await waitFor(
      async () =>
        (await firstViewerRow()) ===
        '0000000000 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F................',
      'the first row in hex',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .last()
            .textContent()) ?? ''
        ).startsWith('0000FFF0F0 F1'),
      'the last row',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).includes(
          'Text',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Listing',
      ),
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('2');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await page.keyboard.press('Home');
    await waitFor(
      async () =>
        ((await firstViewerRow()) ?? '').startsWith(
          `${'.'.repeat(32)} !"#$%&'()*+,-./0123456789`,
        ),
      'the bytes as text, one to a character, a dot for each with no glyph',
    );
    await page.keyboard.press('1');
    await waitFor(async () => (await pressedMode()) === 'Hex', 'the hex view');
    await page
      .locator('.viewer .toolbar[role="group"] [data-tip="Text"]')
      .click();
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');
    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(async () => (await firstViewerRow()) === 'plain', 'the text');
    assert.strictEqual(await pressedMode(), 'Text');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'data.bin'));
    fs.rmSync(path.join(opened, 'plain.txt'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('data.bin') && !names.includes('plain.txt');
    }, 'the files to be gone from the list');
  });
});
