import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { EditorConfig } from '../../../../tools/commander/main/editorConfig';
import { textDefaultsOf } from '../../../../tools/commander/main/textDefaults';
import type { EditorSettings } from '../../../../shell/shared/editorSettings';
import type { LineEnding } from '../../../../tools/commander/shared/textMarks';

const settings: EditorSettings = {
  endOfLine: 'lf',
  charset: 'utf-8',
  indentStyle: 'space',
  indentSize: 4,
  files: [{ extensions: ['bat', 'cmd'], endOfLine: 'crlf' }],
};

function sources(config: Omit<EditorConfig, 'files'> = {}, git?: LineEnding) {
  const asked: string[] = [];
  return {
    asked,
    sources: {
      settings,
      editorConfig: () => Promise.resolve({ ...config, files: [] }),
      gitEnding: (file: string) => {
        asked.push(file);
        return Promise.resolve(git);
      },
    },
  };
}

async function charsetOf(config: Omit<EditorConfig, 'files'>) {
  const { encoding, bom } = await textDefaultsOf(
    'a.txt',
    true,
    sources(config).sources,
  );
  return [encoding, bom];
}

const defaultsOf = (config: Omit<EditorConfig, 'files'>) =>
  textDefaultsOf('a.ts', false, sources(config).sources);

suite('What a file edited gets', () => {
  test('ends the lines of a new file as its .editorconfig says, else as git would check it out, else as the settings say for its extension and then for every file', async () => {
    const fromConfig = sources({ endOfLine: 'cr' }, 'crlf');
    assert.strictEqual(
      (await textDefaultsOf('a.txt', true, fromConfig.sources)).ending,
      'cr',
    );
    assert.deepStrictEqual(fromConfig.asked, []);
    assert.strictEqual(
      (await textDefaultsOf('a.txt', true, sources({}, 'crlf').sources)).ending,
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
    const asked = sources({}, 'crlf');
    await textDefaultsOf('a.txt', false, asked.sources);
    assert.deepStrictEqual(asked.asked, []);
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
    assert.deepStrictEqual(await defaultsOf({ indentStyle: 'tab' }), {
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
