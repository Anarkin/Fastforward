import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { tools } from '../shell/shared/tools';
import { defaultSettings } from './helpers/fixtures';

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

function usesOf(file: string): string[] {
  const workers = [...read(file).matchAll(/new URL\('(\w+)\.js'/g)].flatMap(
    ([, name]) =>
      sourceFiles.filter(
        (worker) => path.posix.basename(worker).replace(/\.tsx?$/, '') === name,
      ),
  );
  return [...importsOf(file).flatMap(sourceFilesOf), ...workers];
}

function partOf(file: string): string | undefined {
  return /^(?:boot|shell|tools\/[^/]+)/.exec(file)?.[0];
}

function doorsOf(tool: string): boolean[] {
  return [
    sourceFiles.includes(`tools/${tool}/main/tool.ts`) &&
      importsOf('boot/main.ts').includes(`tools/${tool}/main/tool`),
    sourceFiles.includes(`tools/${tool}/page/tool.tsx`) &&
      importsOf('shell/page/tools.tsx').includes(`tools/${tool}/page/tool`),
  ];
}

const registries = ['shell/shared/tools.ts', 'shell/page/tools.tsx'];

suite('Architecture', () => {
  test('keeps each source file in the folder of its part, the library, the shell or a tool, by where it runs, or in boot', () => {
    const placed =
      /^(?:(?:lib|shell|tools\/[^/]+)\/(?:main|page|shared)\/.+|boot\/[^/]+)$/;
    assert.deepStrictEqual(
      sourceFiles.filter((file) => !placed.test(file)),
      [],
    );
  });

  test('gives each tool two doors, main/tool.ts, which boot builds, and page/tool.tsx, which the registry of the page shows', () => {
    assert.deepStrictEqual(
      Object.fromEntries(tools.map((tool) => [tool, doorsOf(tool)])),
      Object.fromEntries(tools.map((tool) => [tool, [true, true]])),
    );
  });

  test('lets nothing import boot, which builds every part', () => {
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
    const parts = ['lib', 'shell', ...tools.map((tool) => `tools/${tool}`)];
    assert.deepStrictEqual(
      Object.fromEntries(
        parts.map((part) => [
          part,
          fs.readdirSync(path.join(source, part)).toSorted(),
        ]),
      ),
      Object.fromEntries(
        parts.map((part) => [part, ['main', 'page', 'shared']]),
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

  test('keeps in the library only what several parts use, directly or through other library code, as what one part alone uses belongs to it', () => {
    const parts = new Map<string, Set<string>>();
    for (const file of sourceFiles) {
      const part = partOf(file);
      if (part === undefined) {
        continue;
      }
      const seen = new Set<string>();
      const pending = usesOf(file).filter((target) =>
        target.startsWith('lib/'),
      );
      for (
        let target = pending.pop();
        target !== undefined;
        target = pending.pop()
      ) {
        if (!seen.has(target)) {
          seen.add(target);
          parts.set(target, (parts.get(target) ?? new Set()).add(part));
          pending.push(
            ...usesOf(target).filter((next) => next.startsWith('lib/')),
          );
        }
      }
    }
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) => file.startsWith('lib/') && (parts.get(file)?.size ?? 0) < 2,
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

  test('keeps in a shared folder only what both the main process and the page import, directly or through other shared code, as what one side alone imports belongs in the main or the page folder of its part', () => {
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

  test("keeps the styles of the shell and of each tool in a sheet of their own, each tool's loaded by its page after the shell's, a long sheet split into partial sheets beside it that it alone imports, in the order of its rules", () => {
    const sheets = ['shell/page', ...tools.map((tool) => `tools/${tool}/page`)];
    const partialsOf = (folder: string) =>
      [
        ...read(`${folder}/style.css`).matchAll(/^@import '\.\/([^']+)';$/gm),
      ].map(([, partial]) => `${folder}/${partial}`);
    assert.deepStrictEqual(
      sourceFiles.filter((file) => file.endsWith('.css')).toSorted(),
      sheets
        .flatMap((folder) => [`${folder}/style.css`, ...partialsOf(folder)])
        .toSorted(),
    );
    assert.deepStrictEqual(
      sheets
        .filter((folder) => partialsOf(folder).length > 0)
        .flatMap((folder) =>
          read(`${folder}/style.css`)
            .split('\n')
            .filter(
              (line) => line.trim() !== '' && !line.startsWith('@import '),
            ),
        ),
      [],
    );
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) =>
          /\.tsx?$/.test(file) &&
          [...read(file).matchAll(/^import '(\.[^']+\.css)';$/gm)].some(
            ([, sheet]) => sheet !== './style.css',
          ),
      ),
      [],
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

  test('keeps the tests of <path> of the app in test/<path>, of src and of scripts, and the tests of the build, of the app end to end and of its performance, and the helpers they share, each in a folder of their own, build, e2e, perf and helpers', () => {
    const grouped = ['build', 'e2e', 'perf', 'helpers'];
    assert.deepStrictEqual(
      testFiles.filter((file) => {
        const folder = path.posix.dirname(file);
        const [top] = folder.split('/');
        return folder === '.'
          ? !['architecture.test.ts', 'setup.ts'].includes(file)
          : grouped.includes(top)
            ? folder !== top
            : !['src', 'scripts'].includes(top) || !mirrored(folder, appFolder);
      }),
      [],
    );
  });

  test('makes the stores of the page with zustand only in the store.ts of the page of the shell and of each tool, one in each, so contexts never stack', () => {
    assert.deepStrictEqual(
      sourceFiles
        .map((file) => ({
          file,
          stores: [...read(file).matchAll(/\bcreateStore\b(?:<[^>]*>)?\(/g)]
            .length,
        }))
        .filter(({ stores }) => stores > 0)
        .filter(
          ({ file, stores }) =>
            stores > 1 ||
            !/^(?:shell|tools\/[^/]+)\/page\/store\.ts$/.test(file),
        ),
      [],
    );
  });

  test('lets boot alone import 7-Zip, so the commander reaches archives only through a reader of its own, which another could replace', () => {
    assert.deepStrictEqual(
      sourceFiles.filter((file) =>
        importsOf(file).includes('tools/commander/main/sevenZip'),
      ),
      ['boot/main.ts'],
    );
  });

  test('loads node-pty only in ptyHost, the utility process of the shells, so a crash in its native code or a flood of output can neither stop nor slow the window and the other tools', () => {
    assert.deepStrictEqual(
      sourceFiles.filter((file) => /['"]node-pty['"]/.test(read(file))),
      ['tools/terminal/main/ptyHost.ts'],
    );
  });

  test('keeps every sheet of styles within 800 lines, as the linter holds the code to and reads no styles', () => {
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) =>
          file.endsWith('.css') &&
          read(file).trimEnd().split('\n').length > 800,
      ),
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
