import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cursorBlinkInterval } from '../../lib/page/cursor';
import { pixelBox } from '../../lib/page/pixelBoxes';
import { waitFor } from '../helpers/fixtures';
import {
  pixelAt,
  sortedColor,
  drawnBox,
  around,
  expectedBox,
  assertDrawn,
  assertSamePlace,
  glyphPlace,
  inkRuns,
  placedAfterInk,
  blockShown,
  elementBox,
} from './cursorPixels';
import { focusColor } from './cursorWindow';
import {
  ratios,
  page,
  partsInPage,
  shot,
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
  fieldArea,
  shotShowing,
  moveField,
  fieldCursor,
  spaceAt,
  selectedAlike,
  sharedCursorApp,
} from './cursorAppFixtures';

const animationOf = (selector: string) =>
  page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return JSON.stringify([
      style.animationName.replace(/-again$/, ''),
      style.animationDuration,
      style.animationTimingFunction,
      style.animationIterationCount,
    ]);
  });

suite('Cursor', () => {
  sharedCursorApp();

  for (const style of ['block', 'bar', 'underline', 'outline'] as const) {
    for (const ratio of ratios) {
      test(`draws a ${style} of the setting alike to the device pixel at ${ratio * 100}% in the terminal and the editor, as the WebGL renderer of xterm.js fills it, and in a text box as in the editor from the character before it, with no pixel of another color around it, drawing it as it is in the terminal and the editor once they lose the focus`, async () => {
        await useStyle(style);
        await zoomTo(ratio);
        const parts = await partsInPage();
        const text = 'x  ';

        const prompt = await promptAtTop();
        await typeInTerminal(text);
        const inTerminal = await settledCell(
          (cell) =>
            cell.top === prompt.top &&
            cell.left === prompt.left + prompt.width * text.length,
          'the cursor of the terminal after what was typed',
        );
        const terminalShot = await shotShowing(
          around(inTerminal),
          expectedBox(inTerminal, style, ratio),
          `the ${style} of the terminal at ${ratio}`,
        );
        const terminalColor = assertDrawn(
          terminalShot,
          around(inTerminal),
          expectedBox(inTerminal, style, ratio),
          'the terminal',
        );

        await mountEditorAndField(parts, text, text.length);
        await focusEditor(parts, text.length);
        const inEditor = await editorCell(text, text.length);
        const editorShot = await shotShowing(
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          `the ${style} of the editor at ${ratio}`,
        );
        const editorColor = assertDrawn(
          editorShot,
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          'the editor',
        );
        assert.deepStrictEqual(
          [inEditor.width, inEditor.height],
          [inTerminal.width, inTerminal.height],
          'the cells of the editor and the terminal',
        );
        const editorArea = pixelBox(
          await page
            .locator('.editor-probe .cm-content')
            .evaluate((content) => {
              const { left, top, width, height } =
                content.getBoundingClientRect();
              return { left, top, width, height };
            }),
          ratio,
        );
        const editorPlaced = placedAfterInk(editorShot, editorArea);
        assert.strictEqual(editorPlaced?.strays, 0, 'the editor, cleanly');

        await focusField(text.length);
        let area = await fieldArea();
        const fieldShot = await settledShot(
          (taken) => placedAfterInk(taken, area) !== undefined,
          `the ${style} of the text box`,
        );
        assert.deepStrictEqual(
          placedAfterInk(fieldShot, area),
          editorPlaced,
          'the text box, from the character before it, as the editor',
        );

        if (style === 'block') {
          const fieldBlock = inkRuns(fieldShot, area).at(-1);
          assert.ok(fieldBlock !== undefined);
          const fieldColor = pixelAt(
            fieldShot,
            fieldBlock.left,
            fieldBlock.top,
          );
          assert.deepStrictEqual(
            [editorColor, fieldColor],
            [terminalColor, terminalColor],
            'the color of the cursor in the terminal, the editor and the text box',
          );
          assert.deepStrictEqual(
            sortedColor(terminalColor),
            await focusColor(page),
            'the color of the cursor, by default the focus color',
          );

          await moveField(7.3);
          area = await fieldArea();
          const movedShot = await settledShot(
            (taken) =>
              JSON.stringify(placedAfterInk(taken, area)) ===
              JSON.stringify(editorPlaced),
            'the cursor of the text box, moved with its box',
          ).catch(async () => shot());
          assert.deepStrictEqual(
            placedAfterInk(movedShot, area),
            editorPlaced,
            'the text box moved in its box without an event of its own, its cursor with it',
          );
        }

        const unfocusedShot = await shotShowing(
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          `the ${style} of the editor without the focus at ${ratio}`,
        );
        assertDrawn(
          unfocusedShot,
          around(inTerminal),
          expectedBox(inTerminal, style, ratio),
          'the terminal without the focus',
        );
        assertDrawn(
          unfocusedShot,
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          'the editor without the focus',
        );
      });
    }
  }

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

  test('blinks the cursor of the editor and of a text box alike once the setting asks for it, shown and hidden for the 600 ms each the WebGL renderer of xterm.js shows and hides its own, and keeps the editor and the terminal blinking once they lose the focus', async () => {
    await useStyle('block', true);
    await zoomTo(ratios[0]);
    const parts = await partsInPage();
    const inTerminal = await promptAtTop();
    await mountEditorAndField(parts, 'x', 1);
    const blinking = JSON.stringify([
      'cursor-blink',
      `${(2 * cursorBlinkInterval) / 1000}s`,
      'steps(1)',
      'infinite',
    ]);
    await focusEditor(parts, 1);
    await waitFor(
      async () =>
        (await animationOf('.editor-probe .cm-cursorLayer')) === blinking,
      'the blinking cursor of the editor',
    );
    await focusField(1);
    await page.locator('.field-probe .text-cursor').waitFor();
    assert.strictEqual(
      await animationOf('.field-probe .text-cursor'),
      blinking,
    );
    assert.strictEqual(
      await animationOf('.editor-probe .cm-cursorLayer'),
      blinking,
      'the editor without the focus',
    );
    const seen = new Set<boolean>();
    await waitFor(async () => {
      seen.add(blockShown(await shot(), inTerminal));
      return seen.size === 2;
    }, 'the block of the terminal shown and hidden without the focus');
  });
});
