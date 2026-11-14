import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { EditorConfig } from '../../../../../tools/commander/main/editorConfig';
import type { GitEnding } from '../../../../../tools/commander/main/gitEnding';
import {
  endingSourcesOf,
  textDefaultsOf,
} from '../../../../../tools/commander/main/textDefaults';
import type { EditorSettings } from '../../../../../shell/main/editorSettings';

const settings: EditorSettings = {
  endOfLine: 'lf',
  charset: 'utf-8',
  indentStyle: 'space',
  indentSize: 4,
  files: [{ extensions: ['bat', 'cmd'], endOfLine: 'crlf' }],
  closeBrackets: false,
};

type Config = Omit<EditorConfig, 'files' | 'setIn'> &
  Partial<Pick<EditorConfig, 'setIn'>>;

function sources(config: Config = {}, git?: GitEnding) {
  const asked: string[] = [];
  return {
    asked,
    sources: {
      settings,
      editorConfig: () => Promise.resolve({ setIn: {}, ...config, files: [] }),
      gitEnding: (file: string) => {
        asked.push(file);
        return Promise.resolve(git);
      },
    },
  };
}

async function charsetOf(config: Config) {
  const { encoding, bom } = await textDefaultsOf(
    'a.txt',
    true,
    sources(config).sources,
  );
  return [encoding, bom];
}

const defaultsOf = (config: Config) =>
  textDefaultsOf('a.ts', false, sources(config).sources);

suite('What a file edited gets', () => {
  test('ends the lines of a new file as its .editorconfig says, else as git would check it out, else as the settings say for its extension and then for every file', async () => {
    const fromConfig = sources(
      { endOfLine: 'cr' },
      { ending: 'crlf', by: 'eol' },
    );
    assert.strictEqual(
      (await textDefaultsOf('a.txt', true, fromConfig.sources)).ending,
      'cr',
    );
    assert.deepStrictEqual(fromConfig.asked, []);
    assert.strictEqual(
      (
        await textDefaultsOf(
          'a.txt',
          true,
          sources({}, { ending: 'crlf', by: 'core.autocrlf' }).sources,
        )
      ).ending,
      'crlf',
    );
    assert.strictEqual(
      (await textDefaultsOf('run.CMD', true, sources().sources)).ending,
      'crlf',
    );
    assert.strictEqual(
      (await textDefaultsOf('a.txt', true, sources().sources)).ending,
      'lf',
    );
  });

  test('asks git nothing for a file there already, as its own line endings decide', async () => {
    const asked = sources({}, { ending: 'crlf', by: 'core.eol' });
    await textDefaultsOf('a.txt', false, asked.sources);
    assert.deepStrictEqual(asked.asked, []);
  });

  test('lists every place the line ending of new lines and the charset of a new file may come from, in the order each overrides the next, set or not', async () => {
    const config = path.join('work', '.editorconfig');
    const set = sources(
      {
        endOfLine: 'cr',
        charset: 'latin1',
        setIn: { endOfLine: config, charset: config },
      },
      { ending: 'crlf', by: 'core.autocrlf' },
    ).sources;
    assert.deepStrictEqual(await endingSourcesOf('run.cmd', set), [
      { kind: 'editorConfig', ending: 'cr', file: config },
      { kind: 'git', ending: 'crlf', by: 'core.autocrlf' },
      { kind: 'extension', extension: 'cmd', ending: 'crlf' },
      { kind: 'settings', ending: 'lf' },
    ]);
    assert.deepStrictEqual(
      (await textDefaultsOf('run.cmd', true, set)).charsets,
      [
        {
          kind: 'editorConfig',
          encoding: 'windows-1252',
          bom: false,
          file: config,
        },
        { kind: 'settings', encoding: 'utf-8', bom: false },
      ],
    );
    assert.deepStrictEqual(await endingSourcesOf('notes', sources().sources), [
      { kind: 'editorConfig' },
      { kind: 'git' },
      { kind: 'extension', extension: '' },
      { kind: 'settings', ending: 'lf' },
    ]);
    assert.deepStrictEqual(
      (await textDefaultsOf('notes', true, sources().sources)).charsets,
      [
        { kind: 'editorConfig' },
        { kind: 'settings', encoding: 'utf-8', bom: false },
      ],
    );
  });

  test('writes a new file in the charset of its .editorconfig or the settings, a byte order mark for utf-8-bom and UTF-16', async () => {
    assert.deepStrictEqual(await charsetOf({}), ['utf-8', false]);
    assert.deepStrictEqual(await charsetOf({ charset: 'utf-8-bom' }), [
      'utf-8',
      true,
    ]);
    assert.deepStrictEqual(await charsetOf({ charset: 'utf-16le' }), [
      'utf-16le',
      true,
    ]);
    assert.deepStrictEqual(await charsetOf({ charset: 'latin1' }), [
      'windows-1252',
      false,
    ]);
  });

  test('indents as the .editorconfig says over what the file shows, and as the settings say where neither does', async () => {
    const { charsets: _, ...defaults } = await defaultsOf({
      indentStyle: 'tab',
    });
    assert.deepStrictEqual(defaults, {
      ending: 'lf',
      encoding: 'utf-8',
      bom: false,
      indent: '\t',
      fallbackIndent: '    ',
    });
    assert.strictEqual(
      (await defaultsOf({ indentStyle: 'space', indentSize: 2 })).indent,
      '  ',
    );
    assert.strictEqual((await defaultsOf({})).indent, undefined);
  });
});
