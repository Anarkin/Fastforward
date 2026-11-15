import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { coloredText, warmsUpTheGrammar } from './syntaxFixtures';
import { policyOfPage } from '../../../helpers/pageSources';

suite('Syntax', () => {
  warmsUpTheGrammar();

  test('may run the Oniguruma engine by the page policy, as it is WebAssembly, which the tests run without the policy', () => {
    assert.ok(policyOfPage().get('script-src')?.includes("'wasm-unsafe-eval'"));
  });

  test('colors the keywords, punctuation, strings, numbers and comments of a file shown entire, leaving code in a string plain', async () => {
    assert.deepStrictEqual(
      await coloredText(
        'a.ts',
        "const a = 'x'; // note\nreturn `n${b + 1}`;\n",
      ),
      {
        '0:0': [
          'keyword const',
          'keyword =',
          "keyword '",
          'string x',
          "keyword ';",
          'comment // note',
        ],
        '0:1': [
          'keyword return',
          'keyword `',
          'string n',
          'keyword ${',
          'keyword +',
          'number 1',
          'keyword }`;',
        ],
      },
    );
  });

  test('colors the types, their declarations, uses and built-ins alike', async () => {
    assert.deepStrictEqual(
      await coloredText(
        'a.ts',
        [
          'interface A {}',
          'class B extends C implements A {}',
          'let n: Map<B, string>;',
        ].join('\n'),
      ),
      {
        '0:0': ['keyword interface', 'type A', 'keyword {}'],
        '0:1': [
          'keyword class',
          'type B',
          'keyword extends',
          'type C',
          'keyword implements',
          'type A',
          'keyword {}',
        ],
        '0:2': [
          'keyword let',
          'keyword :',
          'type Map',
          'keyword <',
          'type B',
          'keyword ,',
          'type string',
          'keyword >;',
        ],
      },
    );
  });

  test('colors the functions where declared and where called', async () => {
    assert.deepStrictEqual(
      await coloredText(
        'a.ts',
        'function f(a) { return a.trim() + parseInt(a); }',
      ),
      {
        '0:0': [
          'keyword function',
          'function f',
          'keyword (',
          'keyword )',
          'keyword {',
          'keyword return',
          'keyword .',
          'function trim',
          'keyword ()',
          'keyword +',
          'function parseInt',
          'keyword (',
          'keyword );',
          'keyword }',
        ],
      },
    );
  });

  test('leaves the keys of YAML plain, as those of JSON, coloring their values', async () => {
    const lines = await coloredText(
      'settings.yaml',
      'name: Fastforward\nscripts:\n  build: esbuild app\n',
    );
    const tokens = Object.values(lines).flat();
    assert.deepStrictEqual(
      tokens.filter((token) =>
        ['name', 'scripts', 'build'].includes(
          token.split(' ').slice(1).join(' '),
        ),
      ),
      [],
    );
    assert.ok(tokens.includes('string Fastforward'), JSON.stringify(lines));
    assert.ok(tokens.includes('string esbuild app'), JSON.stringify(lines));
  });

  test('leaves the keys of JSON plain, quotes and all', async () => {
    assert.deepStrictEqual(
      await coloredText(
        'settings.json',
        '{ "solo": false, "size": "12px\\n", "count": 2 }',
      ),
      {
        '0:0': [
          'keyword {',
          'keyword :',
          'keyword false,',
          'keyword :',
          'keyword "',
          'string 12px',
          'keyword \\n",',
          'keyword :',
          'number 2',
          'keyword }',
        ],
      },
    );
  });

  test('colors code in Markdown as a string, backticks and all, inline as VS Code does, and indented', async () => {
    assert.deepStrictEqual(
      await coloredText(
        'a.md',
        '# Run `src/<path>` in a [link](x)\n\n    let a = 1;\n',
      ),
      {
        '0:0': [
          'keyword #',
          'string `src/<path>`',
          'keyword [',
          'string link',
          'keyword ](',
          'keyword )',
        ],
        '0:1': [],
        '0:2': ['string     let a = 1;'],
      },
    );
  });
});
