import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  right,
  content,
  select,
  sharedEditorApp,
  backToCommander,
  textShown,
  closeShownTab,
  shownInViewer,
  activeTabName,
} from './editorAppFixtures';

const twins = {
  'wcx_ftp.ini': '',
  'wincmd.ini': '[Configuration]\nfirst=wincmd.ini\n',
  'wincmd.key': 'a key that is not text\n',
  'default.bar': '[Buttonbar]\nbutton1=default.bar\n',
  'default.br2': '[Buttonbar]\nbutton1=default.br2\n',
  'vertical.bar': '[Buttonbar]\nbutton1=vertical.bar\n',
  'vertical.br2': '[Buttonbar]\nbutton1=vertical.br2\n',
};

const rowNames = () =>
  right()
    .locator('.commander-row')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const base = row.querySelector('.commander-name')?.textContent ?? '';
        const extension =
          row.querySelector('.commander-extension')?.textContent ?? '';
        return extension === '' ? base : `${base}.${extension}`;
      }),
    );

const selectedName = async () => {
  const names = await rowNames();
  const at = await right()
    .locator('.commander-row')
    .evaluateAll((rows) =>
      rows.findIndex((row) => row.classList.contains('selected')),
    );
  return names[at];
};

const madeFolder = async (name: string) => {
  const made = path.join(opened, name);
  fs.mkdirSync(made);
  for (const [file, text] of Object.entries(twins)) {
    fs.writeFileSync(path.join(made, file), text);
  }
  await backToCommander();
  await select(name);
  await page.keyboard.press('Enter');
  await waitFor(
    async () => (await rowNames()).length === Object.keys(twins).length + 1,
    `${name} to be listed`,
  );
  return made;
};

const leaveFolder = async (name: string) => {
  await backToCommander();
  await select('..');
  await page.keyboard.press('Enter');
  await waitFor(
    async () => (await rowNames()).includes(name),
    'the folder above to be listed again',
  );
};

const contentsOf = (folder: string) =>
  Object.fromEntries(
    fs
      .readdirSync(folder)
      .toSorted()
      .map((name) => [name, fs.readFileSync(path.join(folder, name), 'utf8')]),
  );

const popup = () => page.locator('.confirm-popup');

const namesAsked = () => popup().locator('.name-value').allTextContents();

const asked = () =>
  popup().evaluate((element) =>
    [...element.querySelectorAll('.name-label')].map((label) => [
      label.textContent,
      label.nextElementSibling?.textContent,
    ]),
  );

suite(
  'App commander on files whose names differ only in their extension',
  () => {
    sharedEditorApp();

    test('renames the file selected alone, leaving the file of the same name with another extension as it was', async () => {
      const folder = await madeFolder('renaming');
      await select('default.br2');
      await page.keyboard.press('Shift+F6');
      const field = page.locator('.prompt-input');
      await field.waitFor();
      assert.strictEqual(await field.inputValue(), 'default.br2');
      await field.fill('renamed.br2');
      await page.keyboard.press('Enter');
      await field.waitFor({ state: 'detached' });
      await waitFor(
        () => fs.existsSync(path.join(folder, 'renamed.br2')),
        'the file to be renamed',
      );
      const { 'default.br2': renamed, ...others } = twins;
      assert.deepStrictEqual(contentsOf(folder), {
        ...others,
        'renamed.br2': renamed,
      });
      await waitFor(
        async () => (await selectedName()) === 'renamed.br2',
        'the renamed file to be selected',
      );
      await leaveFolder('renaming');
    });

    test('copies the file selected alone into the folder of the other side, and the marked files rather than the one selected once some are marked', async () => {
      const target = path.join(opened, 'copied-into');
      fs.mkdirSync(target);
      await backToCommander();
      await select('copied-into');
      await page.keyboard.press('ControlOrMeta+ArrowLeft');
      const left = page.locator('.commander-pane').nth(0);
      await waitFor(
        async () =>
          (await left.locator('.column-name').textContent()) === target,
        'the left side to open the target',
      );
      await madeFolder('copying');

      await select('vertical.br2');
      await page.keyboard.press('F5');
      await popup().waitFor();
      assert.deepStrictEqual(await asked(), [
        ['Copy', 'vertical.br2'],
        ['To', target],
      ]);
      await page.keyboard.press('Enter');
      await waitFor(
        () => fs.existsSync(path.join(target, 'vertical.br2')),
        'the selected file to be copied',
      );
      assert.deepStrictEqual(contentsOf(target), {
        'vertical.br2': twins['vertical.br2'],
      });

      for (const name of ['default.bar', 'wincmd.ini']) {
        const at = (await rowNames()).indexOf(name);
        await right()
          .locator('.commander-row')
          .nth(at)
          .click({ modifiers: ['ControlOrMeta'] });
      }
      await waitFor(
        async () =>
          (await right().locator('.commander-row.marked').count()) === 2,
        'two files to be marked',
      );
      await select('default.br2');
      await page.keyboard.press('F5');
      await popup().waitFor();
      assert.deepStrictEqual(await asked(), [
        ['Copy', strings.commander.items(2)],
        ['To', target],
      ]);
      await page.keyboard.press('Enter');
      await waitFor(
        () => fs.readdirSync(target).length === 3,
        'the marked files to be copied',
      );
      assert.deepStrictEqual(contentsOf(target), {
        'default.bar': twins['default.bar'],
        'vertical.br2': twins['vertical.br2'],
        'wincmd.ini': twins['wincmd.ini'],
      });
      await leaveFolder('copying');
    });

    test('deletes the file selected alone for good, and the marked files rather than the one selected once some are marked', async () => {
      const folder = await madeFolder('deleting');
      await select('vertical.bar');
      await page.keyboard.press('Shift+Delete');
      await popup().waitFor();
      assert.deepStrictEqual(await namesAsked(), ['vertical.bar']);
      await page.keyboard.press('Enter');
      await waitFor(
        () => !fs.existsSync(path.join(folder, 'vertical.bar')),
        'the selected file to be deleted',
      );
      const { 'vertical.bar': _deleted, ...left } = twins;
      assert.deepStrictEqual(contentsOf(folder), left);

      for (const name of ['wcx_ftp.ini', 'wincmd.key']) {
        const at = (await rowNames()).indexOf(name);
        await right()
          .locator('.commander-row')
          .nth(at)
          .click({ modifiers: ['ControlOrMeta'] });
      }
      await select('wincmd.ini');
      await page.keyboard.press('Shift+Delete');
      await popup().waitFor();
      assert.strictEqual(
        await popup().locator('.confirm-question').textContent(),
        strings.commander.deleteItems(strings.commander.items(2)),
      );
      await page.keyboard.press('Enter');
      await waitFor(
        () => !fs.existsSync(path.join(folder, 'wincmd.key')),
        'the marked files to be deleted',
      );
      const { 'wcx_ftp.ini': _empty, 'wincmd.key': _key, ...kept } = left;
      assert.deepStrictEqual(contentsOf(folder), kept);
      await leaveFolder('deleting');
    });

    test('views and edits the file selected in the order the side shows, while a filter keeps files of one name and the sort is reversed', async () => {
      await madeFolder('filtering');
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('default');
      await waitFor(
        async () =>
          (await rowNames()).filter((name) => name.startsWith('default'))
            .length === 2 && (await rowNames()).length === 3,
        'the filter to keep the two default files',
      );
      await right()
        .locator('.commander-heading.commander-extension button')
        .click();
      await waitFor(
        async () => (await rowNames()).join() === '..,default.br2,default.bar',
        'the sort to be reversed',
      ).catch(async (error: unknown) => {
        throw new Error(`${String(error)}: ${(await rowNames()).join()}`);
      });
      await select('default.bar');
      await page.keyboard.press('F3');
      await shownInViewer('default.bar', twins['default.bar']);
      await page.keyboard.press('F4');
      await content().waitFor();
      assert.strictEqual(await activeTabName(), 'default.bar');
      await textShown(twins['default.bar'], 'the text of default.bar');
      await closeShownTab();
      await backToCommander();
      await select('default.br2');
      await page.keyboard.press('F4');
      await content().waitFor();
      assert.strictEqual(await activeTabName(), 'default.br2');
      await textShown(twins['default.br2'], 'the text of default.br2');
      await closeShownTab();
      await backToCommander();
      await right()
        .locator('.commander-heading.commander-extension button')
        .click();
    });
  },
);
