import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { viewerTexts } from './cellsSeen';
import {
  opened,
  page,
  content,
  activeTab,
  sharedEditorApp,
  written,
  backAndEdit,
  backAndView,
  textShown,
  closeShownTab,
  shownInViewer,
  activeTabName,
  toTabNamed,
  tabCount,
  toStart,
} from './editorAppFixtures';

const toStartOfText = toStart;

const sharedNames = {
  'wcx_ftp.ini': '',
  'wincmd.ini': '[Configuration]\nfirst=wincmd.ini\n',
  'default.bar': '[Buttonbar]\nButtoncount=1\nbutton1=default.bar\n',
  'default.br2': '[Buttonbar]\nButtoncount=2\nbutton1=default.br2\n',
  'vertical.bar': '[Buttonbar]\nButtoncount=3\nbutton1=vertical.bar\n',
  'vertical.br2': '[Buttonbar]\nButtoncount=4\nbutton1=vertical.br2\n',
};

suite('App file tabs', () => {
  sharedEditorApp();

  test('shows the text of the file F4 opens once the editor tab of the file opened last closed, rather than the text of that file', async () => {
    written('first.txt', 'the first file\n');
    written('second.txt', 'the second file\n');
    await backAndEdit('first.txt');
    await textShown('the first file\n', 'the text of the first file');
    await closeShownTab();
    await backAndEdit('second.txt');
    await textShown('the second file\n', 'the text of the second file');
  });

  test('shows each file of a folder whose files share their names, an empty one among them, in its own editor on F4, closing each before the next', async () => {
    for (const [name, text] of Object.entries(sharedNames)) {
      written(name, text);
    }
    for (const [name, text] of Object.entries(sharedNames)) {
      await backAndEdit(name);
      assert.strictEqual(await activeTabName(), name);
      await textShown(text, `the text of ${name}`);
      await closeShownTab();
    }
    for (const [name, text] of Object.entries(sharedNames).toReversed()) {
      await backAndEdit(name);
      await textShown(text, `the text of ${name} again`);
      await closeShownTab();
    }
  });

  test('shows each file of a folder whose files share their names in its own viewer on F3, and in its own editor on F4 from there, closing each before the next', async () => {
    for (const [name, text] of Object.entries(sharedNames)) {
      written(name, text);
    }
    for (const [name, text] of Object.entries(sharedNames)) {
      await backAndView(name);
      await shownInViewer(name, text);
      await page.keyboard.press('F4');
      await content().waitFor();
      assert.strictEqual(await activeTabName(), name);
      await textShown(text, `the text of ${name} edited from the viewer`);
      await closeShownTab();
      await backAndView(name);
      await shownInViewer(name, text);
      await closeShownTab();
    }
  });

  test('views the file of an editor tab on F3 in a viewer tab of its own, as it is saved and without asking about its changes, going to that tab on F3 again and back to the editor on F4', async () => {
    written('both.txt', 'one\ntwo\n');
    await backAndEdit('both.txt');
    await textShown('one\ntwo\n', 'the text of both.txt');
    const count = await tabCount();
    await toStartOfText();
    await page.keyboard.type('new ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('F3');
    await shownInViewer('both.txt', 'one\ntwo\n');
    assert.strictEqual(await tabCount(), count + 1);
    assert.strictEqual(await page.locator('.confirm-popup').count(), 0);
    await page.keyboard.press('F4');
    await textShown('new one\ntwo\n', 'both.txt still edited');
    assert.strictEqual(await tabCount(), count + 1);
    await page.keyboard.press('F3');
    await shownInViewer('both.txt', 'one\ntwo\n');
    assert.strictEqual(await tabCount(), count + 1);
    await closeShownTab();
    await textShown('new one\ntwo\n', 'the editor shown again');
    await toStartOfText();
    await page.keyboard.press('Escape');
    await page.locator('.confirm-popup').waitFor();
    await page.locator('.confirm-button', { hasText: "Don't Save" }).click();
    await page.locator('.confirm-popup').waitFor({ state: 'detached' });
    await waitFor(
      async () => (await tabCount()) === count - 1,
      'the tab closed',
    );
  });

  test('keeps each editor tab on its own file as the tabs are switched, an edit in one tab saved to its file alone', async () => {
    written('left.txt', 'left side\n');
    written('right.txt', 'right side\n');
    await backAndEdit('left.txt');
    await textShown('left side\n', 'the text of left.txt');
    await backAndEdit('right.txt');
    await textShown('right side\n', 'the text of right.txt');
    await toTabNamed('left.txt');
    await textShown('left side\n', 'left.txt shown again');
    await toStartOfText();
    await page.keyboard.type('edited ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await toTabNamed('right.txt');
    await textShown('right side\n', 'right.txt without the edit of left.txt');
    await toTabNamed('left.txt');
    await textShown('edited left side\n', 'left.txt with its edit');
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'left.txt'), 'utf8'),
      'edited left side\n',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'right.txt'), 'utf8'),
      'right side\n',
    );
    await closeShownTab();
    await toTabNamed('right.txt');
    await closeShownTab();
  });

  test('saves the file shown, and only its bytes, once the tab of a file as long closed without saving its edit', async () => {
    written('same-a.txt', 'aaaa\n');
    written('same-b.txt', 'bbbb\n');
    await backAndEdit('same-a.txt');
    await textShown('aaaa\n', 'the text of same-a.txt');
    await toStartOfText();
    await page.keyboard.type('x');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.confirm-popup').waitFor();
    await page.locator('.confirm-button', { hasText: "Don't Save" }).click();
    await page.locator('.confirm-popup').waitFor({ state: 'detached' });
    await backAndEdit('same-b.txt');
    await textShown('bbbb\n', 'the text of same-b.txt');
    await toStartOfText();
    await page.keyboard.type('y');
    await activeTab().locator('.tab-unsaved').waitFor();
    await textShown('ybbbb\n', 'the edit of same-b.txt');
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'same-b.txt'), 'utf8'),
      'ybbbb\n',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'same-a.txt'), 'utf8'),
      'aaaa\n',
    );
    await closeShownTab();
  });

  test('reads a file afresh as F4 opens it again, though it changed on disk while its tab was closed', async () => {
    written('changing.txt', 'before\n');
    await backAndEdit('changing.txt');
    await textShown('before\n', 'the text before');
    await closeShownTab();
    written('changing.txt', 'after the change\n');
    await backAndEdit('changing.txt');
    await textShown('after the change\n', 'the text after the change');
    await closeShownTab();
  });

  test('keeps the editors of files whose names differ only in their extension open at once apart, F4 on each going back to its own tab and each save writing its own file alone', async () => {
    written('twin.bar', '[Buttonbar]\r\nbar\r\n');
    written('twin.br2', '[Buttonbar]\r\nbr2\r\n');
    await backAndEdit('twin.bar');
    await textShown('[Buttonbar]\nbar\n', 'the text of twin.bar');
    await backAndEdit('twin.br2');
    await textShown('[Buttonbar]\nbr2\n', 'the text of twin.br2');
    const tabs = await tabCount();
    await backAndEdit('twin.bar');
    assert.strictEqual(await tabCount(), tabs);
    assert.strictEqual(await activeTabName(), 'twin.bar');
    await textShown('[Buttonbar]\nbar\n', 'twin.bar in its own tab');
    await toStartOfText();
    await page.keyboard.type(';');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    await backAndEdit('twin.br2');
    assert.strictEqual(await tabCount(), tabs);
    await textShown('[Buttonbar]\nbr2\n', 'twin.br2 without the edit');
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'twin.bar'), 'latin1'),
      ';[Buttonbar]\r\nbar\r\n',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'twin.br2'), 'latin1'),
      '[Buttonbar]\r\nbr2\r\n',
    );
    await closeShownTab();
    await toTabNamed('twin.bar');
    await closeShownTab();
  });

  test('opens the viewer of a file in text from its top, though the viewer closed before was in hex and scrolled down', async () => {
    const lines = Array.from({ length: 300 }, (_, at) => `long ${at + 1}`);
    written('long-a.txt', `${lines.join('\n')}\n`);
    written('short-b.txt', 'short b\n');
    await backAndView('long-a.txt');
    await page.keyboard.press('1');
    await waitFor(
      async () => /^[0-9A-F]{8} /.test((await viewerTexts(page))[0] ?? ''),
      'the file in hex',
    );
    await page.keyboard.press('End');
    await closeShownTab();
    await backAndView('short-b.txt');
    await shownInViewer('short-b.txt', 'short b\n');
    await closeShownTab();
  });
});
