import * as assert from 'node:assert';
import { toggleComment } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { suite, test } from 'vitest';
import {
  bracketsClosed,
  colorsOf,
  extensionsOf,
  settingsKept,
  stateOf,
} from '../../../../../tools/editor/page/setup';
import { blanksShown } from '../../../../../tools/editor/page/text';
import type { TextShown } from '../../../../../tools/editor/shared/protocol';
import { plainCells } from '../../../../../lib/page/cellTable';
import { defaultScrolling } from '../../../../../lib/page/scrollSettings';
import { defaultCursorLook } from '../../../../../lib/shared/cursorSettings';
import { noop } from '../../../../helpers/fixtures';

const shown = (text: string, version: number): TextShown => ({
  text,
  version,
  encoding: 'utf-8',
  bom: false,
  ending: 'lf',
  strayEndings: [],
  keptBytes: [],
});

function commented(state: EditorState): string {
  let done = state;
  toggleComment({
    state,
    dispatch: (transaction) => {
      done = transaction.state;
    },
  });
  return done.doc.toString();
}

suite('The state of the editor', () => {
  test('keeps the wrapping, the whitespace, the closing of brackets and the language chosen since the editor was made once the main process sends new text, as reopening in another encoding, reading again and a change on disk do', () => {
    const wrapping = new Compartment();
    const blanking = new Compartment();
    const closing = new Compartment();
    const coloring = new Compartment();
    const extensions = extensionsOf({
      table: plainCells,
      readOnly: false,
      wrapping,
      wordWrap: false,
      blanking,
      showWhitespace: false,
      closing,
      closesBrackets: false,
      coloring,
      colors: colorsOf('typescript', false),
      keys: {
        save: noop,
        find: noop,
        replace: noop,
        goToLine: noop,
        close: noop,
      },
      scrolling: () => defaultScrolling,
      cursor: defaultCursorLook,
      onUpdate: noop,
    });
    const chosen = stateOf(shown('one', 0), undefined, extensions).update({
      effects: [
        wrapping.reconfigure(EditorView.lineWrapping),
        blanking.reconfigure(blanksShown.of(true)),
        closing.reconfigure(bracketsClosed),
        coloring.reconfigure(colorsOf('python', false)),
      ],
    }).state;

    const next = settingsKept(
      stateOf(shown('two', 1), undefined, extensions),
      chosen,
      [wrapping, blanking, closing, coloring],
    );

    assert.strictEqual(next.doc.toString(), 'two');
    assert.strictEqual(wrapping.get(next), EditorView.lineWrapping);
    assert.strictEqual(next.facet(blanksShown), true);
    assert.strictEqual(closing.get(next), bracketsClosed);
    assert.strictEqual(commented(next), '# two');
  });
});
