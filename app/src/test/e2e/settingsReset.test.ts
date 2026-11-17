import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { resetMark, shownReset, type SettingsAccess } from './settingsReset';

const textOf = (count: number) => `settings ${count}`;

function settings(
  shown: (written: readonly string[]) => string,
  replaced: (written: readonly string[]) => string | undefined = () =>
    undefined,
  saving: (reads: number) => boolean = () => false,
): SettingsAccess & { readonly written: string[] } {
  const written: string[] = [];
  let reads = 0;
  return {
    written,
    read: () => replaced(written) ?? written.at(-1),
    write: (text) => {
      written.push(text);
    },
    saving: () => saving(reads++),
    shown: () => Promise.resolve(shown(written)),
  };
}

const quick = { pause: 1, timeout: 200 };

suite('Settings reset for a test', () => {
  test('are written under a mark of their own and taken for reset once the page shows that mark', async () => {
    const access = settings((written) =>
      written.length > 0 ? `a font, ${resetMark(4)}` : 'a font',
    );
    assert.strictEqual(await shownReset(access, textOf, 4, quick), 4);
    assert.deepStrictEqual(access.written, ['settings 4']);
  });

  test('are written again under another mark once a save of the app under way replaces them, rather than waited for in a page that loads no more, as the app loads its pages again only for settings other than those it has', async () => {
    const access = settings(
      (written) => (written.length > 1 ? resetMark(2) : 'a font'),
      (written) => (written.length === 1 ? 'saved by the app' : undefined),
    );
    assert.strictEqual(await shownReset(access, textOf, 1, quick), 2);
    assert.deepStrictEqual(access.written, ['settings 1', 'settings 2']);
  });

  test('are not taken for reset while the page shows the mark of an earlier reset, loaded before the app read these', async () => {
    let asked = 0;
    const access = settings(() => resetMark(asked++ < 5 ? 6 : 7));
    assert.strictEqual(await shownReset(access, textOf, 7, quick), 7);
    assert.ok(asked > 5);
  });

  test('wait for a save of the app under way to end before they are written, and are written again when one is under way once the page shows them', async () => {
    const access = settings(
      (written) => resetMark(written.length),
      undefined,
      (reads) => reads < 3 || reads === 4,
    );
    assert.strictEqual(await shownReset(access, textOf, 1, quick), 2);
    assert.deepStrictEqual(access.written, ['settings 1', 'settings 2']);
  });

  test('say what they waited for once the page never shows them', async () => {
    const access = settings(() => 'a font');
    await assert.rejects(
      shownReset(access, textOf, 1, quick),
      /Timed out waiting for the page to load with the settings reset/,
    );
  });
});
