import * as assert from 'node:assert';
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { plainCells } from '../../../../../lib/page/cellTable';
import {
  EditorSurface,
  revealed,
  revealers,
  surfaceEvents,
  surfacePlugin,
  surfaceUpdated,
  type SurfaceUpdate,
} from '../../../../../tools/editor/page/surface';

const scale = 'devicePixelRatio';

function surfaceOf(extensions: Extension, doc = 'one\ntwo') {
  const { window } = new JSDOM('<!doctype html><main></main>');
  const main = window.document.querySelector('main');
  assert.ok(main);
  const view = new EditorSurface(
    main,
    EditorState.create({ doc, extensions }),
    plainCells,
  );
  return { view, window, main };
}

const told = ({ docChanged, selectionSet, transactions }: SurfaceUpdate) =>
  `${transactions.length}:${docChanged ? 'text' : ''}${selectionSet ? 'selection' : ''}`;

suite('The surface of the text edited', () => {
  let saved: unknown;

  beforeEach(() => {
    saved = Reflect.get(globalThis, scale);
    Reflect.set(globalThis, scale, 1);
  });

  afterEach(() => {
    Reflect.set(globalThis, scale, saved);
  });

  test('makes each part the state names once, tells it of every change and what it changed, hands it back when asked, and takes it away once a change of the settings names it no longer or the state is another', () => {
    const seen: string[] = [];
    const part = (name: string) =>
      surfacePlugin(() => {
        seen.push(`${name} made`);
        return {
          name,
          update: (update: SurfaceUpdate) => {
            seen.push(`${name} ${told(update)}`);
          },
          destroy: () => {
            seen.push(`${name} gone`);
          },
        };
      });
    const first = part('first');
    const second = part('second');
    const settings = new Compartment();
    const { view } = surfaceOf([settings.of(first), second]);

    view.dispatch({ changes: { from: 0, insert: 'x' } });
    view.dispatch({ selection: { anchor: 2 } });
    assert.deepStrictEqual(
      [view.plugin(first)?.name, view.plugin(second)?.name],
      ['first', 'second'],
    );
    view.dispatch({ effects: settings.reconfigure([]) });
    assert.strictEqual(view.plugin(first), undefined);
    view.setState(EditorState.create({ doc: 'other', extensions: second }));
    view.destroy();

    assert.deepStrictEqual(seen, [
      'first made',
      'second made',
      'first 1:text',
      'second 1:text',
      'first 1:selection',
      'second 1:selection',
      'first gone',
      'second 1:',
      'second gone',
      'second made',
      'second gone',
    ]);
  });

  test('tells those listening of a change after its parts, with the text as it is then, and refuses a change a part makes while it is told of one, as the parts after it had been told of a state already gone', () => {
    const order: string[] = [];
    const changing = surfacePlugin((surface) => ({
      update: (update: SurfaceUpdate) => {
        order.push('part');
        if (update.docChanged) {
          surface.dispatch({ selection: { anchor: 0 } });
        }
      },
    }));
    const { view } = surfaceOf([
      changing,
      surfaceUpdated.of((update) => {
        order.push(`listener ${update.state.doc.toString()}`);
        if (update.docChanged) {
          update.view.dispatch({ selection: { anchor: 1 } });
        }
      }),
    ]);

    view.dispatch({ selection: { anchor: 3 } });
    assert.throws(() => view.dispatch({ changes: { from: 0, insert: 'x' } }));

    assert.deepStrictEqual(order, ['part', 'listener one\ntwo', 'part']);
  });

  test('hands an event of its text to the first that takes it, which keeps the browser from acting on it and the ones after it from seeing it, and to none while an input method composes', () => {
    const seen: string[] = [];
    const { view, window } = surfaceOf([
      surfaceEvents({
        keydown: (event) => {
          seen.push(`last ${event.key}`);
          return true;
        },
      }),
      Prec.high(
        surfaceEvents({
          keydown: (event) => {
            seen.push(`first ${event.key}`);
            return event.key === 'a';
          },
        }),
      ),
    ]);
    const pressed = (init: KeyboardEventInit) => {
      const event = new window.KeyboardEvent('keydown', {
        cancelable: true,
        ...init,
      });
      view.contentDOM.dispatchEvent(event);
      return event.defaultPrevented;
    };

    assert.deepStrictEqual(
      [
        pressed({ key: 'a' }),
        pressed({ key: 'b' }),
        pressed({ key: 'a', isComposing: true }),
        pressed({ key: 'Process' }),
      ],
      [true, true, false, false],
    );
    assert.deepStrictEqual(seen, ['first a', 'first b', 'last b']);
  });

  test('asks for the main cursor to be brought into sight after a change that says so, at the nearest edge a few pixels in, the end of a selection that moves rather than the whole of it, as a selection longer than the view scrolled back to where it began, and for a place asked for as it was asked, the first that takes it alone', () => {
    const asked: unknown[] = [];
    const { view } = surfaceOf([
      revealers.of((_, range, { x, y, xMargin, yMargin }) => {
        asked.push([
          range.empty ? range.head : `${range.anchor} to ${range.head}`,
          x,
          y,
          xMargin,
          yMargin,
        ]);
        return true;
      }),
      revealers.of(() => {
        asked.push('second');
        return true;
      }),
    ]);

    view.dispatch({ selection: { anchor: 5 }, scrollIntoView: true });
    view.dispatch({ selection: { anchor: 1 } });
    view.dispatch({ selection: { anchor: 1, head: 6 }, scrollIntoView: true });
    view.dispatch({
      effects: revealed.of({
        range: EditorSelection.cursor(4),
        x: 'nearest',
        y: 'start',
        xMargin: 5,
        yMargin: -8,
      }),
    });

    assert.deepStrictEqual(asked, [
      [5, 'nearest', 'nearest', 5, 0],
      [6, 'nearest', 'nearest', 5, 0],
      [4, 'nearest', 'start', 5, -8],
    ]);
  });

  test('takes a command that was handed its dispatch alone, as the commands of the state call it so', () => {
    const { view } = surfaceOf([]);
    const { dispatch } = view;

    dispatch(view.state.update({ changes: { from: 0, insert: 'x' } }));

    assert.strictEqual(view.state.doc.toString(), 'xone\ntwo');
    assert.throws(() =>
      dispatch(
        EditorState.create({ doc: 'other' }).update({
          selection: { anchor: 1 },
        }),
      ),
    );
  });
});
