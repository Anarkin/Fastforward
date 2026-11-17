import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cursorBlinkInterval } from '../../lib/page/cursor';
import { pixelBox } from '../../lib/page/pixelBoxes';
import { waitFor } from '../helpers/fixtures';
import {
  pixelAt,
  sortedColor,
  around,
  expectedBox,
  assertDrawn,
  inkRuns,
  placedAfterInk,
  blockShown,
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
          200,
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
