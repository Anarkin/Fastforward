import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  editorConfigOf,
  globPattern,
} from '../../../../../tools/commander/main/editorConfig';

const root = path.resolve('/work');
const at = (...parts: string[]) => path.join(root, ...parts);

function reading(files: Readonly<Record<string, string>>) {
  return (file: string) => Promise.resolve(files[file]);
}

const matches = (glob: string, file: string) => globPattern(glob).test(file);

suite('EditorConfig', () => {
  test('matches the globs of its sections as EditorConfig does, a name without a slash in any folder and one with a slash from the folder of the file', () => {
    assert.ok(matches('*', 'src/a.ts'));
    assert.ok(matches('*.ts', 'src/deep/a.ts'));
    assert.ok(!matches('*.ts', 'src/a.tsx'));
    assert.ok(matches('{*.cmd,*.bat}', 'run.bat'));
    assert.ok(matches('src/*.ts', 'src/a.ts'));
    assert.ok(!matches('src/*.ts', 'src/deep/a.ts'));
    assert.ok(matches('src/**.ts', 'src/deep/a.ts'));
    assert.ok(matches('file?.txt', 'file1.txt'));
    assert.ok(matches('[ab].txt', 'b.txt'));
    assert.ok(!matches('[!ab].txt', 'b.txt'));
    assert.ok(matches('v{1..3}.txt', 'v2.txt'));
    assert.ok(!matches('v{1..3}.txt', 'v4.txt'));
  });

  test('takes the properties of the sections that match the file, a later section over an earlier one and a file closer to it over one further, up to the one that says it is the root', async () => {
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
        setIn: { charset: at('.editorconfig') },
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
});
