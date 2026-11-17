import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import {
  folderTools,
  tools,
  type ToolId,
} from '../../../../shell/shared/tools';
import type { ContextMenuItem } from '../../../../lib/page/contextMenuItem';
import {
  editsImage,
  fileMenuItems,
  type Copied,
  type MenuTarget,
} from '../../../../lib/page/fileMenu';
import type { FolderCommand } from '../../../../lib/shared/folderCommands';

type Chosen =
  | { readonly folder: FolderCommand; readonly name: string | undefined }
  | { readonly archive: string }
  | { readonly copy: Copied; readonly names: readonly string[] }
  | { readonly view: string }
  | { readonly compare: true }
  | { readonly edit: string }
  | { readonly system: readonly string[] };

function menuOf(
  target: MenuTarget,
  windows = true,
  inArchive = false,
  gitMissing = false,
  compares = true,
) {
  const chosen: Chosen[] = [];
  const items = fileMenuItems(
    target,
    {
      onFolder: (command, name) => chosen.push({ folder: command, name }),
      onEnterArchive: (name) => chosen.push({ archive: name }),
      onCopy: (copied, names) => chosen.push({ copy: copied, names }),
      onView: (name) => chosen.push({ view: name }),
      ...(compares && { onCompare: () => chosen.push({ compare: true }) }),
      onEdit: (name) => chosen.push({ edit: name }),
      onSystemMenu: windows
        ? (names) => chosen.push({ system: names })
        : undefined,
    },
    { inArchive, gitMissing },
  );
  const choose = (label: string) => {
    const item = items.find(
      (each) => !('separator' in each) && each.label === label,
    );
    assert.ok(item !== undefined && !('separator' in item), label);
    item.onClick?.();
  };
  return { items, chosen, choose };
}

const menuInArchive = (target: MenuTarget) => menuOf(target, false, true);

const labels = (items: readonly ContextMenuItem[]) =>
  items.map((item) => ('separator' in item ? '-' : item.label));

const offered = (items: readonly ContextMenuItem[]) =>
  items.flatMap((item) =>
    'separator' in item || item.disabled === true ? [] : [item.label],
  );

const isTool = (icon: string | undefined): icon is ToolId =>
  tools.some((tool) => tool === icon);

const toolsOf = (items: readonly ContextMenuItem[]): ToolId[] =>
  items.flatMap((item) =>
    'separator' in item || item.disabled === true || !isTool(item.icon)
      ? []
      : [item.icon],
  );

const folderShown = (inRepository: boolean): MenuTarget => ({
  kind: 'folder',
  inRepository,
});

const docs = (inRepository: boolean): MenuTarget => ({
  kind: 'folder',
  name: 'docs',
  inRepository,
});

const copyOne = [strings.commander.copyPath];
const copyMany = [strings.commander.copyPaths];

suite('File menu', () => {
  const { commander } = strings;
  const all = [
    commander.openWithTerminal,
    commander.openWithCommander,
    commander.openWithSevenZip,
    commander.openWithGit,
    commander.cloneWithGit,
    commander.initWithGit,
    commander.openWithViewer,
    commander.openWithDiff,
    commander.openWithEditor,
    commander.openWithPaint,
    '-',
    commander.copyPath,
    '-',
    commander.showMoreOptions,
  ];
  const image = { kind: 'file', name: 'photo.png', image: true } as const;
  const text = { kind: 'file', name: 'notes.txt', image: false } as const;
  const marked = { kind: 'items', names: ['docs', 'notes.txt'] } as const;

  test('shows every item it has on every folder, file and set of marked items, wherever it opens, those that do not apply there disabled and doing nothing, so the menu always shows all it can do', () => {
    for (const items of [
      menuOf(docs(false)).items,
      menuOf(docs(true), false, false, true).items,
      menuOf(folderShown(true)).items,
      menuOf(image, false).items,
      menuInArchive(image).items,
    ]) {
      assert.deepStrictEqual(labels(items), all);
      for (const item of items) {
        if (!('separator' in item) && item.disabled === true) {
          assert.strictEqual(item.onClick, undefined, item.label);
        }
      }
    }
    assert.deepStrictEqual(
      labels(menuOf(marked).items),
      all.map((label) =>
        label === commander.copyPath ? commander.copyPaths : label,
      ),
    );
  });

  test('offers a folder a terminal and the commander in it, and git to open it when it is in a repository, or to clone into it or init one in it when it is not, never making a repository inside another, the menu of Windows last', () => {
    assert.deepStrictEqual(offered(menuOf(docs(false)).items), [
      commander.openWithTerminal,
      commander.openWithCommander,
      commander.cloneWithGit,
      commander.initWithGit,
      ...copyOne,
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(offered(menuOf(docs(true)).items), [
      commander.openWithTerminal,
      commander.openWithCommander,
      commander.openWithGit,
      ...copyOne,
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(toolsOf(menuOf(docs(false)).items), [
      'terminal',
      'commander',
      'git',
      'git',
    ]);
  });

  test('offers a folder no git while git is missing, whether it is in a repository or not', () => {
    for (const target of [docs(false), docs(true), folderShown(true)]) {
      const { items } = menuOf(target, true, false, true);
      assert.deepStrictEqual(toolsOf(items), ['terminal', 'commander']);
      assert.deepStrictEqual(offered(items), [
        commander.openWithTerminal,
        commander.openWithCommander,
        ...copyOne,
        commander.showMoreOptions,
      ]);
    }
  });

  test('asks for each command on the folder the menu is on, naming none for the folder shown', () => {
    const named = menuOf(docs(true));
    named.choose(commander.openWithTerminal);
    named.choose(commander.openWithCommander);
    named.choose(commander.openWithGit);
    const shown = menuOf(folderShown(false));
    shown.choose(commander.cloneWithGit);
    shown.choose(commander.initWithGit);

    assert.deepStrictEqual(
      [...named.chosen, ...shown.chosen],
      [
        { folder: 'newTerminal', name: 'docs' },
        { folder: 'openInCommander', name: 'docs' },
        { folder: 'openInGit', name: 'docs' },
        { folder: 'cloneHere', name: undefined },
        { folder: 'initHere', name: undefined },
      ],
    );
  });

  test('offers a file to open with the viewer, the diff, the editor and 7-Zip, by its name, and an image with Paint too, which does nothing yet, as Paint is still to come, and no SVG, and marked items with the diff', () => {
    const menu = menuOf(image);
    assert.deepStrictEqual(offered(menu.items), [
      commander.openWithSevenZip,
      commander.openWithViewer,
      commander.openWithDiff,
      commander.openWithEditor,
      commander.openWithPaint,
      ...copyOne,
      commander.showMoreOptions,
    ]);
    const paint = menu.items.find(
      (item) =>
        !('separator' in item) && item.label === commander.openWithPaint,
    );
    assert.ok(paint !== undefined && !('separator' in paint));
    assert.strictEqual(paint.onClick, undefined);
    menu.choose(commander.openWithViewer);
    menu.choose(commander.openWithDiff);
    menu.choose(commander.openWithEditor);
    menu.choose(commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [
      { view: 'photo.png' },
      { compare: true },
      { edit: 'photo.png' },
      { archive: 'photo.png' },
    ]);
    assert.deepStrictEqual(offered(menuOf(text, false).items), [
      commander.openWithSevenZip,
      commander.openWithViewer,
      commander.openWithDiff,
      commander.openWithEditor,
      ...copyOne,
    ]);
    assert.deepStrictEqual(offered(menuOf(marked, false).items), [
      commander.openWithDiff,
      ...copyMany,
    ]);
    assert.deepStrictEqual(
      ['photo.png', 'logo.svg', 'notes.txt'].map(editsImage),
      [true, false, false],
    );
  });

  test('shows the menu of Windows for what the menu is on, the folder shown by no name, and only it for other items', () => {
    const chosen = [folderShown(false), docs(false), image, marked].flatMap(
      (target) => {
        const menu = menuOf(target);
        menu.choose(commander.showMoreOptions);
        return menu.chosen;
      },
    );

    assert.deepStrictEqual(chosen, [
      { system: [] },
      { system: ['docs'] },
      { system: ['photo.png'] },
      { system: ['docs', 'notes.txt'] },
    ]);
    const more = menuOf({ kind: 'items', names: ['notes.txt'] }).items.at(-1);
    assert.ok(more !== undefined && !('separator' in more));
    assert.deepStrictEqual(
      [more.label, more.title],
      ['...', commander.showMoreOptionsTitle],
    );
  });

  test('leaves the diff disabled where nothing compares files, as outside the commander', () => {
    for (const target of [image, marked]) {
      assert.ok(
        !offered(menuOf(target, false, false, false, false).items).includes(
          commander.openWithDiff,
        ),
      );
    }
  });

  test('leaves the menu of Windows disabled where there is none', () => {
    assert.deepStrictEqual(offered(menuOf(docs(false), false).items), [
      commander.openWithTerminal,
      commander.openWithCommander,
      commander.cloneWithGit,
      commander.initWithGit,
      ...copyOne,
    ]);
  });

  test('copies the paths of what the menu is on as text, the folder shown by no name', () => {
    const chosen = [folderShown(false), docs(false), image, marked].flatMap(
      (target) => {
        const menu = menuOf(target);
        menu.choose(
          target.kind === 'items' ? commander.copyPaths : commander.copyPath,
        );
        return menu.chosen;
      },
    );
    assert.deepStrictEqual(chosen, [
      { copy: 'paths', names: [] },
      { copy: 'paths', names: ['docs'] },
      { copy: 'paths', names: ['photo.png'] },
      { copy: 'paths', names: ['docs', 'notes.txt'] },
    ]);
  });

  test('offers inside an archive to open one of its files with the viewer, the diff, the editor and 7-Zip, and to copy paths, no tools on its folders and no Paint', () => {
    const menu = menuInArchive(image);
    assert.deepStrictEqual(offered(menu.items), [
      commander.openWithSevenZip,
      commander.openWithViewer,
      commander.openWithDiff,
      commander.openWithEditor,
      ...copyOne,
    ]);
    menu.choose(commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [{ archive: 'photo.png' }]);
    assert.deepStrictEqual(
      [folderShown(false), docs(true), marked].map((target) =>
        offered(menuInArchive(target).items),
      ),
      [copyOne, copyOne, [commander.openWithDiff, ...copyMany]],
    );
  });

  test('offers on a folder every tool of the + menu, the commander it is in too, made local to the folder, so a tool added there is offered here too', () => {
    const offeredTools = new Set(
      [false, true].flatMap((inRepository) =>
        toolsOf(menuOf(docs(inRepository)).items),
      ),
    );

    assert.deepStrictEqual(
      folderTools.filter((tool) => offeredTools.has(tool)),
      [...folderTools],
    );
  });
});
