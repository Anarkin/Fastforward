import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { storedZip } from '../helpers/zips';
import {
  opened,
  profile,
  page,
  right,
  content,
  activeTab,
  editedText,
  select,
  backToCommander,
  edit,
  toStart,
  toEnd,
  activeIndex,
  topLine,
  cursorLine,
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
      JSON.stringify(saved).includes('"tool":"editor"'),
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

  test('closes the tab of a file on Escape, as the viewer does, once Escape has no selection left to drop, and asks first when the file has changes', async () => {
    const file = path.join(opened, 'notes.txt');
    const before = fs.readFileSync(file, 'latin1');
    await backToCommander();
    await edit('notes.txt');
    const count = await tabCount();
    await content().click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(await tabCount(), count);
    await page.keyboard.press('Escape');
    await waitFor(
      async () => (await tabCount()) === count - 1,
      'the tab closed',
    );

    await backToCommander();
    await edit('notes.txt');
    await toStart();
    await page.keyboard.type('z');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.confirm-popup').waitFor();
    await page.locator('.confirm-button', { hasText: "Don't Save" }).click();
    await waitFor(
      async () => (await tabCount()) === count - 1,
      'the tab closed',
    );
    assert.strictEqual(fs.readFileSync(file, 'latin1'), before);
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

  test('edits a file inside a zip on F4, putting it back into the zip as it is saved', async () => {
    fs.writeFileSync(
      path.join(opened, 'packed.zip'),
      storedZip([['top.txt', 'the top of the zip']]),
    );
    await backToCommander();
    await select('packed.zip');
    await page.keyboard.press('Shift+Enter');
    await right().locator('.commander-row', { hasText: 'top' }).waitFor();
    await edit('top.txt');
    await waitFor(
      async () => (await editedText()) === 'the top of the zip',
      'the text of the copy',
    );
    await toEnd();
    await page.keyboard.type('!');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('back into')),
      'the copy put back',
    );
    await backToCommander();
    await select('top.txt');
    await page.keyboard.press('F3');
    await page.locator('.viewer', { hasText: 'the top of the zip!' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Backspace');
    await right().locator('.commander-row', { hasText: 'packed' }).waitFor();
  });

  test('turns the tab of a file viewed into one editing it on F4, in its place among the tabs, the cursor on the line the viewer showed at its top', async () => {
    const lines = Array.from({ length: 400 }, (_, at) => `line ${at + 1}`);
    fs.writeFileSync(path.join(opened, 'long.txt'), `${lines.join('\n')}\n`);
    await backToCommander();
    await select('long.txt');
    await page.keyboard.press('F3');
    const rows = page.locator('.viewer .viewer-rows .viewer-row');
    await rows.first().waitFor();
    const tabs = await page.locator('.tabs [role="tab"]').count();
    const viewerTab = await activeIndex();
    await page.keyboard.press('End');
    await rows.filter({ hasText: 'line 400' }).waitFor();
    let shownTop = '';
    await waitFor(async () => {
      const was = shownTop;
      shownTop = (await rows.first().textContent()) ?? '';
      await new Promise((resolve) => setTimeout(resolve, 200));
      return shownTop === was;
    }, 'the viewer to stop scrolling');
    const top = /line (\d+)/.exec(shownTop);
    assert.ok(top !== null);
    await page.keyboard.press('F4');
    await content().waitFor();
    await waitFor(
      async () =>
        (await cursorLine()) === `line ${top[1]}` &&
        (await page.locator('.editor .column-status-text').textContent()) ===
          'Col 1',
      'the cursor at the start of the line the viewer showed',
    );
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
    assert.strictEqual(await activeIndex(), viewerTab);
    await waitFor(
      async () => (await topLine()) === `line ${top[1]}`,
      'the line at the top of the editor',
    );
  });

  test('says why it opens no editor for a folder or a file of binary data', async () => {
    await backToCommander();
    const tabs = await page.locator('.tabs [role="tab"]').count();
    await select('folder');
    await page.keyboard.press('F4');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('is a folder')),
      'a notice about the folder',
    );
    await select('image.bin');
    await page.keyboard.press('F4');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('binary data')),
      'a notice about the binary file',
    );
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
  });
});
