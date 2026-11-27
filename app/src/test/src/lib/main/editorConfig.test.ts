import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  editorConfigOf,
  fileTabSizeOf,
} from '../../../../lib/main/editorConfig';

const root = path.resolve('/work');
const at = (...parts: string[]) => path.join(root, ...parts);

function reading(files: Readonly<Record<string, string>>) {
  return (file: string) => Promise.resolve(files[file]);
}

suite('EditorConfig', () => {
  test('takes the properties of the sections that match the file, a later section over an earlier one and a file closer to it over one further, up to the one that says it is the root, naming the file each came from', async () => {
    const config = await editorConfigOf(
      at('src', 'app', 'main.ts'),
      reading({
        [at('.editorconfig')]: '[*]\nend_of_line = crlf\n',
        [at('src', '.editorconfig')]: [
          'root = true',
          '[*]',
          'indent_style = space',
          'indent_size = 2',
          'end_of_line = lf',
          'charset = utf-8',
          '[*.ts]',
          'indent_size = 4',
          '[*.md]',
          'trim_trailing_whitespace = false',
        ].join('\n'),
        [at('src', 'app', '.editorconfig')]:
          '; a comment\n[main.ts]\ninsert_final_newline = true\n',
      }),
    );
    assert.deepStrictEqual(config, {
      endOfLine: 'lf',
      charset: 'utf-8',
      indentStyle: 'space',
      indentSize: 4,
      insertFinalNewline: true,
      files: [at('src', 'app', '.editorconfig'), at('src', '.editorconfig')],
      setIn: {
        endOfLine: at('src', '.editorconfig'),
        charset: at('src', '.editorconfig'),
        indentStyle: at('src', '.editorconfig'),
        indentSize: at('src', '.editorconfig'),
      },
    });
  });

  test('leaves out the values it does not know, and has nothing to say where no file is', async () => {
    assert.deepStrictEqual(
      await editorConfigOf(
        at('a.txt'),
        reading({
          [at('.editorconfig')]:
            '[*]\nend_of_line = unix\nindent_size = big\ncharset = utf-8-bom\nindent_style = tab\ntab_width = 8\n',
        }),
      ),
      {
        charset: 'utf-8-bom',
        indentStyle: 'tab',
        tabWidth: 8,
        files: [at('.editorconfig')],
        setIn: {
          charset: at('.editorconfig'),
          indentStyle: at('.editorconfig'),
          tabWidth: at('.editorconfig'),
        },
      },
    );
    assert.deepStrictEqual(await editorConfigOf(at('a.txt'), reading({})), {
      files: [],
      setIn: {},
    });
  });

  test('says which file sets the line ending and the charset, the one closest to the file, and none once a closer one unsets it', async () => {
    const config = await editorConfigOf(
      at('src', 'a.txt'),
      reading({
        [at('.editorconfig')]: '[*]\nend_of_line = crlf\ncharset = latin1\n',
        [at('src', '.editorconfig')]:
          '[*.txt]\nend_of_line = lf\ncharset = unset\n',
      }),
    );
    assert.strictEqual(config.endOfLine, 'lf');
    assert.strictEqual(config.charset, undefined);
    assert.deepStrictEqual(config.setIn, {
      endOfLine: at('src', '.editorconfig'),
    });
  });

  test('draws a tab as wide as tab_width, else as indent_size, as the EditorConfig spec defaults one to the other, naming the file each comes from, and leaves it to the settings once indent_size is tab with no tab_width, as tab tells no width', async () => {
    const tabOf = async (content: string) =>
      fileTabSizeOf(
        await editorConfigOf(
          at('a.txt'),
          reading({ [at('.editorconfig')]: content }),
        ),
      );
    assert.deepStrictEqual(
      [
        await tabOf('[*]\nindent_size = 2\n'),
        await tabOf('[*]\nindent_size = 2\ntab_width = 8\n'),
        await tabOf('[*]\nindent_style = tab\nindent_size = tab\n'),
        await tabOf('[*]\nindent_size = tab\ntab_width = 8\n'),
        await tabOf('[*]\nindent_style = tab\n'),
      ],
      [
        { size: 2, key: 'indent_size', file: at('.editorconfig') },
        { size: 8, key: 'tab_width', file: at('.editorconfig') },
        undefined,
        { size: 8, key: 'tab_width', file: at('.editorconfig') },
        undefined,
      ],
    );
  });

  test('draws a tab as wide as indent_size once a file closer to it unsets tab_width, naming the file indent_size comes from', async () => {
    assert.deepStrictEqual(
      fileTabSizeOf(
        await editorConfigOf(
          at('src', 'a.go'),
          reading({
            [at('.editorconfig')]: '[*]\nindent_size = 4\ntab_width = 8\n',
            [at('src', '.editorconfig')]: '[*.go]\ntab_width = unset\n',
          }),
        ),
      ),
      { size: 4, key: 'indent_size', file: at('.editorconfig') },
    );
  });
});
