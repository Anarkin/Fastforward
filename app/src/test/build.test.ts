import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..');

type Options = (production: boolean) => esbuild.BuildOptions;

type Built = esbuild.BuildResult<{ write: false; metafile: true }>;

const releaseBuilds = new Map<string, Promise<Built>>();

function releaseBuild(
  options: 'mainOptions' | 'webviewOptions',
): Promise<Built> {
  let built = releaseBuilds.get(options);
  if (built === undefined) {
    built = import(
      pathToFileURL(path.join(appFolder, 'esbuild.config.mts')).href
    ).then((config: Record<typeof options, Options>) =>
      esbuild.build({
        ...config[options](true),
        absWorkingDir: appFolder,
        write: false,
        metafile: true,
        logLevel: 'silent',
      }),
    );
    releaseBuilds.set(options, built);
  }
  return built;
}

function outputOf(built: Built, file: string): string {
  const output = built.outputFiles.find(
    (each) => each.path === path.join(appFolder, file),
  );
  assert.ok(output, file);
  return output.text;
}

suite('Release build', { timeout: 30_000 }, () => {
  test('keeps the names of functions and their lines, as the stack traces in Fastforward.log are read without source maps', async () => {
    const [main, webview] = await Promise.all([
      releaseBuild('mainOptions'),
      releaseBuild('webviewOptions'),
    ]);
    assert.ok(
      outputOf(main, 'dist/main.js').includes('\nfunction watchesRecursively('),
      'main.js',
    );
    assert.ok(
      outputOf(webview, 'dist/webview.js').includes('\nfunction App('),
      'webview.js',
    );
  });

  test('loads the grammars, the WebAssembly of the Oniguruma engine, markdown-it, DOMPurify and Mermaid only once a file or preview needs them', async () => {
    const { outputs } = (await releaseBuild('webviewOptions')).metafile;
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
      'mermaid/',
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

  test('turns off running the app as Node, NODE_OPTIONS and the inspector flags, and loads it only from its asar, as anything able to start it could run code in it through them', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      {
        runAsNode: build.electronFuses.runAsNode,
        enableNodeOptionsEnvironmentVariable:
          build.electronFuses.enableNodeOptionsEnvironmentVariable,
        enableNodeCliInspectArguments:
          build.electronFuses.enableNodeCliInspectArguments,
        onlyLoadAppFromAsar: build.electronFuses.onlyLoadAppFromAsar,
      },
      {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
      },
    );
  });
});
