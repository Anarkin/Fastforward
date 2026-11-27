import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { diffKeymap } from '../components/diff/page/keymap';
import { keymap } from '../lib/page/keymap';
import type { Binding } from '../lib/shared/keymap';
import { shellKeymap } from '../shell/shared/keymap';
import { commanderKeymap } from '../tools/commander/page/keymap';
import { compareKeymap } from '../tools/diff/page/keymap';
import { editorKeymap } from '../tools/editor/page/keymap';
import { gitKeymap } from '../tools/git/page/keymap';
import { terminalKeymap } from '../tools/terminal/page/keymap';
import { viewerKeymap } from '../tools/viewer/page/keymap';

const sources = path.join(__dirname, '..');

const pages = ['tools', 'lib', 'components', 'shell'];

const filesOf = (folder: string) =>
  fs
    .readdirSync(path.join(sources, folder), {
      recursive: true,
      encoding: 'utf8',
    })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(folder, file).split(path.sep).join('/'))
    .toSorted();

const pageFiles = pages.flatMap(filesOf);

const textOf = (file: string) =>
  fs.readFileSync(path.join(sources, file), 'utf8');

const keymaps: Readonly<
  Record<string, Readonly<Record<string, Binding<unknown>>>>
> = {
  keymap,
  shellKeymap,
  diffKeymap,
  compareKeymap,
  viewerKeymap,
  editorKeymap,
  gitKeymap,
  commanderKeymap,
  terminalKeymap,
};

const named = Object.entries(keymaps).flatMap(([map, bindings]) =>
  Object.entries(bindings).map(([name, binding]) => ({
    id: `${map}.${name}`,
    binding,
  })),
);

const ownerOf = (binding: Binding<unknown>) =>
  named.find((each) => each.binding === binding)?.id ?? '';

const owned = [...new Set(named.map(({ binding }) => ownerOf(binding)))];

const keysAlone: readonly string[] = [
  'commanderKeymap.compare',
  'commanderKeymap.copyPaths',
  'commanderKeymap.edit',
  'commanderKeymap.groupByColor',
  'commanderKeymap.layout',
  'commanderKeymap.openWithSevenZip',
  'commanderKeymap.view',
  'keymap.systemMenu',
  'shellKeymap.about',
  'shellKeymap.newWindow',
  'shellKeymap.shortcuts',
  'commanderKeymap.bookmarks',
  'commanderKeymap.contextMenu',
  'commanderKeymap.copyAs',
  'commanderKeymap.copyNames',
  'commanderKeymap.copyToClipboard',
  'commanderKeymap.countSizes',
  'commanderKeymap.deleteItems',
  'commanderKeymap.drive',
  'commanderKeymap.duplicates',
  'commanderKeymap.filter',
  'commanderKeymap.filterLetter',
  'commanderKeymap.filterMove',
  'commanderKeymap.flatView',
  'commanderKeymap.goTo',
  'commanderKeymap.history',
  'commanderKeymap.invertMarks',
  'commanderKeymap.leaveFilter',
  'commanderKeymap.markAll',
  'commanderKeymap.markClick',
  'commanderKeymap.markExtension',
  'commanderKeymap.markMoving',
  'commanderKeymap.markPattern',
  'commanderKeymap.moveAcross',
  'commanderKeymap.newFile',
  'commanderKeymap.newFolder',
  'commanderKeymap.openFolder',
  'commanderKeymap.openOnSide',
  'commanderKeymap.packItems',
  'commanderKeymap.parentFolder',
  'commanderKeymap.paste',
  'commanderKeymap.renameItem',
  'commanderKeymap.reread',
  'commanderKeymap.selectItem',
  'commanderKeymap.showHidden',
  'commanderKeymap.side',
  'commanderKeymap.sort',
  'commanderKeymap.stopFiltering',
  'commanderKeymap.stopReading',
  'commanderKeymap.systemMenu',
  'commanderKeymap.testArchives',
  'commanderKeymap.toggleMark',
  'commanderKeymap.transferItems',
  'compareKeymap.closeCompare',
  'compareKeymap.refresh',
  'diffKeymap.change',
  'diffKeymap.find',
  'diffKeymap.language',
  'diffKeymap.match',
  'diffKeymap.selectAll',
  'diffKeymap.selectText',
  'diffKeymap.showWhitespace',
  'diffKeymap.sideways',
  'diffKeymap.stopFinding',
  'diffKeymap.wheelSideways',
  'diffKeymap.wrap',
  'editorKeymap.addCursor',
  'editorKeymap.closeEditor',
  'editorKeymap.columnSelection',
  'editorKeymap.comment',
  'editorKeymap.compareVersions',
  'editorKeymap.cursorCharacter',
  'editorKeymap.cursorFileEnd',
  'editorKeymap.cursorPage',
  'editorKeymap.cursorRow',
  'editorKeymap.cursorRows',
  'editorKeymap.cursorWord',
  'editorKeymap.deleteCharacter',
  'editorKeymap.deleteWord',
  'editorKeymap.find',
  'editorKeymap.goToLine',
  'editorKeymap.indent',
  'editorKeymap.moveLines',
  'editorKeymap.newLine',
  'editorKeymap.nextOccurrence',
  'editorKeymap.redo',
  'editorKeymap.replace',
  'editorKeymap.rowEnd',
  'editorKeymap.rowStart',
  'editorKeymap.save',
  'editorKeymap.selectAll',
  'editorKeymap.selectText',
  'editorKeymap.singleCursor',
  'editorKeymap.tabLeaves',
  'editorKeymap.undo',
  'editorKeymap.viewEdited',
  'editorKeymap.wheelSideways',
  'gitKeymap.column',
  'gitKeymap.commits',
  'gitKeymap.places',
  'gitKeymap.compare',
  'gitKeymap.folder',
  'gitKeymap.head',
  'gitKeymap.merge',
  'gitKeymap.message',
  'gitKeymap.navigate',
  'gitKeymap.parent',
  'gitKeymap.peekStep',
  'gitKeymap.pin',
  'gitKeymap.refresh',
  'gitKeymap.toFiles',
  'gitKeymap.upstream',
  'gitKeymap.viewFile',
  'gitKeymap.worktree',
  'keymap.close',
  'keymap.dialogButton',
  'keymap.dialogFocus',
  'keymap.drag',
  'keymap.go',
  'keymap.menuFilter',
  'keymap.menuItem',
  'keymap.move',
  'keymap.page',
  'keymap.removeItem',
  'keymap.result',
  'keymap.submenu',
  'shellKeymap.closeTab',
  'shellKeymap.devTools',
  'shellKeymap.dismissNotice',
  'shellKeymap.mainMenu',
  'shellKeymap.moveTab',
  'shellKeymap.newTab',
  'shellKeymap.openIn',
  'shellKeymap.shortcutsGroup',
  'shellKeymap.shortcutsPage',
  'shellKeymap.shortcutsTool',
  'shellKeymap.tab',
  'terminalKeymap.copy',
  'terminalKeymap.find',
  'terminalKeymap.leftToApp',
  'terminalKeymap.paste',
  'viewerKeymap.closeViewer',
  'viewerKeymap.compareVersions',
  'viewerKeymap.edit',
  'viewerKeymap.encoding',
  'viewerKeymap.find',
  'viewerKeymap.followLink',
  'viewerKeymap.language',
  'viewerKeymap.realSize',
  'viewerKeymap.refresh',
  'viewerKeymap.scroll',
  'viewerKeymap.scrollSideways',
  'viewerKeymap.selectAll',
  'viewerKeymap.selectText',
  'viewerKeymap.showWhitespace',
  'viewerKeymap.version',
  'viewerKeymap.viewAs',
  'viewerKeymap.wheelSideways',
  'viewerKeymap.wrap',
  'viewerKeymap.zoomPdf',
];

suite('Shortcuts shown', () => {
  test('writes out no keys in a menu or a tooltip, as the list of shortcuts alone names keys', () => {
    assert.deepStrictEqual(
      pageFiles.filter((file) =>
        /\b(?:keys|stepKeys)(?:=\{?|:)\s*\[?\s*['"`]/.test(textOf(file)),
      ),
      [],
    );
    assert.deepStrictEqual(
      pageFiles.filter((file) => textOf(file).includes('data-tip-keys')),
      [],
    );
  });

  test('shows the keys of no binding in a menu, the list of shortcuts alone naming keys, and lists every binding, so a binding added is looked at', () => {
    const passed = new Set(
      pageFiles.flatMap((file) =>
        [...textOf(file).matchAll(/keysOf\(\s*(\w+\.\w+)/g)].map(
          (call) => call[1],
        ),
      ),
    );
    const shown = owned.filter((id) =>
      named.some(
        ({ id: alias, binding }) =>
          ownerOf(binding) === id && passed.has(alias),
      ),
    );
    assert.deepStrictEqual([...shown], []);
    assert.deepStrictEqual(
      owned.filter((id) => !shown.includes(id)).toSorted(),
      keysAlone.toSorted(),
    );
  });
});
