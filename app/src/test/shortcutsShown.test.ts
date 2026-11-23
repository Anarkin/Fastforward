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

const onControls: readonly string[] = [
  'commanderKeymap.bookmarks',
  'commanderKeymap.compare',
  'commanderKeymap.copyPaths',
  'commanderKeymap.drive',
  'commanderKeymap.edit',
  'commanderKeymap.filter',
  'commanderKeymap.filterMove',
  'commanderKeymap.flatView',
  'commanderKeymap.groupByColor',
  'commanderKeymap.history',
  'commanderKeymap.layout',
  'commanderKeymap.openWithSevenZip',
  'commanderKeymap.view',
  'diffKeymap.find',
  'diffKeymap.language',
  'diffKeymap.match',
  'diffKeymap.showWhitespace',
  'diffKeymap.wrap',
  'editorKeymap.find',
  'editorKeymap.match',
  'gitKeymap.head',
  'gitKeymap.navigate',
  'keymap.close',
  'keymap.removeItem',
  'keymap.result',
  'keymap.systemMenu',
  'shellKeymap.about',
  'shellKeymap.closeTab',
  'shellKeymap.dismissNotice',
  'shellKeymap.mainMenu',
  'shellKeymap.newTab',
  'shellKeymap.newWindow',
  'shellKeymap.shortcuts',
  'viewerKeymap.encoding',
  'viewerKeymap.find',
  'viewerKeymap.language',
  'viewerKeymap.match',
  'viewerKeymap.realSize',
  'viewerKeymap.showWhitespace',
  'viewerKeymap.version',
  'viewerKeymap.viewAs',
  'viewerKeymap.wrap',
];

const keysAlone: readonly string[] = [
  'commanderKeymap.contextMenu',
  'commanderKeymap.copyAs',
  'commanderKeymap.copyNames',
  'commanderKeymap.copyToClipboard',
  'commanderKeymap.countSizes',
  'commanderKeymap.deleteItems',
  'commanderKeymap.duplicates',
  'commanderKeymap.filterLetter',
  'commanderKeymap.goTo',
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
  'diffKeymap.change',
  'diffKeymap.selectText',
  'diffKeymap.sideways',
  'diffKeymap.stopFinding',
  'diffKeymap.wheelSideways',
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
  'editorKeymap.deleteCharacter',
  'editorKeymap.deleteWord',
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
  'editorKeymap.stopFinding',
  'editorKeymap.tabLeaves',
  'editorKeymap.undo',
  'editorKeymap.viewEdited',
  'editorKeymap.wheelSideways',
  'editorKeymap.cursorWord',
  'gitKeymap.column',
  'gitKeymap.commits',
  'gitKeymap.compare',
  'gitKeymap.folder',
  'gitKeymap.merge',
  'gitKeymap.message',
  'gitKeymap.parent',
  'gitKeymap.peekStep',
  'gitKeymap.pin',
  'gitKeymap.toFiles',
  'gitKeymap.upstream',
  'gitKeymap.viewFile',
  'gitKeymap.worktree',
  'keymap.dialogButton',
  'keymap.dialogFocus',
  'keymap.drag',
  'keymap.go',
  'keymap.menuFilter',
  'keymap.menuItem',
  'keymap.move',
  'keymap.page',
  'keymap.submenu',
  'shellKeymap.devTools',
  'shellKeymap.moveTab',
  'shellKeymap.openIn',
  'shellKeymap.shortcutsGroup',
  'shellKeymap.shortcutsPage',
  'shellKeymap.shortcutsTool',
  'shellKeymap.tab',
  'terminalKeymap.copy',
  'terminalKeymap.leftToApp',
  'terminalKeymap.paste',
  'viewerKeymap.closeViewer',
  'viewerKeymap.compareVersions',
  'viewerKeymap.edit',
  'viewerKeymap.scroll',
  'viewerKeymap.scrollSideways',
  'viewerKeymap.selectText',
  'viewerKeymap.stopFinding',
  'viewerKeymap.wheelSideways',
  'viewerKeymap.zoomPdf',
];

const withoutShortcut: readonly string[] = [
  'components/diff/page/toggles.tsx: strings.diff.inline',
  'components/diff/page/toggles.tsx: strings.diff.showEntireFile',
  'components/diff/page/toggles.tsx: strings.diff.showWhitespaceChanges',
  'components/diff/page/toggles.tsx: strings.diff.sideBySide',
  'lib/page/searchBar.tsx: off ? noRegex : title',
  'tools/commander/page/paneCells.tsx: strings.commander.openRepository',
  'tools/diff/page/compareVersions.tsx: <VersionButton >',
  'tools/editor/page/editor.tsx: <LanguageButton >',
  'tools/editor/page/toolbar.tsx: <MenuButton endingsTitle(endingsShown)>',
  'tools/editor/page/toolbar.tsx: <MenuButton strings.editor.readEncodingTitle>',
  'tools/editor/page/toolbar.tsx: <MenuButton strings.editor.writeEncodingTitle>',
  'tools/editor/page/toolbar.tsx: strings.common.showWhitespace',
  'tools/editor/page/toolbar.tsx: strings.common.wrap',
  'tools/git/page/bubbles.tsx: title',
  'tools/git/page/collapseMergesButton.tsx: strings.commits.collapseMerges',
  'tools/git/page/filesColumn.tsx: strings.files.collapseAll',
  'tools/git/page/filesColumn.tsx: strings.files.expandAll',
  'tools/git/page/filesColumn.tsx: strings.files.showAll',
  'tools/git/page/navBar.tsx: strings.navigation.fetchEvery(autoFetchMinutes)',
  'tools/git/page/navBar.tsx: title',
  'tools/git/page/soloButton.tsx: strings.commits.solo',
];

function argumentsOf(text: string, from: number): string[] {
  const parts = [''];
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const char = text[at] ?? '';
    if ('([{'.includes(char)) {
      depth++;
    } else if (')]}'.includes(char)) {
      if (depth === 0) {
        break;
      }
      depth--;
    }
    if (char === ',' && depth === 0) {
      parts.push('');
    } else {
      parts[parts.length - 1] += char;
    }
  }
  return parts.map((part) => part.replaceAll(/\s+/g, ' ').trim());
}

function tagOf(text: string, from: number): string {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    } else if (char === '>' && depth === 0) {
      return text.slice(from, at);
    }
  }
  return text.slice(from);
}

const keyed = ['SearchButton', 'MenuButton', 'LanguageButton', 'VersionButton'];

function unkeyedIn(file: string): string[] {
  const text = textOf(file);
  const tips = [...text.matchAll(/\blabelTip\(/g)]
    .map((call) => argumentsOf(text, call.index + call[0].length))
    .filter(([, options]) => options === undefined || !/\bkeys\b/.test(options))
    .map(([label]) => `${file}: ${label}`);
  const buttons = [
    ...text.matchAll(new RegExp(`<(${keyed.join('|')})(?=[\\s/>])`, 'g')),
  ]
    .map((opened) => ({
      name: opened[1],
      tag: tagOf(text, opened.index + opened[0].length),
    }))
    .filter(({ tag }) => !/\skeys=/.test(tag))
    .map(
      ({ name, tag }) =>
        `${file}: <${name} ${/\stitle=\{([^}]*)\}/.exec(tag)?.[1] ?? ''}>`,
    );
  return [...tips, ...buttons];
}

suite('Shortcuts shown', () => {
  test('shows keys in a tooltip or a menu from a binding alone, by keysOf, never written out, so what a control says of its keys is what the list of shortcuts says and what the keys do', () => {
    assert.deepStrictEqual(
      pageFiles.filter((file) =>
        /\b(?:keys|stepKeys)(?:=\{?|:)\s*\[?\s*['"`]/.test(textOf(file)),
      ),
      [],
    );
    assert.deepStrictEqual(
      pageFiles.filter((file) => textOf(file).includes('data-tip-keys')),
      ['lib/page/tips.ts'],
    );
  });

  test('decides for every binding whether a control shows its keys, a button in its tooltip or an item of a menu, or the keys alone do it, so a binding added is looked at, and shows the keys of each that a control shows', () => {
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
    assert.deepStrictEqual(shown.toSorted(), onControls.toSorted());
    assert.deepStrictEqual(
      owned.filter((id) => !shown.includes(id)).toSorted(),
      keysAlone.toSorted(),
    );
  });

  test('decides for every button with a tooltip whether keys do the same, so a button added either shows its keys or is known to have none', () => {
    assert.deepStrictEqual(
      pageFiles
        .filter((file) => file.endsWith('.tsx'))
        .flatMap(unkeyedIn)
        .toSorted(),
      withoutShortcut.toSorted(),
    );
  });
});
