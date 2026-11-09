import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ToHost, TabInfo } from '../../../shell/shared/protocol';
import { createShellStore } from '../../../shell/page/store';
import { defaultTextView } from '../../../ui/textView';
import { noop } from '../../fixtures';

const terminal: TabInfo = { id: '1', tool: 'terminal', name: 'repo' };
const git: TabInfo = { id: '2', tool: 'git', name: 'repo' };

function posting() {
  const posted: ToHost[] = [];
  return { posted, store: createShellStore((message) => posted.push(message)) };
}

suite('Shell store', () => {
  test('hands each tool the messages meant for it, and posts what a tool asks under its name', () => {
    const posted: ToHost[] = [];
    const store = createShellStore((message) => posted.push(message));
    const { channels, receive } = store.getState();
    const toGit: unknown[] = [];
    const toTerminal: unknown[] = [];
    const stop = channels.git.listen((message) => toGit.push(message));
    channels.terminal.listen((message) => toTerminal.push(message));
    const worktrees = {
      type: 'worktrees',
      worktree: '/repo',
      worktrees: [],
    } as const;
    receive({ type: 'tool', tool: 'git', message: worktrees });
    assert.deepStrictEqual(toGit, [worktrees]);
    assert.deepStrictEqual(toTerminal, []);
    stop();
    receive({ type: 'tool', tool: 'git', message: worktrees });
    assert.strictEqual(toGit.length, 1);
    channels.terminal.post({ type: 'newTab' });
    assert.deepStrictEqual(posted, [
      { type: 'tool', tool: 'terminal', message: { type: 'newTab' } },
    ]);
  });

  test('keeps the tabs, the one shown and the settings as the main process sends them', () => {
    const store = createShellStore(noop);
    const { receive } = store.getState();
    receive({ type: 'tabs', tabs: [terminal, git], active: '2' });
    receive({ type: 'dateFormat', format: 'DD.MM.YYYY' });
    receive({ type: 'scrolling', wheelRows: 3, smooth: true });
    receive({
      type: 'textView',
      view: { wordWrap: false, showWhitespace: true, highlightSyntax: false },
    });
    receive({ type: 'imageView', view: { realSize: true } });
    receive({ type: 'update', status: { kind: 'checking' } });
    receive({ type: 'terminalCommand', installable: true });
    const state = store.getState();
    assert.deepStrictEqual(state.tabs, [terminal, git]);
    assert.strictEqual(state.active, '2');
    assert.strictEqual(state.dateFormat, 'DD.MM.YYYY');
    assert.deepStrictEqual(state.scrolling, { wheelRows: 3, smooth: true });
    assert.deepStrictEqual(state.textView, {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: false,
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
    store.getState().cancel();
    assert.strictEqual(store.getState().confirming, undefined);
    store.getState().receive({ type: 'confirmQuit' });
    store.getState().confirm();
    assert.deepStrictEqual(posted, [
      { type: 'closeTab', tab: '2' },
      { type: 'closeTab', tab: '1' },
      { type: 'quit' },
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
});
