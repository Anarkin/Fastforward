import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const appFolder = path.join(__dirname, '..', '..', '..');

suite('Webview bundle', function () {
  this.timeout(30_000);

  test('loads the grammars, the WebAssembly of the Oniguruma engine, markdown-it and DOMPurify only once a file or preview needs them', async () => {
    const {
      webviewOptions,
    }: { webviewOptions: (production: boolean) => esbuild.BuildOptions } =
      await import(
        pathToFileURL(path.join(appFolder, 'esbuild.config.mjs')).href
      );
    const { metafile } = await esbuild.build({
      ...webviewOptions(true),
      bundle: true,
      absWorkingDir: appFolder,
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const { outputs } = metafile;
    const loaded = new Set<string>();
    const load = (output: string) => {
      if (loaded.has(output)) {
        return;
      }
      loaded.add(output);
      for (const { path: imported, kind } of outputs[output].imports) {
        if (kind === 'import-statement') {
          load(imported);
        }
      }
    };
    load('dist/webview.js');
    const lazy = [
      '@shikijs/langs/',
      '@shikijs/engine-oniguruma/dist/wasm',
      'markdown-it/',
      'dompurify/',
    ];
    const bundled = (files: Iterable<string>) =>
      lazy.filter((name) =>
        [...files].some((file) =>
          Object.keys(outputs[file].inputs).some((input) =>
            input.startsWith(`node_modules/${name}`),
          ),
        ),
      );
    assert.deepStrictEqual(bundled(Object.keys(outputs)), lazy);
    assert.deepStrictEqual(bundled(loaded), []);
  });
});
