import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..');

type Options = (production: boolean) => esbuild.BuildOptions;

async function releaseOutput(
  options: 'mainOptions' | 'webviewOptions',
  file: string,
): Promise<string> {
  const config: Record<typeof options, Options> = await import(
    pathToFileURL(path.join(appFolder, 'esbuild.config.mts')).href
  );
  const { outputFiles } = await esbuild.build({
    ...config[options](true),
    absWorkingDir: appFolder,
    write: false,
    logLevel: 'silent',
  });
  const output = outputFiles.find(
    (built) => built.path === path.join(appFolder, file),
  );
  assert.ok(output, file);
  return output.text;
}

suite('Release build', { timeout: 30_000 }, () => {
  test('keeps the names of functions and their lines, as the stack traces in Fastforward.log are read without source maps', async () => {
    const main = await releaseOutput('mainOptions', 'dist/main.js');
    assert.ok(main.includes('\nfunction watchesRecursively('), 'main.js');
    const webview = await releaseOutput('webviewOptions', 'dist/webview.js');
    assert.ok(webview.includes('\nfunction App('), 'webview.js');
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
