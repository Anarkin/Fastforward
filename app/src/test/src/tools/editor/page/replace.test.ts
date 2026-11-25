import * as assert from 'node:assert';
import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { plainCells } from '../../../../../lib/page/cellTable';
import {
  plainSearch,
  type SearchOptions,
} from '../../../../../lib/shared/searchOptions';
import {
  currentFound,
  editorFind,
  replace,
  replaceAll,
  setFind,
} from '../../../../../tools/editor/page/find';
import { EditorSurface } from '../../../../../tools/editor/page/surface';

const editing = (
  doc: string,
  text: string,
  {
    options = {},
    readOnly = false,
    at = 0,
  }: {
    readonly options?: Partial<SearchOptions>;
    readonly readOnly?: boolean;
    readonly at?: number;
  } = {},
) => {
  const { window } = new JSDOM('<!doctype html><main></main>');
  const main = window.document.querySelector('main');
  assert.ok(main);
  const view = new EditorSurface(
    main,
    EditorState.create({
      doc,
      selection: EditorSelection.single(at),
      extensions: [history(), editorFind, EditorState.readOnly.of(readOnly)],
    }),
    plainCells,
  );
  view.dispatch({
    effects: setFind.of({ text, options: { ...plainSearch, ...options } }),
  });
  return view;
};

const textOf = (view: EditorSurface) => view.state.doc.toString();

const selectedOf = (view: EditorSurface) => {
  const { from, to } = view.state.selection.main;
  return [from, to];
};

const undone = (view: EditorSurface) => {
  undo({
    state: view.state,
    dispatch: (transaction) => view.dispatch(transaction),
  });
};

suite('Replacing in the editor', () => {
  beforeEach(() => {
    Reflect.set(globalThis, 'devicePixelRatio', 1);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  });

  test('replaces the match the find is at alone and goes on to the next, as Replace and Enter in its box do', () => {
    const view = editing('one two one three one', 'one');
    view.dispatch({ selection: EditorSelection.single(8, 11) });
    replace(view, 'ONE');
    assert.deepStrictEqual(
      [textOf(view), selectedOf(view)],
      ['one two ONE three one', [18, 21]],
    );
    assert.strictEqual(
      view.state.sliceDoc(...selectedOf(view)),
      'one',
      'the next match selected',
    );
  });

  test('goes to a match first, changing nothing, while the find is at none, so Replace never changes text the find did not show', () => {
    const view = editing('one two one', 'one', { at: 4 });
    replace(view, 'ONE');
    assert.deepStrictEqual(
      [textOf(view), selectedOf(view)],
      ['one two one', [8, 11]],
    );
  });

  test('goes on past the text it put in when that holds what is searched, rather than matching it again', () => {
    const view = editing('a b a', 'a');
    view.dispatch({ selection: EditorSelection.single(0, 1) });
    replace(view, 'aa');
    assert.deepStrictEqual(
      [textOf(view), selectedOf(view)],
      ['aa b a', [5, 6]],
    );
  });

  test('deletes the matches when the replacement is empty', () => {
    const view = editing('x-y-z', '-');
    replaceAll(view, '');
    assert.strictEqual(textOf(view), 'xyz');
  });

  test('replaces every match at once, the groups of a regular expression put in for each, and says how many it replaced', () => {
    const view = editing('a+b c+d', String.raw`(\w)\+(\w)`, {
      options: { regex: true },
    });
    assert.strictEqual(replaceAll(view, '$2-$1'), 2);
    assert.strictEqual(textOf(view), 'b-a d-c');
  });

  test('replaces in the case it finds in, and whole words only when told to', () => {
    const anyCase = editing('Cat cat CAT category', 'cat');
    replaceAll(anyCase, 'dog');
    assert.strictEqual(textOf(anyCase), 'dog dog dog dogegory');
    const whole = editing('Cat cat CAT category', 'cat', {
      options: { caseSensitive: true, wholeWord: true },
    });
    replaceAll(whole, 'dog');
    assert.strictEqual(textOf(whole), 'Cat dog CAT category');
  });

  test('takes every replacement back with one Ctrl+Z, as one change', () => {
    const view = editing('one two one three one', 'one');
    replaceAll(view, 'ONE');
    assert.strictEqual(textOf(view), 'ONE two ONE three ONE');
    undone(view);
    assert.strictEqual(textOf(view), 'one two one three one');
  });

  test('takes one replacement back with Ctrl+Z, the others kept', () => {
    const view = editing('one one', 'one');
    view.dispatch({ selection: EditorSelection.single(0, 3) });
    replace(view, 'ONE');
    replace(view, 'ONE');
    assert.strictEqual(textOf(view), 'ONE ONE');
    undone(view);
    assert.strictEqual(textOf(view), 'ONE one');
  });

  test('replaces every match of a file however many there are, past the ten thousand the find counts, rather than the first ten thousand alone', () => {
    const view = editing('x\n'.repeat(12_000), 'x');
    assert.strictEqual(replaceAll(view, 'y'), 12_000);
    assert.strictEqual(textOf(view), 'y\n'.repeat(12_000));
  });

  test('changes nothing in a file opened read-only, as typing and pasting change nothing there', () => {
    const view = editing('one two one', 'one', { readOnly: true });
    view.dispatch({ selection: EditorSelection.single(0, 3) });
    replace(view, 'ONE');
    assert.strictEqual(replaceAll(view, 'ONE'), 0);
    assert.strictEqual(textOf(view), 'one two one');
    assert.ok(currentFound(view.state) !== undefined);
  });
});
