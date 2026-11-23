import { ViewerTool } from '../../../../../tools/viewer/page/tool';
import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { tipOf } from '../../../../../lib/page/tips';
import {
  inViewerTool,
  viewedTextOf,
  type ShownViewer,
} from './viewerToolFixtures';

vi.mock('../../../../../components/syntax/page/colorer', () => ({
  startColorer: () => undefined,
  colorer: () => ({ colorParts: () => () => undefined }),
}));

const notes = viewedTextOf(['plain notes']);

async function viewed(tool: ShownViewer, file: string): Promise<void> {
  await tool.send({ type: 'show', tab: 'V', file });
  await tool.send({
    type: 'viewing',
    tab: 'V',
    size: notes.size,
    version: '1',
  });
  await tool.answerRows(notes);
}

const modeButtons = ({ document }: ShownViewer) => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '.viewer .toolbar[role="group"] button',
  ),
];

const kinds = [
  { name: 'Markdown', values: '.md .markdown' },
  { name: 'PDF', values: '.pdf' },
  { name: 'Images', values: '.png .jpg .jpeg .gif .webp .avif .bmp .ico .svg' },
];

suite('The buttons a file viewed is viewed as', () => {
  test('shows the button of the preview for a file it cannot preview too, disabled, its tooltip saying so and that the kinds below are those it supports, and leaves it enabled for a file it previews, its tooltip listing the kinds alone, as the button was missing and nothing said which files have a preview', () =>
    inViewerTool(ViewerTool, async (tool) => {
      await viewed(tool, 'C:\\work\\notes.txt');
      const [hex, text, preview] = modeButtons(tool);

      assert.deepStrictEqual(
        modeButtons(tool).map((button) => [
          button.getAttribute('aria-label'),
          button.disabled,
        ]),
        [
          ['Hex', false],
          ['Text', false],
          ['Preview', true],
        ],
      );
      assert.ok(hex && text && preview);
      assert.deepStrictEqual(tipOf(preview), {
        said: 'Preview',
        at: 'below-center',
        cut: false,
        keys: '3',
        note: 'No preview for this kind of file. Supported types:',
        rows: kinds,
      });
      await tool.press('3');
      assert.deepStrictEqual(
        modeButtons(tool).map((button) => button.ariaPressed),
        ['false', 'true', 'false'],
      );

      await viewed(tool, 'C:\\work\\cat.png');
      const shown = modeButtons(tool)[2];
      assert.ok(shown);
      assert.strictEqual(shown.disabled, false);
      assert.deepStrictEqual(tipOf(shown), {
        said: 'Preview',
        at: 'below-center',
        cut: false,
        keys: '3',
        rows: kinds,
      });
    }));
});
