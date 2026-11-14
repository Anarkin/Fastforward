import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { PromptPopup } from '../../../../shell/page/promptPopup';
import { renderIn } from '../../../helpers/componentFixtures';
import { noop } from '../../../helpers/fixtures';

const prompted = (secret?: boolean) =>
  renderToStaticMarkup(
    <PromptPopup
      title="Password"
      message="a.zip is encrypted."
      label="Password"
      confirm="Open"
      problemOf={() => undefined}
      {...(secret !== undefined && { secret })}
      onConfirm={noop}
      onCancel={noop}
    />,
  );

const noted = (initial: string) =>
  renderToStaticMarkup(
    <PromptPopup
      title="Mark"
      label="Pattern"
      confirm="Mark"
      initial={initial}
      problemOf={(value) => (value === 'bad' ? 'Not that.' : undefined)}
      noteOf={(value) => `Matches ${value.length} items`}
      onConfirm={noop}
      onCancel={noop}
    />,
  );

suite('Prompt popup', () => {
  test('notes under its field what the value typed would do, as how many files a pattern matches, unless something is wrong with it', () => {
    assert.match(
      noted('*.jpg'),
      /<div class="prompt-note">Matches 5 items<\/div>/,
    );
    assert.doesNotMatch(noted('bad'), /prompt-note/);
  });

  test('hides what is typed when it asks for a secret, as a password, and shows it otherwise', () => {
    assert.match(prompted(true), /<input class="prompt-input" type="password"/);
    assert.match(prompted(), /<input class="prompt-input" type="text"/);
  });

  test('names what it asks about on lines of their own above its field, wrapping, rather than in a sentence cut short with an ellipsis', () => {
    const html = renderToStaticMarkup(
      <PromptPopup
        title="New Folder"
        lines={[{ label: 'In', name: 'C:\\work' }]}
        label="Name"
        confirm="Make"
        problemOf={() => undefined}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    assert.match(
      html,
      /<form class="confirm-body"><div class="name-lines"><span class="name-label">In<\/span><span class="name-value"><code class="name"><span>C:\\<\/span><span>work<\/span><\/code><\/span><\/div><input class="prompt-input"/,
    );
    assert.doesNotMatch(html, /prompt-message/);
  });

  test('starts from the value it is given, with the part of it asked for selected, as a name to rename before its extension', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
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
        renderIn(
          root,
          <PromptPopup
            title="Rename"
            message="Rename report.pdf"
            label="Name"
            confirm="Rename"
            problemOf={() => undefined}
            initial="report.pdf"
            selectedUpTo={6}
            onConfirm={noop}
            onCancel={noop}
          />,
        );
      });
      const field = dom.window.document.querySelector('input');
      assert.ok(field !== null);
      assert.deepStrictEqual(
        [
          field.value,
          field.selectionStart,
          field.selectionEnd,
          dom.window.document.activeElement === field,
        ],
        ['report.pdf', 0, 6, true],
      );
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
