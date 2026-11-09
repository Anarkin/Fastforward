import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..');

interface ModuleFileMatcher {
  readonly patterns: readonly string[];
}

interface FileMatchers {
  readonly excludedExts: string;
  getNodeModuleFileMatcher(
    appDir: string,
    destination: string,
    macroExpander: (text: string) => string,
    platformOptions: object,
    packager: object,
  ): ModuleFileMatcher;
  FileMatcher: new (
    from: string,
    to: string,
    macroExpander: (text: string) => string,
    patterns: readonly string[],
  ) => object;
}

interface NodeModuleCopyHelpers {
  NodeModuleCopyHelper: new (
    matcher: object,
    packager: object,
  ) => {
    collectNodeModules(
      module: { readonly dir: string; readonly name: string },
      excludedExtensions: readonly string[],
      destination: string,
    ): Promise<string[]>;
  };
}

const unexpanded = (text: string) => text;

async function packedFilesOf(moduleFolder: string): Promise<string[]> {
  const load = createRequire(__filename);
  const builderLib = path.join(appFolder, 'node_modules', 'app-builder-lib');
  const matchers: FileMatchers = load(
    path.join(builderLib, 'out', 'fileMatcher.js'),
  );
  const { NodeModuleCopyHelper }: NodeModuleCopyHelpers = load(
    path.join(builderLib, 'out', 'util', 'NodeModuleCopyHelper.js'),
  );
  const { build } = JSON.parse(
    fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
  );
  const platformKeys: Partial<Record<NodeJS.Platform, string>> = {
    win32: 'win',
    darwin: 'mac',
  };
  const platformOptions = build[platformKeys[process.platform] ?? 'linux'];
  const packager = {
    config: build,
    debugLogger: { isEnabled: false },
    appInfo: { type: 'module' },
    getWorkspaceRoot: () => Promise.resolve(appFolder),
  };
  const { patterns } = matchers.getNodeModuleFileMatcher(
    appFolder,
    'app',
    unexpanded,
    platformOptions,
    packager,
  );
  const name = path
    .relative(path.join(appFolder, 'node_modules'), moduleFolder)
    .replaceAll('\\', '/');
  const destination = path.join('node_modules', name);
  const helper = new NodeModuleCopyHelper(
    new matchers.FileMatcher(moduleFolder, destination, unexpanded, patterns),
    packager,
  );
  return helper.collectNodeModules(
    { dir: moduleFolder, name },
    [
      '.o',
      '.obj',
      ...matchers.excludedExts.split(',').map((extension) => `.${extension}`),
      '.pdb',
      ...(process.platform === 'win32' ? [] : ['.dll', '.exe']),
    ],
    destination,
  );
}

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

  test('loads the grammars, the WebAssembly of the Oniguruma engine, markdown-it, DOMPurify, Mermaid, xterm.js and PDF.js only once a file, preview or terminal needs them', async () => {
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
      '@xterm/xterm/lib/',
      '@xterm/addon-fit/',
      '@xterm/addon-webgl/',
      '@xterm/addon-unicode-graphemes/',
      'pdfjs-dist/',
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

  test('leaves node-pty out of the bundle, unpacked from the asar and not rebuilt, as Electron loads its native modules and runs its helpers only from files on disk, and its prebuilt modules need no rebuild', async () => {
    const { outputs } = (await releaseBuild('mainOptions')).metafile;
    assert.deepStrictEqual(
      Object.values(outputs).flatMap((output) =>
        Object.keys(output.inputs).filter((input) =>
          input.startsWith('node_modules/node-pty/'),
        ),
      ),
      [],
    );
    assert.ok(
      outputs['dist/ptyHost.js'].imports.some(
        (imported) => imported.path === 'node-pty' && imported.external,
      ),
    );
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.ok(build.asarUnpack.includes('node_modules/node-pty/**'));
    assert.strictEqual(build.npmRebuild, false);
  });

  test('bundles the git starter, the commit reader and the counter of folder sizes next to the main bundle, importing only modules of Node, as they are read from the asar and run from their text in a worker thread, where nothing else can be loaded, the counter loading koffi from where it is unpacked', async () => {
    const { outputs } = (await releaseBuild('mainOptions')).metafile;
    for (const file of [
      'dist/gitSpawner.js',
      'dist/commitReader.js',
      'dist/sizeWorker.js',
    ]) {
      const worker = outputs[file];
      assert.ok(worker, file);
      assert.deepStrictEqual(
        worker.imports.filter(
          (imported) =>
            !imported.external || !imported.path.startsWith('node:'),
        ),
        [],
        file,
      );
    }
  });

  test('copies and moves files only in a process of its own, bundled next to the main bundle and importing only modules of Node, the main bundle holding none of it, so a copy stuck on a share or a crash in it holds up neither the window nor its folders', async () => {
    const { outputs } = (await releaseBuild('mainOptions')).metafile;
    const engine = 'src/tools/commander/main/transfer.ts';
    const host = outputs['dist/transferHost.js'];
    assert.ok(host);
    assert.deepStrictEqual(
      host.imports.filter(
        (imported) => !imported.external || !imported.path.startsWith('node:'),
      ),
      [],
    );
    assert.ok(Object.keys(host.inputs).includes(engine));
    assert.ok(!Object.keys(outputs['dist/main.js'].inputs).includes(engine));
  });

  test('leaves koffi out of the bundle and unpacked from the asar with the native module of each platform, which it looks for next to itself', async () => {
    const { outputs } = (await releaseBuild('mainOptions')).metafile;
    assert.deepStrictEqual(
      Object.values(outputs).flatMap((output) =>
        Object.keys(output.inputs).filter((input) =>
          /^node_modules\/(?:koffi|@koromix)\//.test(input),
        ),
      ),
      [],
    );
    assert.ok(
      outputs['dist/main.js'].imports.some(
        (imported) => imported.path === 'koffi' && imported.external,
      ),
    );
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.deepStrictEqual(build.asarUnpack, [
      'node_modules/node-pty/**',
      'node_modules/koffi/**',
      'node_modules/@koromix/**',
    ]);
  });

  test('packs every file koffi loads, leaving out only its sources, as an installed build could not load it otherwise, and the commander listed no folder', async () => {
    const modules = path.join(appFolder, 'node_modules');
    const required: string[] = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          "require('koffi'); process.stdout.write(JSON.stringify(Object.keys(require.cache)))",
        ],
        { cwd: appFolder, encoding: 'utf8' },
      ),
    );
    const loaded = required.filter((file) =>
      file.startsWith(modules + path.sep),
    );
    const folders = new Set(
      loaded.map((file) => {
        const [scope, name] = path.relative(modules, file).split(path.sep);
        return path.join(modules, scope, scope.startsWith('@') ? name : '');
      }),
    );
    assert.deepStrictEqual(
      [...folders].map((folder) => path.relative(modules, folder)).toSorted(),
      [
        'koffi',
        path.join('@koromix', `koffi-${process.platform}-${process.arch}`),
      ].toSorted(),
    );
    const packed = new Set(
      (await Promise.all([...folders].map(packedFilesOf))).flat(),
    );
    assert.deepStrictEqual(
      loaded.filter((file) => !packed.has(file)),
      [],
    );
    assert.ok(
      ![...packed].some((file) => /\.(?:cc|hh|inc|def|S|asm)$/.test(file)),
    );
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

  test('loads the app only from an asar whose header matches the hash electron-builder writes into the executable on Windows and into Info.plist on macOS, as only loading from the asar still ran an asar edited in the folder of a per-user install', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.strictEqual(
      build.electronFuses.enableEmbeddedAsarIntegrityValidation,
      true,
    );
    assert.notStrictEqual(build.disableAsarIntegrity, true);
  });

  test('turns off the privileges Electron grants pages of file URLs beyond what a browser does, as the app serves its pages from a scheme of its own, so none needs them, and a page of a file URL would read other files through them', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.strictEqual(
      build.electronFuses.grantFileProtocolExtraPrivileges,
      false,
    );
  });
});
