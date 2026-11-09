import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { suite, test } from 'vitest';
import { strings } from '../../../../shared/strings';
import { tools, type ToolId } from '../../../../shell/shared/tools';
import type { ContextMenuItem } from '../../../../ui/contextMenu';
import { ToolIcon } from '../../../../ui/icons';
import {
  fileMenuItems,
  menuTargetOf,
  type MenuTarget,
} from '../../../../tools/commander/page/fileMenu';
import { rowsOf } from '../../../../tools/commander/page/listing';
import type { FolderCommand } from '../../../../tools/commander/shared/protocol';

const entry = (name: string, folder = false) => ({
  name,
  folder,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

const rows = rowsOf(
  [
    entry('app', true),
    entry('docs', true),
    entry('photo.png'),
    entry('logo.svg'),
    entry('notes.txt'),
  ],
  true,
  true,
  { column: 'name', descending: false, groupByColor: false },
  new Set(['app']),
);

type Chosen =
  | { readonly folder: FolderCommand; readonly name: string | undefined }
  | { readonly archive: string }
  | { readonly system: readonly string[] };

function menuOf(target: MenuTarget, windows = true, inArchive = false) {
  const chosen: Chosen[] = [];
  const items = fileMenuItems(
    target,
    {
      onFolder: (command, name) => chosen.push({ folder: command, name }),
      onEnterArchive: (name) => chosen.push({ archive: name }),
      onSystemMenu: windows
        ? (names) => chosen.push({ system: names })
        : undefined,
    },
    inArchive,
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

const toolsOf = (items: readonly ContextMenuItem[]): ToolId[] =>
  items.flatMap((item) =>
    'separator' in item ||
    !isValidElement<{ tool: ToolId }>(item.icon) ||
    item.icon.type !== ToolIcon
      ? []
      : [item.icon.props.tool],
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

suite('Commander file menu', () => {
  test('is on the folder shown for .. or the empty space, on the folder or file pointed at, or on the marked items when the one pointed at is marked', () => {
    assert.deepStrictEqual(
      menuTargetOf(rows, undefined, undefined, false),
      folderShown(false),
    );
    assert.deepStrictEqual(
      menuTargetOf(rows, '..', undefined, true),
      folderShown(true),
    );
    assert.deepStrictEqual(menuTargetOf(rows, 'docs', undefined, false), {
      kind: 'folder',
      name: 'docs',
      inRepository: false,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'photo.png', undefined, false), {
      kind: 'file',
      name: 'photo.png',
      image: true,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'notes.txt', undefined, false), {
      kind: 'file',
      name: 'notes.txt',
      image: false,
    });
    assert.deepStrictEqual(
      menuTargetOf(rows, 'docs', new Set(['docs', 'notes.txt']), false),
      { kind: 'items', names: ['docs', 'notes.txt'] },
    );
    assert.deepStrictEqual(
      menuTargetOf(rows, 'docs', new Set(['notes.txt']), false),
      { kind: 'folder', name: 'docs', inRepository: false },
    );
    assert.strictEqual(menuTargetOf(rows, 'gone', undefined, false), undefined);
  });

  test('takes a folder to be in a repository when it is one, or the folder shown is in one', () => {
    assert.deepStrictEqual(menuTargetOf(rows, 'app', undefined, false), {
      kind: 'folder',
      name: 'app',
      inRepository: true,
    });
    assert.deepStrictEqual(menuTargetOf(rows, 'docs', undefined, true), {
      kind: 'folder',
      name: 'docs',
      inRepository: true,
    });
  });

  test('offers a folder a new terminal in it, and git to open it when it is in a repository, or to clone into it or init one in it when it is not, never making a repository inside another, the menu of Windows last', () => {
    assert.deepStrictEqual(labels(menuOf(docs(false)).items), [
      strings.commander.newTerminalHere,
      strings.commander.cloneHere,
      strings.commander.initHere,
      '-',
      strings.commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(labels(menuOf(docs(true)).items), [
      strings.commander.newTerminalHere,
      strings.commander.openInGit,
      '-',
      strings.commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(toolsOf(menuOf(docs(false)).items), [
      'terminal',
      'git',
      'git',
    ]);
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
      strings.commander.showMoreOptions,
    ]);
    assert.ok(edit !== undefined && !('separator' in edit));
    assert.notStrictEqual(edit.disabled, true);
    assert.strictEqual(edit.onClick, undefined);
    assert.deepStrictEqual(menuTargetOf(rows, 'logo.svg', undefined, false), {
      kind: 'file',
      name: 'logo.svg',
      image: false,
    });
  });

  test('offers one file to try entering as an archive, whatever its name, asking for it by its name, and no items marked together', () => {
    const menu = menuOf(
      { kind: 'file', name: 'notes.txt', image: false },
      false,
    );
    assert.deepStrictEqual(labels(menu.items), [
      strings.commander.openWithSevenZip,
    ]);
    menu.choose(strings.commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [{ archive: 'notes.txt' }]);
    assert.deepStrictEqual(
      labels(menuOf({ kind: 'items', names: ['a.zip', 'b.zip'] }, false).items),
      [],
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
    const [more] = menuOf({ kind: 'items', names: ['notes.txt'] }).items;
    assert.ok(more !== undefined && !('separator' in more));
    assert.deepStrictEqual(
      [more.label, more.title],
      ['...', strings.commander.showMoreOptionsTitle],
    );
  });

  test('leaves the menu of Windows out where there is none, and nothing at all for other items there', () => {
    assert.deepStrictEqual(labels(menuOf(docs(false), false).items), [
      strings.commander.newTerminalHere,
      strings.commander.cloneHere,
      strings.commander.initHere,
    ]);
    assert.deepStrictEqual(
      menuOf({ kind: 'items', names: ['notes.txt'] }, false).items,
      [],
    );
  });

  test('offers inside an archive only to try entering one file of it as an archive, nothing on its folders, the folder shown or marked items, and no image to edit', () => {
    const menu = menuInArchive({
      kind: 'file',
      name: 'photo.png',
      image: true,
    });
    assert.deepStrictEqual(labels(menu.items), [
      strings.commander.openWithSevenZip,
    ]);
    menu.choose(strings.commander.openWithSevenZip);
    assert.deepStrictEqual(menu.chosen, [{ archive: 'photo.png' }]);
    for (const target of [
      folderShown(false),
      docs(true),
      { kind: 'items', names: ['a.zip', 'b.zip'] } as const,
    ]) {
      assert.deepStrictEqual(menuInArchive(target).items, []);
    }
  });

  test('offers on a folder every tool of the + menu but the commander it is in, made local to the folder, so a tool added there is offered here too, or left out on purpose', () => {
    const offered = new Set(
      [false, true].flatMap((inRepository) =>
        toolsOf(menuOf(docs(inRepository)).items),
      ),
    );

    assert.deepStrictEqual(
      tools.filter((tool) => offered.has(tool)),
      tools.filter((tool) => tool !== 'commander'),
    );
  });
});
