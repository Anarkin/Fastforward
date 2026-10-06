import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../shared/strings';

function keysOf(value: object, at: readonly string[] = []): string[][] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) =>
    typeof child === 'object' && child !== null
      ? keysOf(child, [...at, key])
      : [[...at, key]],
  );
}

const escaped = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

suite('Strings', () => {
  test('uses every string, so none is translated for nothing', () => {
    const source = path.join(__dirname, '../../src');
    const own = path.join('shared', 'strings.ts');
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
});
