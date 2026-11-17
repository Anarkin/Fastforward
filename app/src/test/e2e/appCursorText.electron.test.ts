import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  drawnBox,
  around,
  assertSamePlace,
  glyphPlace,
  blockShown,
  elementBox,
} from './cursorPixels';
import {
  ratios,
  page,
  partsInPage,
  useStyle,
  zoomTo,
  typeInTerminal,
  settledShot,
  settledCell,
  promptAtTop,
  mountEditorAndField,
  focusEditor,
  focusField,
  editorCell,
  fieldCursor,
  spaceAt,
  selectedAlike,
  sharedCursorApp,
} from './cursorAppFixtures';

suite('Cursor over the text under it and beside it', () => {
  sharedCursorApp();

  for (const ratio of ratios) {
    test(`draws the character under a block lighter than the block at ${ratio * 100}%, where the text draws it, its ink centered within a quarter of a pixel of the text's and its edges within the pixel its antialiasing takes, in the editor and a text box, the two alike`, async () => {
      await useStyle('block');
      await zoomTo(ratio);
      const parts = await partsInPage();
      const text = 'xx';
      await mountEditorAndField(parts, text, 1);
      await focusEditor(parts, 1);
      const cell = await editorCell(text, 1);
      const editorShot = await settledShot(
        (taken) => blockShown(taken, cell),
        'the block of the editor on a character',
      );
      const before = { ...cell, left: cell.left - cell.width };
      const editorGlyph = glyphPlace(editorShot, cell, false);
      assertSamePlace(
        editorGlyph,
        glyphPlace(editorShot, before, true),
        'the character under the block of the editor',
      );
      assert.ok(editorGlyph.box !== undefined);

      await focusField(1);
      const placed = await elementBox(fieldCursor(), ratio);
      const fieldShot = await settledShot(
        (taken) => blockShown(taken, placed),
        `the block of the text box on a character at ${JSON.stringify(placed)}`,
      );
      const block = drawnBox(fieldShot, around(placed), placed).box ?? placed;
      assert.deepStrictEqual(
        [block.width, block.height],
        [cell.width, cell.height],
        'the block of the text box, as wide and tall as the one of the editor',
      );
      assertSamePlace(
        glyphPlace(fieldShot, block, false),
        glyphPlace(
          fieldShot,
          { ...block, left: block.left - block.width },
          true,
        ),
        'the character under the block of the text box',
      );
      assertSamePlace(
        glyphPlace(fieldShot, block, false),
        editorGlyph,
        'the character under the block of the text box, as the editor draws it',
      );
    });
  }

  for (const ratio of ratios) {
    test(`selects text over the very rows of device pixels the cursor fills at ${ratio * 100}%, ending on the pixel the cursor starts on, after a wide character boxed in two cells too, in the terminal, the editor and a text box alike`, async () => {
      await useStyle('block');
      await zoomTo(ratio);
      const parts = await partsInPage();
      for (const [text, cells] of [
        ['xx yy', 5],
        ['xx 中', 5],
      ] as const) {
        const prompt = await promptAtTop();
        await typeInTerminal(text);
        const inTerminal = await settledCell(
          (cell) =>
            cell.top === prompt.top &&
            cell.left === prompt.left + prompt.width * cells,
          'the cursor of the terminal after what was typed',
        );
        const middle = (prompt.top + prompt.height / 2) / ratio;
        await page.mouse.move((prompt.left + prompt.width / 4) / ratio, middle);
        await page.mouse.down();
        await page.mouse.move(
          (prompt.left + prompt.width * (cells - 0.25)) / ratio,
          middle,
          { steps: 5 },
        );
        await page.mouse.up();
        await selectedAlike(
          inTerminal,
          spaceAt(prompt.left, prompt.width),
          `the terminal, ${text}`,
        );

        await mountEditorAndField(parts, text, text.length);
        await parts.evaluate((inPage, length) => {
          const dom = document.querySelector('.editor-probe .cm-editor');
          const view =
            dom instanceof HTMLElement
              ? inPage.EditorView.findFromDOM(dom)
              : null;
          view?.focus();
          view?.dispatch({
            selection: inPage.EditorSelection.range(0, length),
          });
        }, text.length);
        const inEditor = await elementBox(
          page.locator('.editor-probe .cm-cursor-primary'),
          ratio,
        );
        const second = await editorCell(text, 1);
        const lineStart = second.left - second.width;
        assert.strictEqual(
          inEditor.left - lineStart,
          cells * second.width,
          `the cursor of the editor, ${cells} cells into ${text}`,
        );
        await selectedAlike(
          inEditor,
          spaceAt(lineStart, second.width),
          `the editor, ${text}`,
        );

        await page.locator('.field-probe input').evaluate((field, length) => {
          if (field instanceof HTMLInputElement) {
            field.focus();
            field.setSelectionRange(0, length);
          }
        }, text.length);
        const inField = await elementBox(fieldCursor(), ratio);
        const fieldStart = await page
          .locator('.field-probe input')
          .evaluate((field) => {
            const style = getComputedStyle(field);
            return (
              field.getBoundingClientRect().left +
              parseFloat(style.borderLeftWidth) +
              parseFloat(style.paddingLeft)
            );
          });
        await selectedAlike(
          inField,
          spaceAt(fieldStart * ratio, second.width),
          `the text box, ${text}`,
        );
      }
    });
  }

  test('stands the block of an empty text box on the first character of its placeholder, drawing that character inside the block as it draws one typed, rather than hiding it', async () => {
    await useStyle('block');
    await zoomTo(1);
    const parts = await partsInPage();
    await mountEditorAndField(parts, 'xx', 0);
    await page.locator('.field-probe input').evaluate((field) => {
      if (field instanceof HTMLInputElement) {
        field.value = '';
        field.placeholder = 'Search...';
      }
    });
    await focusField(0);
    await waitFor(
      async () => (await fieldCursor().textContent()) === 'S',
      'the first character of the placeholder in the block',
    );
    const { block, letter } = await page
      .locator('.field-probe input')
      .evaluate((field) => {
        const probe = document.createElement('span');
        probe.style.font = getComputedStyle(field).font;
        probe.style.position = 'fixed';
        probe.textContent = 'S';
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          block:
            field.parentElement
              ?.querySelector('.text-cursor')
              ?.getBoundingClientRect().width ?? 0,
          letter: width,
        };
      });
    assert.ok(Math.abs(block - letter) <= 1, `${block} for ${letter}`);
  });
});
