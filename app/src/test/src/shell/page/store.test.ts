import * as assert from 'node:assert';
import { maxLookedPaths } from '../../../../lib/shared/partLooks';
import { suite, test } from 'vitest';
import type { ToHost, TabInfo } from '../../../../shell/shared/protocol';
import { createShellStore } from '../../../../shell/page/store';
import { defaultTextView } from '../../../../shell/page/textView';
import { noop } from '../../../helpers/fixtures';
import { strings } from '../../../../lib/shared/strings';

const terminal: TabInfo = { id: '1', tool: 'terminal', name: 'repo' };
const git: TabInfo = { id: '2', tool: 'git', name: 'repo' };

function posting() {
  const posted: ToHost[] = [];
  return { posted, store: createShellStore((message) => posted.push(message)) };
}

const ask = (path: string) => ({
  path,
  file: false,
  at: { x: 4, y: 8 },
  extended: false,
});

suite('Shell store', () => {
  test('keeps the color groups of the files and what it was told of the parts of paths, part by part', () => {
    const store = createShellStore(noop);
    const { receive } = store.getState();
    receive({
      type: 'fileColors',
      groups: [
        { extensions: ['log'], colors: { light: 'blue', dark: 'navy' } },
      ],
    });
    receive({
      type: 'partLooks',
      looks: [
        {
          path: 'C:\\Temp\\a.log',
          parts: [
            { hidden: false, file: false, executable: false },
            { hidden: true, file: false, executable: false },
            null,
          ],
        },
      ],
    });
    const state = store.getState();
    assert.deepStrictEqual(state.fileColors.colors, ['light-dark(blue, navy)']);
    assert.deepStrictEqual(
      [...state.partLooks],
      [
        ['C:\\', { hidden: false, file: false, executable: false }],
        ['C:\\Temp', { hidden: true, file: false, executable: false }],
        ['C:\\Temp\\a.log', null],
      ],
    );
  });

  test('asks the main process about the parts of paths once each, together, a list at a time', async () => {
    const { posted, store } = posting();
    const { askLooks } = store.getState();
    askLooks('C:\\a');
    askLooks('C:\\b');
    askLooks('C:\\a');
    assert.strictEqual(posted.length, 0);
    await Promise.resolve();
    assert.deepStrictEqual(posted.slice(), [
      { type: 'partLooks', paths: ['C:\\a', 'C:\\b'] },
    ]);
    posted.length = 0;
    for (let index = 0; index < maxLookedPaths + 1; index++) {
      askLooks(`C:\\${index}`);
    }
    await Promise.resolve();
    assert.deepStrictEqual(
      posted.map((message) =>
        message.type === 'partLooks' ? message.paths.length : 0,
      ),
      [maxLookedPaths, 1],
    );
  });

  test('keeps the tabs, the one shown and the settings as the main process sends them', () => {
    const store = createShellStore(noop);
    const { receive } = store.getState();
    receive({ type: 'tabs', tabs: [terminal, git], active: '2' });
    receive({ type: 'dateFormat', format: 'DD.MM.YYYY' });
    receive({
      type: 'scrolling',
      wheelRows: 3,
      smooth: true,
      smoothSnap: false,
    });
    receive({
      type: 'hints',
      tipDelay: 120,
      characterTipDelay: 40,
      noticeTimes: { least: 1, most: 2, errorLeast: 3, errorMost: 4 },
    });
    receive({
      type: 'textView',
      view: {
        wordWrap: false,
        showWhitespace: true,
        highlightSyntax: false,
        highlightOccurrences: false,
      },
    });
    receive({ type: 'imageView', view: { realSize: true } });
    receive({ type: 'update', status: { kind: 'checking' } });
    receive({ type: 'terminalCommand', installable: true });
    const state = store.getState();
    assert.deepStrictEqual(state.tabs, [terminal, git]);
    assert.strictEqual(state.active, '2');
    assert.deepStrictEqual(
      [state.tipDelay, state.characterTipDelay, state.noticeTimes],
      [120, 40, { least: 1, most: 2, errorLeast: 3, errorMost: 4 }],
    );
    assert.strictEqual(state.dateFormat, 'DD.MM.YYYY');
    assert.deepStrictEqual(state.scrolling, {
      wheelRows: 3,
      smooth: true,
      smoothSnap: false,
    });
    assert.deepStrictEqual(state.textView, {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: false,
      highlightOccurrences: false,
    });
    assert.deepStrictEqual(state.imageView, { realSize: true });
    assert.deepStrictEqual(state.update, { kind: 'checking' });
    assert.strictEqual(state.installsCommand, true);
  });

  test('drops a menu once another tab is shown, as its items act on the one it opened in', () => {
    const store = createShellStore(noop);
    const menu = { x: 1, y: 2, items: [] };
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git], active: '1' });
    store.getState().showMenu(menu);
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git], active: '1' });
    assert.strictEqual(store.getState().menu?.menu, menu);
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git], active: '2' });
    assert.strictEqual(store.getState().menu, undefined);
    store.getState().showMenu(menu);
    store.getState().closeMenu();
    assert.strictEqual(store.getState().menu, undefined);
  });

  test('adds each notice with an id of its own, putting one of the same message last, and dismisses it', () => {
    const store = createShellStore(noop);
    const { receive } = store.getState();
    receive({ type: 'notice', level: 'error', message: 'a' });
    receive({ type: 'notice', level: 'info', message: 'b' });
    receive({ type: 'notice', level: 'error', message: 'a' });
    const { notices } = store.getState();
    assert.deepStrictEqual(
      notices.map((notice) => notice.message),
      ['b', 'a'],
    );
    assert.strictEqual(new Set(notices.map((notice) => notice.id)).size, 2);
    store.getState().dismissNotice(notices[0].id);
    assert.deepStrictEqual(
      store.getState().notices.map((notice) => notice.message),
      ['a'],
    );
  });

  test('gives the notices asked for, or all, their whole time again from now, as once the window has the focus again', () => {
    const notices = [1, 2, 3].map((id) => ({
      id,
      level: 'info' as const,
      message: `${id}`,
      shownAt: 0,
    }));
    const store = createShellStore(noop, { notices });
    const before = performance.now();
    store.getState().restartNotices([2]);
    assert.deepStrictEqual(
      store.getState().notices.map((notice) => notice.shownAt >= before),
      [false, true, false],
    );
    store.getState().restartNotices();
    assert.ok(
      store.getState().notices.every((notice) => notice.shownAt >= before),
    );
  });

  test('asks before closing a terminal tab and closes any other at once, closing or quitting once confirmed', () => {
    const { posted, store } = posting();
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git], active: '1' });
    store.getState().closeTab('2');
    assert.deepStrictEqual(posted, [{ type: 'closeTab', tab: '2' }]);
    store.getState().closeTab('1');
    assert.deepStrictEqual(store.getState().confirming, {
      kind: 'tab',
      tab: terminal,
    });
    store.getState().confirm();
    assert.strictEqual(store.getState().confirming, undefined);
    store.getState().receive({ type: 'confirmQuit' });
    assert.deepStrictEqual(store.getState().confirming, { kind: 'quit' });
    store.getState().cancel();
    assert.strictEqual(store.getState().confirming, undefined);
    store.getState().receive({ type: 'confirmQuit', note: 'A copy runs.' });
    assert.deepStrictEqual(store.getState().confirming, {
      kind: 'quit',
      note: 'A copy runs.',
    });
    store.getState().cancel();
    store.getState().receive({ type: 'confirmQuit' });
    store.getState().confirm();
    assert.deepStrictEqual(posted, [
      { type: 'closeTab', tab: '2' },
      { type: 'closeTab', tab: '1' },
      { type: 'quit' },
    ]);
  });

  test('asks whether to save the changes of a tab before closing it, closing it once told to save them or not, and asks the same of a window or the app holding files with unsaved changes', () => {
    const { posted, store } = posting();
    const edited = {
      id: '3',
      tool: 'commander',
      name: 'notes.txt',
      edit: true,
      unsaved: true,
    } as const;
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git, edited], active: '3' });
    store.getState().closeTab('3');
    assert.deepStrictEqual(store.getState().confirming, {
      kind: 'unsavedTab',
      tab: edited,
    });
    store.getState().confirm();
    store.getState().closeTab('3');
    store.getState().dontSave();
    store.getState().closeTab('3');
    store.getState().cancel();
    store
      .getState()
      .receive({ type: 'confirmCloseWindow', unsaved: ['notes.txt'] });
    assert.deepStrictEqual(store.getState().confirming, {
      kind: 'window',
      unsaved: ['notes.txt'],
    });
    store.getState().confirm();
    store.getState().receive({ type: 'confirmQuit', unsaved: ['notes.txt'] });
    store.getState().dontSave();
    store.getState().receive({ type: 'confirmQuit', unsaved: ['notes.txt'] });
    store.getState().confirm();
    assert.deepStrictEqual(posted, [
      { type: 'closeTab', tab: '3', save: true },
      { type: 'closeTab', tab: '3' },
      { type: 'closeWindow', save: true },
      { type: 'quit' },
      { type: 'quit', save: true },
    ]);
  });

  test('asks whether to close the window the main process asks about, closing it once confirmed, and opens a new window when asked', () => {
    const { posted, store } = posting();
    store.getState().receive({ type: 'confirmCloseWindow' });
    assert.deepStrictEqual(store.getState().confirming, { kind: 'window' });
    assert.deepStrictEqual(store.getState().popups, ['confirm']);
    store.getState().cancel();
    assert.deepStrictEqual(posted, []);
    store.getState().receive({ type: 'confirmCloseWindow' });
    store.getState().confirm();
    store.getState().newWindow();
    assert.deepStrictEqual(posted, [
      { type: 'closeWindow' },
      { type: 'newWindow' },
    ]);
  });

  test('keeps whether tabs tear off and the tab another window drags over the tab row, and tells the main process where the row is and how a drag goes', () => {
    const { posted, store } = posting();
    store.getState().receive({ type: 'tearsOff', allowed: true });
    assert.strictEqual(store.getState().tearsOff, true);
    const visit = {
      tab: { id: '4', tool: 'terminal', name: 'work' },
      x: 100,
      grabX: 20,
    } as const;
    store.getState().receive({ type: 'tabVisit', visit });
    assert.deepStrictEqual(store.getState().visit, visit);
    store.getState().receive({ type: 'tabVisit' });
    assert.strictEqual(store.getState().visit, undefined);
    const strip = {
      left: 8,
      right: 700,
      top: 0,
      bottom: 32,
      firstTabLeft: 8,
      tabTop: 4,
      tabs: 2,
    };
    store.getState().reportStrip(strip);
    store.getState().tearTab('1', { x: 20, y: 10 }, { x: 300, y: 40 });
    store.getState().dragTabTo({ x: 310, y: 50 });
    store.getState().visitIndex(2);
    store.getState().dropTab();
    store.getState().cancelTabDrag();
    assert.deepStrictEqual(posted, [
      { type: 'tabStrip', ...strip },
      {
        type: 'tearTab',
        tab: '1',
        grabX: 20,
        grabY: 10,
        screenX: 300,
        screenY: 40,
      },
      { type: 'dragTabTo', screenX: 310, screenY: 50 },
      { type: 'visitIndex', index: 2 },
      { type: 'dropTab' },
      { type: 'cancelTabDrag' },
    ]);
  });

  test('keeps the other windows the main process names, and moves a tab to a new window or into one of them', () => {
    const { posted, store } = posting();
    const windows = [{ id: '2', name: 'repo' }];
    store.getState().receive({ type: 'windows', windows });
    assert.deepStrictEqual(store.getState().windows, windows);
    store.getState().moveTabToWindow('1');
    store.getState().moveTabToWindow('1', '2');
    assert.deepStrictEqual(posted, [
      { type: 'moveTabToWindow', tab: '1' },
      { type: 'moveTabToWindow', tab: '1', window: '2' },
    ]);
  });

  test('opens the Open With popup the main process asks for, and answers it with the tool chosen or none', () => {
    const { posted, store } = posting();
    const choosing = {
      type: 'chooseTool',
      folders: ['/repo'],
      choices: [{ tool: 'commander', fits: true }],
      picked: 'commander',
    } as const;
    store.getState().showPopup('about', true);
    store.getState().receive(choosing);
    assert.strictEqual(store.getState().choosing, choosing);
    assert.deepStrictEqual(store.getState().popups, ['about', 'openWith']);
    store.getState().openWith('commander');
    store.getState().receive(choosing);
    store.getState().openWith(undefined);
    assert.strictEqual(store.getState().choosing, undefined);
    assert.deepStrictEqual(store.getState().popups, ['about']);
    assert.deepStrictEqual(posted, [
      { type: 'openWith', tool: 'commander' },
      { type: 'openWith', tool: undefined },
    ]);
  });

  test('shows, toggles and hides popups, the newest last', () => {
    const store = createShellStore(noop);
    store.getState().togglePopup('shortcuts');
    store.getState().showPopup('about', true);
    assert.deepStrictEqual(store.getState().popups, ['shortcuts', 'about']);
    store.getState().togglePopup('shortcuts');
    store.getState().showPopup('about', false);
    assert.deepStrictEqual(store.getState().popups, []);
  });

  test('moves a tab at once, telling the main process', () => {
    const { posted, store } = posting();
    store
      .getState()
      .receive({ type: 'tabs', tabs: [terminal, git], active: '1' });
    store.getState().moveTab('2', 0);
    assert.deepStrictEqual(store.getState().tabs, [git, terminal]);
    assert.deepStrictEqual(posted, [{ type: 'moveTab', tab: '2', index: 0 }]);
  });

  test('keeps the items of the + menu and the title each tool gives', () => {
    const store = createShellStore(noop);
    const items = [{ label: 'Browse...', onClick: noop }];
    store.getState().setToolItems('git', items);
    store.getState().setToolTitle('git', '/repo');
    store.getState().setToolTitle('terminal', undefined);
    assert.deepStrictEqual(store.getState().toolItems, { git: items });
    assert.deepStrictEqual(store.getState().toolTitles, {
      git: '/repo',
      terminal: undefined,
    });
  });

  test('turns wrapping or whitespace on or off from where it is now, telling the main process the whole view', () => {
    const { posted, store } = posting();
    store.getState().toggleTextView('wordWrap');
    store.getState().toggleTextView('wordWrap');
    store.getState().toggleTextView('showWhitespace');
    const wrapped = { ...defaultTextView, wordWrap: !defaultTextView.wordWrap };
    assert.deepStrictEqual(posted, [
      { type: 'setTextView', view: wrapped },
      { type: 'setTextView', view: defaultTextView },
      {
        type: 'setTextView',
        view: {
          ...defaultTextView,
          showWhitespace: !defaultTextView.showWhitespace,
        },
      },
    ]);
  });

  test('changes what is asked of the text and image views at once, keeping the rest, telling the main process the whole view, and copies text through it', () => {
    const { posted, store } = posting();
    const view = { ...defaultTextView, showWhitespace: true };
    store.getState().changeTextView({ showWhitespace: true });
    store.getState().changeImageView({ realSize: true });
    store.getState().copyText('hash');
    assert.deepStrictEqual(store.getState().textView, view);
    assert.deepStrictEqual(store.getState().imageView, { realSize: true });
    assert.deepStrictEqual(posted, [
      { type: 'setTextView', view },
      { type: 'setImageView', view: { realSize: true } },
      { type: 'copyText', text: 'hash' },
    ]);
  });

  test('is made in the state it is given, as a page rendered to a string shows that state', () => {
    assert.strictEqual(
      createShellStore(noop, { dateFormat: 'DD.MM.YYYY' }).getInitialState()
        .dateFormat,
      'DD.MM.YYYY',
    );
  });

  test('tells the main process the page is ready, logs, and asks it to show, preload and open tabs, open the settings, check for and install updates, install the command and open what is shown in another tool', () => {
    const { posted, store } = posting();
    const actions = store.getState();
    actions.ready();
    actions.log('drag started');
    actions.selectTab('2');
    actions.preloadTab('2');
    actions.newTab('git');
    actions.openSettings();
    actions.openDefaultSettings();
    actions.checkForUpdates();
    actions.installUpdate();
    actions.installTerminalCommand();
    actions.openIn();
    assert.deepStrictEqual(posted, [
      { type: 'ready' },
      { type: 'log', level: 'info', message: 'drag started' },
      { type: 'selectTab', tab: '2' },
      { type: 'preloadTab', tab: '2' },
      { type: 'newTab', tool: 'git' },
      { type: 'openSettings' },
      { type: 'openDefaultSettings' },
      { type: 'checkForUpdates' },
      { type: 'installUpdate' },
      { type: 'installTerminalCommand' },
      { type: 'openIn' },
    ]);
  });

  test('asks the main process what a path is before showing the menu of a part of it, showing the menu of the part right clicked last alone, its items acting on the path', () => {
    const posted: ToHost[] = [];
    const store = createShellStore(
      (message) => posted.push(message),
      {},
      noop,
      () => 'linux',
    );
    store.getState().openPathMenu(ask('/code'));
    store.getState().openPathMenu(ask('/code/app'));
    assert.deepStrictEqual(posted, [
      { type: 'pathFacts', ask: 1, path: '/code' },
      { type: 'pathFacts', ask: 2, path: '/code/app' },
    ]);
    const facts = {
      kind: 'folder',
      inRepository: true,
      gitMissing: false,
    } as const;
    store.getState().receive({ type: 'pathFacts', ask: 1, facts });
    assert.strictEqual(store.getState().pathMenu, undefined);
    store.getState().receive({ type: 'pathFacts', ask: 2, facts });
    const menu = store.getState().pathMenu?.menu;
    assert.deepStrictEqual([menu?.x, menu?.y], [4, 8]);
    for (const item of menu?.items ?? []) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(posted.slice(2), [
      { type: 'pathCommand', path: '/code/app', command: 'newTerminal' },
      { type: 'pathCommand', path: '/code/app', command: 'openInCommander' },
      { type: 'pathCommand', path: '/code/app', command: 'openInGit' },
      { type: 'copyText', text: '/code/app' },
    ]);
    store.getState().closePathMenu();
    assert.strictEqual(store.getState().pathMenu, undefined);
  });

  test('shows the menu of a file shown as a version other than the one on disk at once, asking the main process nothing, Shift too', () => {
    const posted: ToHost[] = [];
    const viewed: string[] = [];
    const store = createShellStore(
      (message) => posted.push(message),
      {},
      noop,
      () => 'win32',
    );
    for (const extended of [false, true]) {
      store.getState().openPathMenu({
        ...ask('/repo/a.ts'),
        file: true,
        extended,
        version: { view: () => viewed.push('a.ts') },
      });
      const items = store.getState().pathMenu?.menu.items ?? [];
      const viewer = items.find(
        (item) =>
          !('separator' in item) &&
          item.label === strings.commander.openWithViewer,
      );
      assert.ok(viewer !== undefined && !('separator' in viewer));
      viewer.onClick?.();
    }
    assert.deepStrictEqual(posted, []);
    assert.deepStrictEqual(viewed, ['a.ts', 'a.ts']);
  });

  test('opens the menu of Windows of a path at once on a right click with Shift on Windows, as the commander does', () => {
    const posted: ToHost[] = [];
    const store = createShellStore(
      (message) => posted.push(message),
      {},
      noop,
      () => 'win32',
    );
    store.getState().openPathMenu({
      path: 'C:\\Code',
      file: false,
      at: { x: 4, y: 8 },
      extended: true,
    });
    assert.deepStrictEqual(posted, [
      {
        type: 'pathCommand',
        path: 'C:\\Code',
        command: 'systemMenu',
        x: 4,
        y: 8,
        extended: true,
      },
    ]);
  });
});
