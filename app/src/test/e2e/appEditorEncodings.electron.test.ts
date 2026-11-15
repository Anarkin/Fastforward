import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  right,
  content,
  activeTab,
  editedText,
  backToCommander,
  edit,
  toEnd,
  sharedEditorApp,
} from './editorAppFixtures';

const trigger = (label: RegExp) =>
  page.locator('.editor .menu-button-trigger', { hasText: label });

suite('App editor', () => {
  sharedEditorApp();

  test('shows a file of mixed line endings as Mixed and converts every line of it to the one chosen, saving it so, and saves a file read in a code page in the encoding chosen', async () => {
    const endings = path.join(opened, 'endings.txt');
    const latin = path.join(opened, 'latin.txt');
    fs.writeFileSync(endings, 'a\r\nb\nc\r\n');
    fs.writeFileSync(latin, Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a));
    await backToCommander();
    await waitFor(
      async () =>
        (await right()
          .locator('.commander-row', { hasText: 'latin' })
          .count()) > 0,
      'the files listed',
    );
    await edit('endings.txt');
    const endingsButton = trigger(/^Mixed$/);
    await endingsButton.waitFor();
    await endingsButton.click();
    await page
      .locator('.menu-item', { hasText: 'Convert all line endings to CRLF' })
      .click();
    await trigger(/^CRLF$/).waitFor();
    await trigger(/^CRLF$/).click();
    assert.ok(
      await page
        .locator('.menu-item', { hasText: 'Convert all line endings to CRLF' })
        .isDisabled(),
    );
    assert.ok(
      await page
        .locator('.menu-item', { hasText: 'Convert all line endings to LF' })
        .isEnabled(),
    );
    await page.keyboard.press('Escape');
    await content().click();
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(endings, 'latin1'), 'a\r\nb\r\nc\r\n');

    await backToCommander();
    await edit('latin.txt');
    const readButton = page.locator(
      '.editor .menu-button-trigger[title="Encoding to read in"]',
    );
    const writeButton = page.locator(
      '.editor .menu-button-trigger[title="Encoding to write in"]',
    );
    await writeButton.click();
    await page.locator('.menu-item', { hasText: /^UTF-8 with BOM$/ }).click();
    await writeButton.filter({ hasText: /^UTF-8 BOM \(write\)$/ }).waitFor();
    assert.ok(
      await writeButton
        .locator('.menu-button-label')
        .evaluate((label) => label.scrollWidth <= label.clientWidth),
      'the whole label shown',
    );
    await writeButton.click();
    await page.locator('.menu-item', { hasText: /^UTF-8$/ }).click();
    await writeButton.filter({ hasText: /^UTF-8 \(write\)$/ }).waitFor();
    assert.strictEqual(await readButton.textContent(), '1252 (read)');
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.deepStrictEqual(
      [...fs.readFileSync(latin)],
      [0x63, 0x61, 0x66, 0xc3, 0xa9, 0x0a],
    );
    await readButton.filter({ hasText: /^UTF-8 \(read\)$/ }).waitFor();
  });

  test('ends the lines of a new file as the .editorconfig beside it says', async () => {
    fs.writeFileSync(
      path.join(opened, '.editorconfig'),
      '[*.crlf.txt]\nend_of_line = crlf\n',
    );
    const file = path.join(opened, 'made.crlf.txt');
    await backToCommander();
    await right().locator('.commander-row').first().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('made.crlf.txt');
    await prompt.press('Enter');
    await content().waitFor();
    await content().click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'latin1'), 'one\r\ntwo');
  });

  test('lists where the line ending of new lines and the encoding come from in their menus, and edits the .editorconfig one comes from once its row is clicked', async () => {
    const config = path.join(opened, '.editorconfig');
    fs.writeFileSync(
      config,
      '[*.crlf.txt]\nend_of_line = crlf\n[sourced.txt]\nend_of_line = lf\n',
    );
    fs.writeFileSync(path.join(opened, 'sourced.txt'), 'a\r\nb\r\n');
    await backToCommander();
    await edit('sourced.txt');
    const items = page.locator('.menu-item');
    await page
      .locator('.editor .menu-button-trigger[title="Encoding to read in"]')
      .click();
    await items.filter({ hasText: 'UTF-8, as its bytes are UTF-8' }).waitFor();
    await page.keyboard.press('Escape');
    await page
      .locator('.editor .menu-button-trigger', { hasText: /^CRLF$/ })
      .click();
    const fromConfig = `LF, from end_of_line in ${config}`;
    await waitFor(
      async () =>
        (await items.allTextContents()).some((text) =>
          text.endsWith(fromConfig),
        ),
      'the .editorconfig among the sources',
    );
    const texts = await items.allTextContents();
    assert.ok(
      texts.some((text) =>
        text.endsWith('CRLF, as most lines of the file end'),
      ),
      texts.join('\n'),
    );
    assert.ok(
      texts.some((text) =>
        text.endsWith('LF, from editor.endOfLine in the settings'),
      ),
      texts.join('\n'),
    );
    await items.filter({ hasText: fromConfig }).click();
    await waitFor(
      async () =>
        (await activeTab().locator('.tab-name').textContent()) ===
        '.editorconfig',
      'the .editorconfig in a tab of its own',
    );
    await waitFor(
      async () => (await editedText()).includes('[sourced.txt]'),
      'the .editorconfig edited',
    );
  });

  test('trims the whitespace at the end of the lines edited and ends the file with a line break as saved where the .editorconfig says so, leaving the lines not edited as they were', async () => {
    fs.writeFileSync(
      path.join(opened, '.editorconfig'),
      '[trimmed.txt]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n',
    );
    const file = path.join(opened, 'trimmed.txt');
    fs.writeFileSync(file, 'keep  \r\nlast');
    await backToCommander();
    await edit('trimmed.txt');
    await waitFor(
      async () => (await editedText()) === 'keep  \nlast',
      'the text',
    );
    await toEnd();
    await page.keyboard.type(' word  ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(file, 'latin1'),
      'keep  \r\nlast word\r\n',
    );
  });
});
