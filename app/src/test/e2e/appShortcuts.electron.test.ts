import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { page, sharedApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';

suite('App', () => {
  sharedApp({});

  test('shows the shortcuts on F1 or ?, closing them on Esc or F1', async () => {
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    await page.keyboard.press('F1');
    await shortcuts.waitFor();
    await page.keyboard.press('Escape');
    await shortcuts.waitFor({ state: 'detached' });
    await page.keyboard.press('?');
    await shortcuts.waitFor();
    await page.keyboard.press('F1');
    await shortcuts.waitFor({ state: 'detached' });
  });

  test('opens the shortcuts on the diff while the diff has the focus, and on git while the commits have it', async () => {
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    const open = page.locator('.shortcuts-tool.open .shortcuts-tool-name');
    const opensOn = async (entry: string) => {
      await page.keyboard.press('F1');
      await shortcuts.waitFor();
      assert.strictEqual(await open.textContent(), entry);
      await page.keyboard.press('Escape');
      await shortcuts.waitFor({ state: 'detached' });
    };
    await page.locator('.commit', { hasText: 'first' }).click();
    await opensOn('Git');
    await page.locator('.row.file').first().click();
    await page.locator('.diff-view .virtual-rows').click();
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.activeElement?.closest('.diff-view') !== null &&
            document.activeElement !== null,
        ),
      'the diff to have the focus',
    );
    await opensOn('Diff');
  });
});
