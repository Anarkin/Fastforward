import * as path from 'node:path';
import type * as viewModule from '@codemirror/view';
import * as esbuild from 'esbuild';
import type { JSHandle } from 'playwright-core';
import type * as editorKeymapModule from '../../tools/editor/page/keymap';
import type * as editorSelectionModule from '../../tools/editor/page/selection';
import type * as editorTextModule from '../../tools/editor/page/text';
import type * as cellTableModule from '../../lib/page/cellTable';
import { page } from './appFixtures';

export type PageEditor = Pick<typeof viewModule, 'EditorView' | 'lineNumbers'> &
  Pick<typeof editorTextModule, 'appTextLook' | 'blanksShown'> &
  Pick<typeof editorSelectionModule, 'appSelection'> &
  Pick<typeof editorKeymapModule, 'editorKeymap'> &
  Pick<typeof cellTableModule, 'terminalCells'>;

export async function editorInPage(): Promise<JSHandle<PageEditor>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { EditorView, lineNumbers } from '@codemirror/view';",
        "export { appTextLook, blanksShown } from '../../tools/editor/page/text';",
        "export { appSelection } from '../../tools/editor/page/selection';",
        "export { editorKeymap } from '../../tools/editor/page/keymap';",
        "export { terminalCells } from './cellTable';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', '..', 'lib', 'page'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'editorOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageEditor>(
    `${built.outputFiles[0].text};editorOfTheApp`,
  );
}

export async function mountEditor(
  editor: JSHandle<PageEditor>,
  text: string,
  textWidth: number,
  wrapping: boolean,
  blanks = false,
  numbers = false,
): Promise<void> {
  await editor.evaluate(
    async (app, shown) => {
      const old = document.querySelector('.editor-probe');
      const oldEditor = old?.querySelector('.cm-editor');
      if (oldEditor instanceof HTMLElement) {
        app.EditorView.findFromDOM(oldEditor)?.destroy();
      }
      old?.remove();
      const box = document.createElement('div');
      box.className = 'editor-probe';
      box.style.cssText = `position: fixed; left: 0; top: 0; width: ${shown.textWidth}px; z-index: 10`;
      document.body.append(box);
      const table = await app.terminalCells();
      const view = new app.EditorView({
        doc: shown.text,
        extensions: [
          app.appTextLook(table),
          app.appSelection(app.editorKeymap.rowEnd, {
            style: 'block',
            width: 2,
            blink: false,
          }),
          shown.wrapping ? app.EditorView.lineWrapping : [],
          app.blanksShown.of(shown.blanks),
          shown.numbers ? app.lineNumbers() : [],
        ],
      });
      box.append(view.dom);
      const content = view.contentDOM;
      const style = getComputedStyle(content);
      const around =
        view.dom.getBoundingClientRect().width -
        content.getBoundingClientRect().width +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight);
      box.style.width = `${shown.textWidth + around}px`;
    },
    { text, textWidth, wrapping, blanks, numbers },
  );
}
