import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  page,
  content,
  backToCommander,
  edit,
  toStart,
  sharedEditorApp,
} from './editorAppFixtures';

suite('App editor', () => {
  sharedEditorApp();

  test('colors the code edited by its language as the viewer does, coloring again as it is typed', async () => {
    await backToCommander();
    await edit('code.ts');
    const keywords = content()
      .locator('.cm-line')
      .first()
      .locator('.syntax-keyword');
    await keywords.first().waitFor();
    assert.strictEqual(await keywords.first().textContent(), 'const');
    await toStart();
    await page.keyboard.type('// ');
    await waitFor(
      async () =>
        (
          await content()
            .locator('.cm-line')
            .first()
            .locator('.syntax-comment')
            .allTextContents()
        ).join('') === '// const a = 1;',
      'the line colored as a comment',
    );
    await content()
      .locator('.cm-line')
      .nth(1)
      .locator('.syntax-keyword')
      .first()
      .waitFor();
  });
});
