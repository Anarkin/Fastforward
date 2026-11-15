import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  profile,
  page,
  right,
  content,
  activeTab,
  editedText,
  backToCommander,
  edit,
  toStart,
  toEnd,
  notices,
  sharedEditorApp,
} from './editorAppFixtures';

const tabCount = () => page.locator('.tabs [role="tab"]').count();

const typeAndClose = async (typed: string) => {
  await backToCommander();
  await edit('notes.txt');
  await toStart();
  await page.keyboard.type(typed);
  await activeTab().locator('.tab-unsaved').waitFor();
  await activeTab().locator('.tab-close').click();
  await page.locator('.confirm-popup').waitFor();
};

suite('App editor', () => {
  sharedEditorApp();

  test('opens the file selected on F4 in an editor tab of its own named and iconed after it, its text in the editor, and goes back to that tab on F4 again rather than opening another', async () => {
    await edit('notes.txt');
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'notes.txt',
    );
    await waitFor(
      () =>
        activeTab()
          .locator('img.tab-icon')
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          )
          .catch(() => false),
      'the icon of the file on its tab',
    );
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\n',
      'the text',
    );
    const tabs = await page.locator('.tabs [role="tab"]').count();
    await backToCommander();
    await edit('notes.txt');
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'notes.txt',
    );
    const saved: unknown = JSON.parse(
      fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
    );
    assert.ok(
      JSON.stringify(saved).includes('"edit":true'),
      JSON.stringify(saved),
    );
  });

  test('marks the tab of a file once edited, saves it on Ctrl+S byte for byte, with the line endings and the bytes it cannot decode as they were, and unmarks the tab', async () => {
    await backToCommander();
    await edit('mixed.txt');
    await waitFor(
      async () => (await editedText()).startsWith('caf'),
      'the text',
    );
    await toStart();
    await page.keyboard.type('> ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'mixed.txt')).toString('latin1'),
      '> caf\xe9\nline\r\nend',
    );
  });

  test('keeps the text edited and its undo history while the page reloads as the settings are saved', async () => {
    await backToCommander();
    await edit('notes.txt');
    await toEnd();
    await page.keyboard.type('three');
    await activeTab().locator('.tab-unsaved').waitFor();
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\nthree',
      'the edit',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: true }, dateFormat: 'YYYY-MM-DD' }),
    );
    await reloaded;
    await content().waitFor();
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\nthree',
      'the edit kept',
    );
    await activeTab().locator('.tab-unsaved').waitFor();
    await content().click();
    await page.keyboard.press('ControlOrMeta+Z');
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\n',
      'the edit undone',
    );
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
  });

  test("asks whether to save the changes of a tab before closing it, saving them on Save and leaving the file as it was on Don't Save", async () => {
    const file = path.join(opened, 'notes.txt');
    const before = fs.readFileSync(file, 'latin1');
    const count = await tabCount();
    await typeAndClose('x');
    assert.match(
      (await page.locator('.confirm-popup').textContent()) ?? '',
      /Save the changes to this file before closing it\?.*notes\.txt/,
    );
    await page.locator('.confirm-button.default').click();
    await waitFor(
      async () => (await tabCount()) === count - 1,
      'the tab closed',
    );
    assert.strictEqual(fs.readFileSync(file, 'latin1'), `x${before}`);
    await typeAndClose('y');
    await page.locator('.confirm-button', { hasText: "Don't Save" }).click();
    await waitFor(
      async () => (await tabCount()) === count - 1,
      'the tab closed',
    );
    assert.strictEqual(fs.readFileSync(file, 'latin1'), `x${before}`);
  });

  test('edits a new file named on Shift+F4 as empty text, making the file only once it is saved', async () => {
    await backToCommander();
    const file = path.join(opened, 'fresh.txt');
    await right().locator('.commander-row').first().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('fresh.txt');
    await prompt.press('Enter');
    await content().waitFor();
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'fresh.txt',
    );
    assert.strictEqual(fs.existsSync(file), false);
    await content().click();
    await page.keyboard.type('hello');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
  });

  test('reads a file changed on disk again while it has no changes in the editor, and asks before saving changes over a file changed on disk since', async () => {
    const file = path.join(opened, 'outside.txt');
    fs.writeFileSync(file, 'first\n');
    await backToCommander();
    await waitFor(
      async () =>
        (await right()
          .locator('.commander-row', { hasText: 'outside' })
          .count()) > 0,
      'the file listed',
    );
    await edit('outside.txt');
    await waitFor(async () => (await editedText()) === 'first\n', 'the text');
    fs.writeFileSync(file, 'second\n');
    await waitFor(
      async () => (await editedText()) === 'second\n',
      'the text read again',
    );
    await toStart();
    await page.keyboard.type('mine ');
    await activeTab().locator('.tab-unsaved').waitFor();
    fs.writeFileSync(file, 'third\n');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('changed on disk')),
      'a notice of the change',
    );
    assert.strictEqual(await editedText(), 'mine second\n');
    await page.keyboard.press('ControlOrMeta+S');
    await page
      .locator('.confirm-popup', { hasText: 'Changed on Disk' })
      .waitFor();
    await page.locator('.confirm-button.default').click();
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'mine second\n');
  });
});
