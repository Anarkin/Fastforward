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
  | { readonly goTo: true }
  | { readonly system: readonly string[] };

function menuOf(
  target: MenuTarget,
  windows = true,
  inArchive = false,
  gitMissing = false,
) {
  const chosen: Chosen[] = [];
  const items = fileMenuItems(
    target,
    {
      onFolder: (command, name) => chosen.push({ folder: command, name }),
      onEnterArchive: (name) => chosen.push({ archive: name }),
      onCopy: (copied, names) => chosen.push({ copy: copied, names }),
      onGoTo: () => chosen.push({ goTo: true }),
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

const isTool = (icon: string | undefined): icon is ToolId =>
  tools.some((tool) => tool === icon);

const toolsOf = (items: readonly ContextMenuItem[]): ToolId[] =>
  items.flatMap((item) =>
    'separator' in item || !isTool(item.icon) ? [] : [item.icon],
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
  test('offers a folder a new terminal in it, and git to open it when it is in a repository, or to clone into it or init one in it when it is not, never making a repository inside another, the menu of Windows last', () => {
    assert.deepStrictEqual(labels(menuOf(docs(false)).items), [
      strings.commander.newTerminalHere,
      strings.commander.cloneHere,
      strings.commander.initHere,
      '-',
      ...copyOne,
      '-',
      strings.commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(labels(menuOf(docs(true)).items), [
      strings.commander.newTerminalHere,
      strings.commander.openInGit,
      '-',
      ...copyOne,
      '-',
      strings.commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(toolsOf(menuOf(docs(false)).items), [
      'terminal',
      'git',
      'git',
    ]);
  });

  test('offers a folder no git while git is missing, whether it is in a repository or not', () => {
    for (const target of [docs(false), docs(true), folderShown(true)]) {
      const { items } = menuOf(target, true, false, true);
      assert.deepStrictEqual(toolsOf(items), ['terminal']);
      assert.deepStrictEqual(labels(items).slice(0, 2), [
        strings.commander.newTerminalHere,
        '-',
      ]);
    }
  });

  test('asks for each command on the folder the menu is on, naming none for the folder shown', () => {
    const named = menuOf(docs(true));
    named.choose(strings.commander.newTerminalHere);
    named.choose(strings.commander.openInGit);
    const shown = menuOf(folderShown(false));
    shown.choose(strings.commander.cloneHere);
    shown.choose(strings.commander.initHere);

    assert.deepStrictEqual(
      [...named.chosen, ...shown.chosen],
      [
        { folder: 'newTerminal', name: 'docs' },
        { folder: 'openInGit', name: 'docs' },
        { folder: 'cloneHere', name: undefined },
        { folder: 'initHere', name: undefined },
      ],
    );
  });

  test('offers one image to edit, doing nothing yet, as the image editor is still to come, and no SVG', () => {
    const { items } = menuOf({ kind: 'file', name: 'photo.png', image: true });
    const [edit] = items;
    assert.deepStrictEqual(labels(items), [
      strings.commander.editImage,
      strings.commander.openWithSevenZip,
      '-',
      ...copyOne,
      '-',
      strings.commander.showMoreOptions,
    ]);
    assert.ok(edit !== undefined && !('separator' in edit));
    assert.notStrictEqual(edit.disabled, true);
    assert.strictEqual(edit.onClick, undefined);
    assert.deepStrictEqual(
      ['photo.png', 'logo.svg', 'notes.txt'].map(editsImage),
      [true, false, false],
    );
  });

  test('offers one file to try entering as an archive, whatever its name, asking for it by its name, and no items marked together', () => {
    const menu = menuOf(
      { kind: 'file', name: 'notes.txt', image: false },
      false,
    );
    assert.deepStrictEqual(labels(menu.items), [
      strings.commander.openWithSevenZip,
      '-',
      ...copyOne,
    ]);
    menu.choose(strings.commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [{ archive: 'notes.txt' }]);
    assert.deepStrictEqual(
      labels(menuOf({ kind: 'items', names: ['a.zip', 'b.zip'] }, false).items),
      copyMany,
    );
  });

  test('shows the menu of Windows for what the menu is on, the folder shown by no name, and only it for other items', () => {
    const chosen = [
      folderShown(false),
      docs(false),
      { kind: 'file', name: 'photo.png', image: true } as const,
      { kind: 'items', names: ['docs', 'notes.txt'] } as const,
    ].flatMap((target) => {
      const menu = menuOf(target);
      menu.choose(strings.commander.showMoreOptions);
      return menu.chosen;
    });

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
      ['...', strings.commander.showMoreOptionsTitle],
    );
  });

  test('leaves the menu of Windows out where there is none, and only the copies for other items there', () => {
    assert.deepStrictEqual(labels(menuOf(docs(false), false).items), [
      strings.commander.newTerminalHere,
      strings.commander.cloneHere,
      strings.commander.initHere,
      '-',
      ...copyOne,
    ]);
    assert.deepStrictEqual(
      labels(menuOf({ kind: 'items', names: ['notes.txt'] }, false).items),
      copyMany,
    );
  });

  test('copies the paths or the names of what the menu is on as text, the folder shown by no name, and offers to go to a path typed on the folder shown alone', () => {
    const chosen = [
      folderShown(false),
      docs(false),
      { kind: 'file', name: 'photo.png', image: true } as const,
      { kind: 'items', names: ['docs', 'notes.txt'] } as const,
    ].flatMap((target) => {
      const menu = menuOf(target);
      const many = target.kind === 'items';
      menu.choose(
        many ? strings.commander.copyPaths : strings.commander.copyPath,
      );
      return menu.chosen;
    });
    const shown = menuOf(folderShown(true));
    shown.choose(strings.commander.goToItem);

    assert.deepStrictEqual(chosen, [
      { copy: 'paths', names: [] },
      { copy: 'paths', names: ['docs'] },
      { copy: 'paths', names: ['photo.png'] },
      { copy: 'paths', names: ['docs', 'notes.txt'] },
    ]);
    assert.deepStrictEqual(shown.chosen, [{ goTo: true }]);
    assert.deepStrictEqual(labels(shown.items), [
      strings.commander.newTerminalHere,
      strings.commander.openInGit,
      '-',
      ...copyOne,
      '-',
      strings.commander.goToItem,
      '-',
      strings.commander.showMoreOptions,
    ]);
  });

  test('offers inside an archive only to try entering one file of it as an archive, to copy paths and names, and to go to a path on the folder shown, no tools on its folders and no image to edit', () => {
    const menu = menuInArchive({
      kind: 'file',
      name: 'photo.png',
      image: true,
    });
    assert.deepStrictEqual(labels(menu.items), [
      strings.commander.openWithSevenZip,
      '-',
      ...copyOne,
    ]);
    menu.choose(strings.commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [{ archive: 'photo.png' }]);
    assert.deepStrictEqual(
      [
        folderShown(false),
        docs(true),
        { kind: 'items', names: ['a.zip', 'b.zip'] } as const,
      ].map((target) => labels(menuInArchive(target).items)),
      [[...copyOne, '-', strings.commander.goToItem], copyOne, copyMany],
    );
  });

  test('offers on a folder every tool of the + menu but the commander it is in, made local to the folder, so a tool added there is offered here too, or left out on purpose', () => {
    const offered = new Set(
      [false, true].flatMap((inRepository) =>
        toolsOf(menuOf(docs(inRepository)).items),
      ),
    );

    assert.deepStrictEqual(
      folderTools.filter((tool) => offered.has(tool)),
      folderTools.filter((tool) => tool !== 'commander'),
    );
  });
});
