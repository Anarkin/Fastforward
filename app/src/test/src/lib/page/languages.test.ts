import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { languageOf } from '../../../../lib/page/languages';

suite('Syntax', () => {
  test('knows the language of a file without an extension from its name in a Windows path too, as a viewer tab gives the whole path', () => {
    assert.strictEqual(languageOf('C:\\work\\Dockerfile'), 'docker');
    assert.strictEqual(languageOf('C:\\my.work\\Makefile'), 'make');
    assert.strictEqual(languageOf('C:\\my.work\\app.ts'), 'typescript');
  });

  test('knows the language from the file name', () => {
    assert.strictEqual(languageOf('src/app.ts'), 'typescript');
    assert.strictEqual(languageOf('esbuild.mjs'), 'javascript');
    assert.strictEqual(languageOf('legacy.cjs'), 'javascript');
    assert.strictEqual(languageOf('vitest.config.mts'), 'typescript');
    assert.strictEqual(languageOf('types.cts'), 'typescript');
    assert.strictEqual(languageOf('docs/README.md'), 'markdown');
    assert.strictEqual(languageOf('lib/Program.CS'), 'csharp');
    assert.strictEqual(languageOf('Dockerfile'), 'docker');
    assert.strictEqual(languageOf('notes.unknown'), undefined);
    assert.strictEqual(languageOf('LICENSE'), undefined);
  });

  test('knows the files of .NET, Rust, Elixir, Perl and OCaml by the extensions and names their tools give them, though shiki names no language by them', () => {
    for (const [file, language] of [
      ['build.csx', 'csharp'],
      ['Views/Home/Index.cshtml', 'razor'],
      ['script.fsx', 'fsharp'],
      ['Library.fsi', 'fsharp'],
      ['App.fsproj', 'xml'],
      ['Legacy.vbproj', 'xml'],
      ['Playground.slnx', 'xml'],
      ['Package.nuspec', 'xml'],
      ['MainWindow.xaml', 'xml'],
      ['App.axaml', 'xml'],
      ['Resources.resx', 'xml'],
      ['NuGet.Config', 'xml'],
      ['C:\\site\\web.config', 'xml'],
      ['app.config', 'xml'],
      ['packages.config', 'xml'],
      ['Cargo.lock', 'toml'],
      ['.editorconfig', 'ini'],
      ['lib/app.ex', 'elixir'],
      ['test/app_test.exs', 'elixir'],
      ['script.pl', 'perl'],
      ['Module.pm', 'perl'],
      ['main.ml', 'ocaml'],
      ['main.mli', 'ocaml'],
    ] as const) {
      assert.strictEqual(languageOf(file), language, file);
    }
    for (const file of ['settings.config', 'yarn.lock', 'go.mod']) {
      assert.strictEqual(languageOf(file), undefined, file);
    }
  });
});
