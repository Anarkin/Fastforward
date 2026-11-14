import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { tools } from '../shell/shared/tools';
import { defaultSettings } from './support/fixtures';

const source = path.join(__dirname, '..');
const appFolder = path.join(source, '..');

const testFiles = fs
  .readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => /\.tsx?$/.test(file));

function mirrored(folder: string, under: string): boolean {
  return ['', '.ts', '.tsx'].some((extension) =>
    fs.existsSync(path.join(under, `${folder}${extension}`)),
  );
}

const sourceFiles = fs
  .readdirSync(source, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll('\\', '/'))
  .filter(
    (file) =>
      !file.startsWith('test/') && /\.(ts|tsx|css|html|json)$/.test(file),
  );

function importsOf(file: string): string[] {
  const text = fs.readFileSync(path.join(source, file), 'utf8');
  return [...text.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(([, spec]) =>
    path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)),
  );
}

function read(file: string): string {
  return fs.readFileSync(path.join(source, file), 'utf8');
}

function toolOf(file: string): string | undefined {
  return /^tools\/([^/]+)\//.exec(file)?.[1];
}

function sourceFilesOf(target: string): string[] {
  return [target, `${target}.ts`, `${target}.tsx`].filter((file) =>
    sourceFiles.includes(file),
  );
}

function reachedFrom(roots: readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>();
  const visit = (file: string): void => {
    if (reached.has(file)) {
      return;
    }
    reached.add(file);
    for (const target of importsOf(file).flatMap(sourceFilesOf)) {
      visit(target);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return reached;
}

const registries = ['shell/shared/tools.ts', 'shell/page/tools.tsx'];

suite('Architecture', () => {
  test('keeps each source file in the folder of its owner, the library, the shell or a tool, by where it runs, or in boot', () => {
    const placed =
      /^(?:(?:lib|shell|tools\/[^/]+)\/(?:main|page|shared)\/.+|boot\/[^/]+)$/;
    assert.deepStrictEqual(
      sourceFiles.filter((file) => !placed.test(file)),
      [],
    );
  });

  test('lets nothing import boot, which builds every owner', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => !file.startsWith('boot/'))
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => target.startsWith('boot/'))
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
  });

  test('gives each tool a folder of its own, and no folder to anything else', () => {
    assert.deepStrictEqual(
      fs.readdirSync(path.join(source, 'tools')).toSorted(),
      [...tools].toSorted(),
    );
  });

  test('gives the library, the shell and each tool a main, a page and a shared folder, and nothing else', () => {
    const owners = ['lib', 'shell', ...tools.map((tool) => `tools/${tool}`)];
    assert.deepStrictEqual(
      Object.fromEntries(
        owners.map((owner) => [
          owner,
          fs.readdirSync(path.join(source, owner)).toSorted(),
        ]),
      ),
      Object.fromEntries(
        owners.map((owner) => [owner, ['main', 'page', 'shared']]),
      ),
    );
  });

  test('lets no tool import another', () => {
    assert.deepStrictEqual(
      sourceFiles.flatMap((file) => {
        const own = toolOf(file);
        return own === undefined
          ? []
          : importsOf(file)
              .filter((target) => ![undefined, own].includes(toolOf(target)))
              .map((target) => `${file} -> ${target}`);
      }),
      [],
    );
  });

  test('lets the library import nothing from boot, the shell or the tools, as every one of them builds on it', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => file.startsWith('lib/'))
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => !target.startsWith('lib/'))
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
  });

  test('lets the shell reach the tools only through its registries, as the app starts them', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => file.startsWith('shell/'))
        .filter((file) => !registries.includes(file))
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => toolOf(target) !== undefined)
            .map((target) => `${file} -> ${target}`),
        ),
      [],
    );
  });

  test('keeps in a shared folder only what both the main process and the page import, directly or through other shared code, as what one side alone imports belongs in the main or the page folder of its owner', () => {
    const sides = {
      main: /^(?:boot|(?:lib|shell|tools\/[^/]+)\/main)\//,
      page: /^(?:lib|shell|tools\/[^/]+)\/page\//,
    };
    const shared = sourceFiles.filter((file) =>
      /^(?:lib|shell|tools\/[^/]+)\/shared\//.test(file),
    );
    assert.deepStrictEqual(
      Object.fromEntries(
        Object.entries(sides).map(([side, pattern]) => {
          const reached = reachedFrom(
            sourceFiles.filter((file) => pattern.test(file)),
          );
          return [side, shared.filter((file) => !reached.has(file))];
        }),
      ),
      { main: [], page: [] },
    );
  });

  test('keeps the stores out of the library, which holds no state', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => file.startsWith('lib/'))
        .filter(
          (file) =>
            /from 'zustand[/']/.test(read(file)) ||
            importsOf(file).some((target) => target.endsWith('/store')),
        ),
      [],
    );
  });

  test('makes a context only to hand out the store of the shell or of a tool, so the library makes none, as it holds no state', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => read(file).includes('createContext'))
        .toSorted(),
      [
        'shell/page/store.ts',
        'tools/commander/page/store.ts',
        'tools/git/page/store.ts',
      ],
    );
  });

  test("keeps the styles of the shell and of each tool in a sheet of their own, each tool's loaded by its page after the shell's", () => {
    assert.deepStrictEqual(
      sourceFiles.filter((file) => file.endsWith('.css')).toSorted(),
      [
        'shell/page/style.css',
        ...tools.map((tool) => `tools/${tool}/page/style.css`),
      ].toSorted(),
    );
    assert.ok(read('shell/page/main.tsx').startsWith("import './style.css';"));
    assert.deepStrictEqual(
      tools.filter(
        (tool) =>
          !read(`tools/${tool}/page/tool.tsx`).includes(
            "import './style.css';",
          ),
      ),
      [],
    );
  });

  test('keeps the tests of src/<path> in test/<path> and those of scripts/<path> in test/scripts/<path>, the tests of the running app, the build and the performance, and the helpers they share, each in a folder of their own, app, build, perf and support', () => {
    const grouped = ['app', 'build', 'perf', 'support'];
    assert.deepStrictEqual(
      testFiles.filter((file) => {
        const folder = path.posix.dirname(file);
        const [top] = folder.split('/');
        return folder === '.'
          ? !['architecture.test.ts', 'setup.ts'].includes(file)
          : grouped.includes(top)
            ? folder !== top
            : top === 'scripts'
              ? !mirrored(folder, appFolder)
              : !mirrored(folder, source);
      }),
      [],
    );
  });

  test('keeps the settings of each tool under tools, by its id', () => {
    const settings = defaultSettings();
    assert.deepStrictEqual(
      Object.keys(settings.tools).toSorted(),
      [...tools].toSorted(),
    );
    assert.deepStrictEqual(
      tools.filter((tool) => Object.hasOwn(settings, tool)),
      [],
    );
  });
});
