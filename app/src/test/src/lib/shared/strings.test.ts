import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { plainOf, strings } from '../../../../lib/shared/strings';

function keysOf(value: object, at: readonly string[] = []): string[][] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) =>
    typeof child === 'object' && child !== null
      ? keysOf(child, [...at, key])
      : [[...at, key]],
  );
}

function textsOf(value: object): string[] {
  return Object.values(value).flatMap((child: unknown) =>
    typeof child === 'object' && child !== null
      ? textsOf(child)
      : typeof child === 'string'
        ? [child]
        : [],
  );
}

const escaped = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

suite('Strings', () => {
  test('uses every string, so none is translated for nothing', () => {
    const source = path.join(__dirname, '../../../..');
    const own = path.join('lib', 'shared', 'strings.ts');
    const code = fs
      .readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter(
        (file) =>
          /\.tsx?$/.test(file) && !file.startsWith('test') && file !== own,
      )
      .map((file) => fs.readFileSync(path.join(source, file), 'utf8'))
      .join('\n');
    const used = (keys: readonly string[]) =>
      keys.some((_, end) => {
        const at = keys
          .slice(0, end + 1)
          .map(escaped)
          .join('\\.');
        return new RegExp(`\\bstrings\\.${at}(?![\\w.])`).test(code);
      });
    assert.deepStrictEqual(
      keysOf(strings)
        .filter((keys) => !used(keys))
        .map((keys) => keys.join('.')),
      [],
    );
  });

  test('keeps the names in a sentence apart from its words, joining the words between them, nesting a reason with names of its own, and quotes the names in its plain form, for the log', () => {
    const pushed = strings.messages.pushed('main', 'origin/main');
    assert.deepStrictEqual(pushed, [
      'Pushed ',
      { name: 'main' },
      ' to ',
      { name: 'origin/main' },
    ]);
    assert.strictEqual(plainOf(pushed), 'Pushed "main" to "origin/main"');
    assert.deepStrictEqual(
      strings.commander.copyFailed(
        'a.txt',
        strings.commander.archiveGone('b.zip'),
      ),
      [
        { name: 'a.txt' },
        ' could not be copied: ',
        { name: 'b.zip' },
        ' is no longer there, so it was not changed.',
      ],
    );
  });

  test('keeps a sentence without names a string, as its plain form', () => {
    assert.strictEqual(
      strings.messages.couldNotPull('It timed out.'),
      "Couldn't pull. It timed out.",
    );
    assert.strictEqual(
      strings.commander.testPassed(strings.commander.items(2)),
      '2 items passed the test.',
    );
    assert.strictEqual(plainOf('Fetched'), 'Fetched');
  });

  test('names no keys in parentheses, as they read Ctrl on macOS too, while the shortcuts screen lists the right ones', () => {
    const keys = Object.values(strings.keys).map(escaped).join('|');
    const hint = new RegExp(`\\([^)]*(?<!\\w)(?:${keys}|Cmd)(?!\\w)[^)]*\\)`);
    const texts = textsOf(strings);
    assert.ok(texts.includes(strings.actions.newTab));
    assert.deepStrictEqual(
      texts.filter((text) => hint.test(text)),
      [],
    );
  });
});
