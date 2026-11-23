import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { toolSections, tools } from '../shell/shared/tools';
import { shortcutEntries } from '../shell/page/toolShortcuts';
import { defaultSettings } from './helpers/fixtures';
import { programsOfSuffixes } from './helpers/programs';
import { componentStates } from './helpers/componentStates';
import { seededFromStore, statesIn } from './helpers/stateScan';
import {
  source,
  appFolder,
  testFiles,
  mirrored,
  sourceFiles,
  importsOf,
  read,
  toolOf,
  components,
  sourceAndHelperFiles,
  filesAmong,
  reachedFrom,
  usesOf,
  partOf,
} from './helpers/sourceGraph';

function doorsOf(tool: string): boolean[] {
  return [
    sourceFiles.includes(`tools/${tool}/main/tool.ts`) &&
      sourceFiles
        .filter((file) => file.startsWith('boot/'))
        .some((file) => importsOf(file).includes(`tools/${tool}/main/tool`)),
    sourceFiles.includes(`tools/${tool}/page/tool.tsx`) &&
      importsOf('shell/page/tools.tsx').includes(`tools/${tool}/page/tool`),
  ];
}

const registries = [
  'shell/shared/tools.ts',
  'shell/page/tools.tsx',
  'shell/page/toolShortcuts.ts',
];

function exportsOtherThanComponents(file: string): number {
  const text = read(file);
  return [
    ...text.matchAll(
      /^export (?:async )?(function|const|let|class|enum) ([A-Za-z_$][\w$]*)/gm,
    ),
  ].filter(
    ([, kind, name = '']) =>
      !/^[A-Z]/.test(name) ||
      (kind === 'class' &&
        !new RegExp(
          `class ${name}\\b[^{]*\\bextends (?:React\\.)?(?:Pure)?Component\\b`,
        ).test(text)),
  ).length;
}

function countedOver(
  files: readonly string[],
  count: (file: string) => number,
): Record<string, number> {
  return Object.fromEntries(
    files
      .map((file) => [file, count(file)] as const)
      .filter(([, counted]) => counted > 0),
  );
}

function partialsOf(folder: string): string[] {
  return [
    ...read(`${folder}/style.css`).matchAll(/^@import '\.\/([^']+)';$/gm),
  ].map(([, partial]) => `${folder}/${partial}`);
}

suite('Architecture', () => {
  test('holds in a component, by useState or useReducer, only a state helpers/componentStates.ts lists, a state a tab shown again may lose, as everything that outlives the component lives in the store, so a state added later is weighed before it lands', () => {
    const held = sourceFiles
      .filter((file) =>
        /^(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/page\/.+\.tsx?$/.test(
          file,
        ),
      )
      .flatMap((file) => statesIn(read(file)).map((name) => `${file} ${name}`));
    assert.deepStrictEqual(
      held.toSorted(),
      Object.keys(componentStates).toSorted(),
    );
  });

  test('says of each state a component holds which kind it is, a measure, a moment, a trigger or made once, and why a tab shown again may lose it', () => {
    assert.deepStrictEqual(
      Object.entries(componentStates).filter(
        ([, why]) =>
          !/^(?:a measure|a moment|a trigger|made once): \S/.test(why),
      ),
      [],
    );
  });

  test('seeds no state a component holds from a store, as what outlives the component lives in the store and is read there, a restore reading it through the restore hook', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) =>
          /^(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/page\/.+\.tsx?$/.test(
            file,
          ),
        )
        .flatMap((file) =>
          seededFromStore(read(file)).map((name) => `${file} ${name}`),
        ),
      [],
    );
  });

  test('keeps each source file in the folder of its part, the library, the shell, a tool or a component, by where it runs, or in boot', () => {
    const placed =
      /^(?:(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/(?:main|page|shared)\/.+|boot\/[^/]+)$/;
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

  test('gives each component a page folder, and a main or a shared one only where it runs there, and nothing else', () => {
    assert.deepStrictEqual(
      components.flatMap((component) =>
        fs
          .readdirSync(path.join(source, 'components', component))
          .filter((folder) => !['main', 'page', 'shared'].includes(folder))
          .map((folder) => `components/${component}/${folder}`)
          .concat(
            fs.existsSync(path.join(source, 'components', component, 'page'))
              ? []
              : [`components/${component} has no page`],
          ),
      ),
      [],
    );
  });

  test('names no file of the shell, a tool or a component after the part, as its folder names it already, but the files that run the git program', () => {
    const gitProgram = new Set([
      'gitCommand',
      'gitDir',
      'gitDirPaths',
      'gitEnding',
      'gitLocator',
      'gitOutput',
      'gitProcesses',
      'gitSpawner',
      'gitSpawnerWorker',
    ]);
    assert.deepStrictEqual(
      sourceFiles.filter((file) => {
        const parts = file.split('/');
        const [kind] = parts;
        const owner =
          kind === 'shell'
            ? 'shell'
            : kind === 'tools' || kind === 'components'
              ? parts[1]
              : undefined;
        const stem = (parts.at(-1) ?? '').replace(/\..*$/, '');
        return (
          owner !== undefined &&
          stem.startsWith(owner) &&
          /^[A-Z]/.test(stem.slice(owner.length)) &&
          !gitProgram.has(stem)
        );
      }),
      [],
    );
  });

  test('names no file kept, as what a tab keeps is its view, held by its store', () => {
    assert.deepStrictEqual(
      fs
        .readdirSync(source, { recursive: true, encoding: 'utf8' })
        .filter((file) => /^kept|Kept/.test(path.basename(file))),
      [],
    );
  });

  test('gives each tool the files every tool has, by the same names: main/tool.ts, page/tool.tsx, page/store.ts, page/keymap.ts and shared/protocol.ts, and page/state.ts and page/tabView.ts but the terminal, whose screens the main process keeps', () => {
    const skeleton = [
      'main/tool.ts',
      'page/tool.tsx',
      'page/store.ts',
      'page/keymap.ts',
      'shared/protocol.ts',
    ];
    const ofTabs = ['page/state.ts', 'page/tabView.ts'];
    assert.deepStrictEqual(
      tools.flatMap((tool) =>
        [...skeleton, ...(tool === 'terminal' ? [] : ofTabs)]
          .filter(
            (file) => !fs.existsSync(path.join(source, 'tools', tool, file)),
          )
          .map((file) => `tools/${tool}/${file}`),
      ),
      [],
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

  test('lets the library import nothing from boot, the shell, the tools or the components, as every one of them builds on it', () => {
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
      main: /^(?:boot|(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/main)\//,
      page: /^(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/page\//,
    };
    const shared = sourceFiles.filter((file) =>
      /^(?:lib|shell|tools\/[^/]+|components\/[^/]+)\/shared\//.test(file),
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

  test('keeps the stores out of the library, which holds no state, and out of the components, which make no store but read the one their host hands them', () => {
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
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => file.startsWith('components/'))
        .filter(
          (file) =>
            /\bcreateStore\b|from 'zustand\/|\bcreateContext\b/.test(
              read(file),
            ) || importsOf(file).some((target) => target.endsWith('/store')),
        ),
      [],
    );
  });

  test('makes a context only to hand out the store of the shell or of a tool, so the library makes none, as it holds no state, but the two through which the shell hands its library the looks of paths, read from its store, so every path is drawn alike, and the menu of a part of a path and the following of one, so every part opens the same menu and every link the tool its path asks for', () => {
    assert.deepStrictEqual(
      sourceFiles
        .filter((file) => read(file).includes('createContext'))
        .toSorted(),
      [
        'lib/page/pathLooks.ts',
        'lib/page/pathMenu.ts',
        'shell/page/store.ts',
        'tools/commander/page/store.ts',
        'tools/diff/page/store.ts',
        'tools/editor/page/store.ts',
        'tools/git/page/store.ts',
        'tools/viewer/page/store.ts',
      ],
    );
  });

  test("keeps the styles of the shell, of each tool and of each component in a sheet of their own, each tool's loaded by its page after the shell's and each component's by its own code, a long sheet split into partial sheets beside it that it alone imports, in the order of its rules", () => {
    const sheets = [
      'shell/page',
      ...tools.map((tool) => `tools/${tool}/page`),
      ...components
        .map((component) => `components/${component}/page`)
        .filter((folder) => sourceFiles.includes(`${folder}/style.css`)),
    ];
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
    assert.deepStrictEqual(
      components.filter(
        (component) =>
          sourceFiles.includes(`components/${component}/page/style.css`) &&
          !sourceFiles.some(
            (file) =>
              file.startsWith(`components/${component}/page/`) &&
              /\.tsx?$/.test(file) &&
              read(file).includes("import './style.css';"),
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
          ? ![
              'architecture.test.ts',
              'components.test.ts',
              'lessons.test.ts',
              'shortcutsShown.test.ts',
              'setup.ts',
            ].includes(file)
          : grouped.includes(top)
            ? folder !== top
            : !['src', 'scripts'].includes(top) || !mirrored(folder, appFolder);
      }),
      [],
    );
  });

  test('names each test file <name>.test.ts, or <name>.<suffix>.test.ts by a suffix the setup knows the real program of, so a misspelt suffix lands in no project unnoticed', () => {
    const named = new RegExp(
      `^[^.]+(?:\\.(?:${Object.keys(programsOfSuffixes).join('|')}))?\\.test\\.tsx?$`,
    );
    assert.deepStrictEqual(
      testFiles.filter(
        (file) =>
          /\.test\.tsx?$/.test(file) && !named.test(path.posix.basename(file)),
      ),
      [],
    );
  });

  test('gives each suffix of the tests a project of its own in vitest.config.mts, and names each in AGENTS.md', () => {
    const suffixes = Object.keys(programsOfSuffixes).toSorted();
    const config = fs.readFileSync(
      path.join(appFolder, 'vitest.config.mts'),
      'utf8',
    );
    const agents = fs.readFileSync(
      path.join(appFolder, '..', 'AGENTS.md'),
      'utf8',
    );
    assert.deepStrictEqual(
      [
        ...new Set(
          [...config.matchAll(/\*\.([^.'/]+)\.test\.ts'/g)].map(
            ([, suffix]) => suffix,
          ),
        ),
      ].toSorted(),
      suffixes,
    );
    assert.deepStrictEqual(
      suffixes.filter((suffix) => !agents.includes(`\`.${suffix}\``)),
      [],
    );
  });

  test('writes a .tsx only for what renders, each holding JSX', () => {
    assert.deepStrictEqual(
      sourceAndHelperFiles.filter(
        (file) =>
          file.endsWith('.tsx') && !/<\/[A-Za-z]|\/>|<>/.test(read(file)),
      ),
      [],
    );
  });

  test('exports from a .tsx only its components and the types of their props, keeping functions, constants, hooks and other classes in a .ts, where they are tested without React, and a helper only its component uses beside it unexported, so what builds elements is a component and what decides is data', () => {
    assert.deepStrictEqual(
      countedOver(
        sourceAndHelperFiles.filter((file) => file.endsWith('.tsx')),
        exportsOtherThanComponents,
      ),
      {},
    );
  });

  test('lets a .ts import nothing from a .tsx, its types included, so the logic of the page never depends on a component', () => {
    assert.deepStrictEqual(
      countedOver(
        sourceAndHelperFiles.filter((file) => file.endsWith('.ts')),
        (file) =>
          importsOf(file)
            .flatMap((target) => filesAmong(sourceAndHelperFiles, target))
            .filter((target) => target.endsWith('.tsx')).length,
      ),
      {},
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
    const sevenZip = /^tools\/commander\/main\/sevenZip/;
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) =>
          !sevenZip.test(file) &&
          importsOf(file).some((imported) => sevenZip.test(imported)),
      ),
      ['boot/commanderHost.ts'],
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

  test('keeps the settings of each tool under tools, by its id, in the order the shortcuts list the tools, the viewer, the diff and the editor among them, as people know them', () => {
    const settings = defaultSettings();
    assert.deepStrictEqual(Object.keys(settings.tools), [...toolSections]);
    assert.deepStrictEqual(
      shortcutEntries.map((entry) => entry.id),
      ['everywhere', ...toolSections, 'paint'],
    );
    assert.ok(tools.every((tool) => toolSections.includes(tool)));
    assert.deepStrictEqual(
      toolSections.filter((tool) => Object.hasOwn(settings, tool)),
      [],
    );
  });

  test('matches what people type only through the two ways the app searches, the filter, which narrows a list to what holds every word anywhere, and the find, which finds a phrase in what is shown, both folding the text alike, so no list or find drifts from the others', () => {
    const matchers = ['lib/shared/filter.ts', 'lib/shared/textMatches.ts'];
    const finds = [
      ...matchers,
      'components/diff/page/find.ts',
      'tools/editor/page/find.ts',
      'tools/viewer/main/textFind.ts',
      'tools/viewer/page/markdownFind.ts',
      'tools/viewer/page/markPieces.ts',
    ];
    const code = sourceFiles.filter((file) => /\.tsx?$/.test(file));
    assert.deepStrictEqual(
      code.filter(
        (file) =>
          !matchers.includes(file) &&
          (/\bfolded\b/.test(read(file)) ||
            /toLowerCase\(\)\s*\.\s*(?:includes|indexOf|startsWith)\(/.test(
              read(file),
            )),
      ),
      [],
    );
    assert.deepStrictEqual(
      code.filter(
        (file) => !finds.includes(file) && /\bmatchesIn\b/.test(read(file)),
      ),
      [],
    );
  });

  test('draws every path and every name of a file or folder through the path component, each part as the commander lists it, so a sentence names none as a plain name and only the name module draws one', () => {
    const code = sourceFiles.filter((file) => /\.tsx?$/.test(file));
    assert.deepStrictEqual(
      [
        ...read('lib/shared/strings.ts').matchAll(
          /\bnamed\((\w*(?:file|folder|path|target|archive|root|item|repository|copy|old|changed)\w*)\)/gi,
        ),
      ].map(([found]) => found),
      [],
    );
    assert.deepStrictEqual(
      code.filter((file) => /<Name\b/.test(read(file))),
      ['lib/page/name.tsx'],
    );
    assert.deepStrictEqual(
      code.filter((file) => /\bpath-part\b/.test(read(file))),
      ['lib/page/pathLooks.ts'],
    );
  });

  test('marks what a filter found only through HighlightWords and what a find found only through the marks of the finds, in the colors of the search, so every match looks alike', () => {
    const code = sourceFiles.filter((file) => /\.tsx?$/.test(file));
    assert.deepStrictEqual(
      code.filter((file) => /<mark\b/.test(read(file))),
      ['lib/page/highlight.tsx'],
    );
    assert.deepStrictEqual(
      code.filter((file) => /\bfind-match\b/.test(read(file))),
      ['components/cells/page/cellLook.ts'],
    );
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) => file.endsWith('.css') && /\bsearch-match\b/.test(read(file)),
      ),
      [
        'shell/page/pdf.css',
        'shell/page/scrollbarMarks.css',
        'shell/page/text.css',
      ],
    );
  });

  test('draws every scrollbar by the rules of the stylesheet of the window alone, so no tool gives its own another look: no other stylesheet names a part of a scrollbar, but for the text edited taking away the one below it, which a stand-in draws; and lists the stylesheets that make something scroll, so what scrolls anew is given the scrollbar of the app on purpose, held to it by the tests of every scrollbar alike', () => {
    const styles = sourceFiles.filter((file) => file.endsWith('.css'));
    assert.deepStrictEqual(
      styles.filter((file) => read(file).includes('::-webkit-scrollbar')),
      ['shell/page/text.css', 'shell/page/window.css'],
    );
    assert.deepStrictEqual(
      read('shell/page/text.css')
        .split('}')
        .filter((rule) => rule.includes('::-webkit-scrollbar'))
        .map((rule) => rule.replace(/\s+/g, ' ').trim()),
      [
        '.editor-surface .editor-scroller::-webkit-scrollbar:horizontal { height: 0;',
      ],
    );
    assert.deepStrictEqual(
      styles.filter((file) =>
        /overflow[a-z-]*:[^;]*\b(?:auto|scroll)\b/.test(read(file)),
      ),
      [
        'shell/page/columns.css',
        'shell/page/markdown.css',
        'shell/page/menus.css',
        'shell/page/notices.css',
        'shell/page/pdf.css',
        'shell/page/rows.css',
        'shell/page/shortcuts.css',
        'shell/page/text.css',
        'tools/git/page/clone.css',
        'tools/git/page/locations.css',
        'tools/git/page/messagePeek.css',
        'tools/viewer/page/viewer.css',
      ],
    );
  });

  test('draws every box people search in with the SearchBar, so every search looks and works alike: the classes of the boxes before it are gone, and no other page code draws an input but the dialogs that ask for a text and the replace box of the editor', () => {
    const before =
      /\b(?:find-field|search-field|search-input|locations-search|menu-filter|commander-filter-input)\b/;
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) => /\.(?:tsx?|css)$/.test(file) && before.test(read(file)),
      ),
      [],
    );
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) => file.endsWith('.tsx') && /<input\b/.test(read(file)),
      ),
      [
        'lib/page/searchBar.tsx',
        'shell/page/promptPopup.tsx',
        'tools/commander/page/packPopup.tsx',
        'tools/commander/page/transferPopup.tsx',
        'tools/editor/page/findBar.tsx',
        'tools/git/page/clonePopup.tsx',
      ],
    );
    const editorFindBar = read('tools/editor/page/findBar.tsx');
    assert.strictEqual(editorFindBar.match(/<input\b/g)?.length, 1);
    assert.match(editorFindBar, /<input\s+className="editor-replace-input"/);
  });

  test('hands the options of a search, its case, whole words and regular expression, on whole as one SearchOptions, naming them one by one only where it is defined and checked, in the SearchBar that toggles them, in the matchers and the finds that match by them, and where the PDF hands them to PDF.js', () => {
    assert.deepStrictEqual(
      sourceFiles.filter(
        (file) =>
          /\.tsx?$/.test(file) &&
          file !== 'lib/shared/strings.ts' &&
          /\b(?:caseSensitive|wholeWord|regex)\b/.test(read(file)),
      ),
      [
        'lib/page/searchBar.tsx',
        'lib/shared/filter.ts',
        'lib/shared/searchOptions.ts',
        'lib/shared/textMatches.ts',
        'tools/editor/page/find.ts',
        'tools/viewer/main/textFind.ts',
        'tools/viewer/page/pdfDocument.ts',
      ],
    );
  });

  test('leaves telling keys, modifiers and buttons apart to itself, so the shortcuts screen lists every one', () => {
    const own = [
      path.join(source, 'lib', 'shared', 'keymap.ts'),
      path.join(source, 'lib', 'shared', 'strings.ts'),
    ];
    const reads =
      /\b(?:e|ev|\w*[eE]vent|input)\.(?:key|code|button|control|meta|alt|shift)\b|\b\w+\.buttons\b|\b(?:ctrlKey|metaKey|altKey|shiftKey|isComposing|keyCode)\b|'(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Enter|Escape|Tab|F\d{1,2})'/;
    const offenders = fs
      .readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !file.startsWith('test'))
      .map((file) => path.join(source, file))
      .filter((file) => !own.includes(file))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            reads.test(line)
              ? [`${path.relative(source, file)}:${index + 1}: ${line.trim()}`]
              : [],
          ),
      );
    assert.deepStrictEqual(offenders, []);
  });
});
