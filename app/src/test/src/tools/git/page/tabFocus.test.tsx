import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef, useState } from 'react';
import { suite, test } from 'vitest';
import { focusBack } from '../../../../../lib/page/keptFocus';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { useTabFocus } from '../../../../../tools/git/page/tabFocus';
import { noop } from '../../../../helpers/fixtures';
import { mounted } from '../../../../helpers/mounted';

function Tab({ fallen }: { readonly fallen: string[] }) {
  const [scope, setScope] = useState<string | undefined>('one');
  const container = useRef<HTMLDivElement>(null);
  useTabFocus({
    container,
    scope,
    focusPart: (kept) =>
      container.current !== null && focusBack(container.current, kept),
    fallback: () => fallen.push(scope ?? ''),
  });
  return (
    <div ref={container}>
      <div data-focus-name="list" tabIndex={0} />
      {scope === 'one' && (
        <input
          data-focus-name="find"
          defaultValue="adam"
          ref={(input) => {
            if (input !== null && fallen.length > 0) {
              input.focus();
              input.setSelectionRange(4, 4);
            }
          }}
        />
      )}
      {['one', 'two', undefined].map((shown) => (
        <button
          key={shown ?? ''}
          data-shows={shown ?? ''}
          onClick={() => setScope(shown)}
        />
      ))}
    </div>
  );
}

function Late() {
  const [drawn, setDrawn] = useState(false);
  return (
    <>
      <button data-draws="" onClick={() => setDrawn(true)} />
      {drawn && <input data-focus-name="find" defaultValue="eve" />}
    </>
  );
}

function Waiting() {
  const container = useRef<HTMLDivElement>(null);
  useTabFocus({
    container,
    scope: 'one',
    focusPart: (kept) =>
      container.current !== null && focusBack(container.current, kept),
    fallback: noop,
  });
  return (
    <div ref={container}>
      <Late />
    </div>
  );
}

suite('The focus of a git tab', () => {
  test('gives the keyboard back to the part that had it once that part is drawn, though only a part inside the tab draws anew, so the tab need not draw anew each time its content does', async () => {
    const store = createGitStore(noop);
    store
      .getState()
      .keepFocus('one', { name: 'find', selection: [1, 2, 'forward'] });
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      Element: dom.window.Element,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await act(async () => {
        root.render(
          <GitStore value={store}>
            <Waiting />
          </GitStore>,
        );
      });
      await act(async () => {
        main.querySelector<HTMLElement>('[data-draws]')?.click();
      });
      const find = main.querySelector('input');
      assert.ok(
        dom.window.document.activeElement === find,
        'the find with the keyboard',
      );
      assert.deepStrictEqual(
        [find?.selectionStart, find?.selectionEnd],
        [1, 2],
      );
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('gives the part that had the keyboard in a tab, with its caret, back to it once shown again, through another tab shown, though a box drawn anew takes the keyboard with another caret first, and steals the keyboard for none it had not', async () => {
    const fallen: string[] = [];
    await mounted(
      <GitStore value={createGitStore(noop)}>
        <Tab fallen={fallen} />
      </GitStore>,
      (main, window) => {
        const show = (scope: string | undefined) =>
          main
            .querySelector<HTMLElement>(`[data-shows="${scope ?? ''}"]`)
            ?.click();
        const find = () => main.querySelector('input');
        const list = main.querySelector<HTMLElement>('[data-focus-name]');
        act(() => find()?.focus());
        act(() => {
          find()?.setSelectionRange(1, 3, 'backward');
          find()?.dispatchEvent(
            new window.KeyboardEvent('keyup', { bubbles: true }),
          );
        });
        act(() => find()?.blur());
        fallen.push('drawn');
        act(() => show('two'));
        assert.strictEqual(window.document.activeElement, window.document.body);
        act(() => list?.focus());
        act(() => list?.blur());
        act(() => show(undefined));
        act(() => show('one'));
        const back = find();
        assert.strictEqual(window.document.activeElement, back);
        assert.deepStrictEqual(
          [back?.selectionStart, back?.selectionEnd, back?.selectionDirection],
          [1, 3, 'backward'],
        );
        act(() => show('two'));
        assert.strictEqual(window.document.activeElement, list);
      },
    );
    assert.deepStrictEqual(fallen, ['drawn']);
  });
});
