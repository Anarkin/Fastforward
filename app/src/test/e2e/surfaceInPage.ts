import type { EditorStateConfig, Extension } from '@codemirror/state';
import type { CellTable } from '../../lib/page/cellTable';
import type { EditorSurface } from '../../tools/editor/page/surface';

export interface ViewInPage {
  readonly findFromDOM: (dom: Element) => EditorSurface | null;
  readonly mounted: (
    parent: HTMLElement,
    config: EditorStateConfig,
    table: CellTable,
  ) => EditorSurface;
  readonly lineWrapping: Extension;
}

export const viewInPage = [
  "import { EditorState } from '@codemirror/state';",
  "import { EditorSurface, linesWrapped } from '../../tools/editor/page/surface';",
  'const surfaces = new WeakMap();',
  'export const EditorView = {',
  '  findFromDOM: (dom) => surfaces.get(dom) ?? null,',
  '  mounted: (parent, config, table) => {',
  '    const view = new EditorSurface(',
  '      parent,',
  '      EditorState.create(config),',
  '      table,',
  '    );',
  '    surfaces.set(view.dom, view);',
  '    return view;',
  '  },',
  '  lineWrapping: linesWrapped.of(true),',
  '};',
];
