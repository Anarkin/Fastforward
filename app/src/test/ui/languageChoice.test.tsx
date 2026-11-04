import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useLayoutEffect, useState } from 'react';
import { suite, test } from 'vitest';
import {
  languageButtonLabel,
  languageMenu,
  shownLanguage,
  useLanguageChoice,
  type LanguageChoice,
} from '../../ui/languageChoice';
import { languages } from '../../ui/languages';
import { defaultTextView, TextViewContext } from '../../ui/textView';
import type { TextView } from '../../shell/shared/protocol';

const first = languages[0];

const labels = (menu: ReturnType<typeof languageMenu>) =>
  menu.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.label}`,
  );

interface Seen {
  readonly choice: LanguageChoice;
  readonly choose: (choice: LanguageChoice) => void;
  readonly view: TextView;
  readonly show: (file: string | undefined) => void;
}

function Probe({
  view,
  onSeen,
}: {
  view: TextView;
  onSeen: (seen: Seen) => void;
}) {
  const [file, setFile] = useState<string | undefined>('a.ts');
  const { choice, choose } = useLanguageChoice(file);
  useLayoutEffect(() => {
    onSeen({ choice, choose, view, show: setFile });
  }, [onSeen, choice, choose, view]);
  return null;
}

function Saved({ onSeen }: { onSeen: (seen: Seen) => void }) {
  const [view, change] = useState<TextView>({
    ...defaultTextView,
    highlightSyntax: false,
  });
  return (
    <TextViewContext value={{ view, change }}>
      <Probe view={view} onSeen={onSeen} />
    </TextViewContext>
  );
}

suite('The language text is colored in', () => {
  test('colors text in the language detected, in the one chosen, or in none for plain text', () => {
    assert.strictEqual(shownLanguage('auto', 'ini'), 'ini');
    assert.strictEqual(shownLanguage('auto', undefined), undefined);
    assert.strictEqual(shownLanguage('typescript', 'ini'), 'typescript');
    assert.strictEqual(shownLanguage('plain', 'typescript'), undefined);
  });

  test('labels its button with the language shown for one file, else with Auto or Plain Text, as the files shown each have their own', () => {
    assert.strictEqual(
      languageButtonLabel('auto', 'typescript', true),
      'TypeScript',
    );
    assert.strictEqual(
      languageButtonLabel('auto', undefined, true),
      'Plain Text',
    );
    assert.strictEqual(languageButtonLabel('ini', 'typescript', true), 'INI');
    assert.strictEqual(
      languageButtonLabel('plain', 'typescript', true),
      'Plain Text',
    );
    assert.strictEqual(languageButtonLabel('auto', undefined, false), 'Auto');
    assert.strictEqual(
      languageButtonLabel('plain', undefined, false),
      'Plain Text',
    );
  });

  test('names in the menu of one file the language Auto chose, then offers plain text and every language, sorted by name', () => {
    const menu = labels(languageMenu('auto', 'ini', true, () => {}));

    assert.deepStrictEqual(menu.slice(0, 4), [
      '✓ Auto: INI',
      'Plain Text',
      '-',
      first?.name,
    ]);
    assert.ok(menu.includes('TypeScript'));
    assert.ok(menu.length > 200);
    assert.deepStrictEqual(
      labels(languageMenu('plain', undefined, true, () => {})).slice(0, 2),
      ['Auto', '✓ Plain Text'],
    );
    assert.ok(
      labels(languageMenu('typescript', 'ini', true, () => {})).includes(
        '✓ TypeScript',
      ),
    );
  });

  test('offers only Auto and Plain Text in the menu of many files, as each has a language of its own', () => {
    assert.deepStrictEqual(
      labels(languageMenu('auto', undefined, false, () => {})),
      ['✓ Auto', 'Plain Text'],
    );
  });

  test('finds a language by its id and aliases too, and Auto by the language it chose only while it names it, so typing a language finds the language rather than Auto', () => {
    const menu = languageMenu('auto', 'typescript', true, () => {});
    const keywordsOf = (label: string) => {
      const item = menu.find(
        (each) => !('separator' in each) && each.label === label,
      );
      return item && !('separator' in item) ? item.keywords : undefined;
    };

    assert.strictEqual(keywordsOf('TypeScript'), 'typescript ts cts mts');
    assert.strictEqual(keywordsOf('Auto: TypeScript'), 'typescript ts cts mts');
    const unnamed = languageMenu('plain', 'typescript', true, () => {})[0];
    assert.ok(unnamed && !('separator' in unnamed));
    assert.strictEqual(unnamed.keywords, undefined);
  });

  test('chooses the language of the item clicked', () => {
    const chosen: string[] = [];
    const menu = languageMenu('auto', 'typescript', true, (choice) =>
      chosen.push(choice),
    );

    for (const item of menu.slice(0, 4)) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }

    assert.deepStrictEqual(chosen, ['auto', 'plain', first?.id]);
  });

  test('starts in Auto or Plain Text as saved, saves Auto and Plain Text when chosen, and keeps a language chosen only for the file it was chosen for', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
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
      const seen: { current?: Seen } = {};
      const onSeen = (latest: Seen) => {
        seen.current = latest;
      };
      const root = createRoot(main);
      await act(async () => root.render(<Saved onSeen={onSeen} />));
      assert.strictEqual(seen.current?.choice, 'plain');

      await act(async () => seen.current?.choose('typescript'));
      assert.strictEqual(seen.current?.choice, 'typescript');
      assert.strictEqual(seen.current?.view.highlightSyntax, false);

      await act(async () => seen.current?.show('b.ts'));
      assert.strictEqual(seen.current?.choice, 'plain');
      await act(async () => seen.current?.show('a.ts'));
      assert.strictEqual(seen.current?.choice, 'plain');

      await act(async () => seen.current?.choose('auto'));
      assert.strictEqual(seen.current?.choice, 'auto');
      assert.strictEqual(seen.current?.view.highlightSyntax, true);

      await act(async () => seen.current?.show(undefined));
      await act(async () => seen.current?.choose('typescript'));
      assert.strictEqual(seen.current?.choice, 'auto');

      await act(async () => seen.current?.choose('plain'));
      assert.strictEqual(seen.current?.choice, 'plain');
      assert.strictEqual(seen.current?.view.highlightSyntax, false);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
