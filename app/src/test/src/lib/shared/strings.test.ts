import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';

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

const source = path.join(__dirname, '../../../..');
const own = path.join('lib', 'shared', 'strings.ts');

const codeFiles = fs
  .readdirSync(source, { recursive: true, encoding: 'utf8' })
  .filter(
    (file) => /\.tsx?$/.test(file) && !file.startsWith('test') && file !== own,
  )
  .map((file) => ({
    file: file.replaceAll('\\', '/'),
    text: fs.readFileSync(path.join(source, file), 'utf8'),
  }));

const literalOpens = String.raw`['"\x60]`;

const textsOutsideTheDictionary = [
  new RegExp(
    String.raw`\blog\??\.(?:info|warn|error)\(\s*${literalOpens}`,
    'g',
  ),
  new RegExp(
    String.raw`\bnotice\(\s*(?:(?!'(?:info|error)'\s*,)|'(?:info|error)'\s*,\s*)${literalOpens}`,
    'g',
  ),
  new RegExp(String.raw`\bmessage:\s*${literalOpens}`, 'g'),
];

suite('Strings', () => {
  test('uses every string, so none is translated for nothing', () => {
    const code = codeFiles.map(({ text }) => text).join('\n');
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

  test('takes the text of every line of the log and every notice from the dictionary, so none is left out of a translation', () => {
    assert.deepStrictEqual(
      codeFiles.flatMap(({ file, text }) =>
        textsOutsideTheDictionary.flatMap((pattern) =>
          Array.from(text.matchAll(pattern), (match) => {
            const line = text.slice(0, match.index).split('\n').length;
            return `${file}:${line}`;
          }),
        ),
      ),
      [],
    );
  });

  test('wraps no name of a sentence in quotes, as a name may hold quotes itself, leaving the quotes to plainOf where nothing can be styled', () => {
    const quotedPlaceholder = /(["'‘“])\$\{.*?\}(["'’”])/;
    assert.deepStrictEqual(
      [own, path.join('lib', 'shared', 'sentences.ts')].map((file) =>
        fs
          .readFileSync(path.join(source, file), 'utf8')
          .split('\n')
          .filter((line) => quotedPlaceholder.test(line))
          .map((line) => line.trim()),
      ),
      [[], ['const quoted = (name: string) => `"${name}"`;']],
    );
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
