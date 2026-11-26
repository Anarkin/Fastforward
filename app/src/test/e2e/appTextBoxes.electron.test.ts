import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { kinds, page, sharedEveryToolApp } from './everyToolAppFixtures';
import { settledLooks, showTab } from './tabReturns';

const typed = 'abc def';

const wholeSelected = () =>
  page.evaluate((length) => {
    const box = document.activeElement;
    return box instanceof HTMLInputElement
      ? box.selectionStart === 0 && box.selectionEnd === length
      : `no box but ${box?.className ?? 'nothing'}`;
  }, typed.length);

const selectAllIn = async () => {
  await page.keyboard.type(typed);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ControlOrMeta+A');
  return wholeSelected();
};

suite('App text boxes', () => {
  sharedEveryToolApp();

  test('selects the whole text of the text box typed in on Mod+A, the search of every tool that searches, the filter of the shortcuts and the path of Go To, rather than what the tool around it selects on that key', async () => {
    const seen: Record<string, unknown> = {};
    for (const [index, kind] of kinds.entries()) {
      if (kind === 'canvas') {
        continue;
      }
      await showTab(page, index);
      await settledLooks(page);
      await page.keyboard.press(
        kind === 'terminal' ? 'ControlOrMeta+Shift+F' : 'ControlOrMeta+F',
      );
      seen[`${kind} ${index}`] = await selectAllIn();
      await page.keyboard.press('Escape');
    }
    await showTab(page, 0);
    await settledLooks(page);
    await page.keyboard.press('F1');
    seen.shortcuts = await selectAllIn();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+F6');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    seen['go to'] = await selectAllIn();
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(
      seen,
      Object.fromEntries(Object.keys(seen).map((name) => [name, true])),
    );
  });
});
