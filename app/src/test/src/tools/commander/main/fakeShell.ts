import type {
  Notice,
  Page,
  ShellAccess,
  Tab,
} from '../../../../../shell/main/toolContract';
import {
  showsSame,
  type Compared,
  type FileVersion,
} from '../../../../../shell/main/savedTabs';

export function fakeShell<P extends Page>(page: P) {
  const notices: Notice[] = [];
  const tracking: Promise<unknown>[] = [];
  const openedIn: { readonly tool: string; readonly folders: string[] }[] = [];
  const pages: P[] = [page];
  let focused: P = page;
  const viewed: string[] = [];
  const edited: string[] = [];
  const tabsOpened: [string, (string | undefined)[], boolean][] = [];
  const compared: Compared[] = [];
  const versionsSet: [string, string, FileVersion | undefined][] = [];
  const tabs: Tab[] = [];
  const tabsPosted: Page[] = [];
  const windows = new Map<Page, Tab[]>();
  const shell: ShellAccess = {
    page: () => focused,
    pages: () => pages,
    current: (shownIn) => shownIn,
    tabs: () => tabs,
    shows: (tool, file) =>
      tabs.some((tab) => showsSame(tab, { tool, root: file })),
    tabsOf: (of) => windows.get(of) ?? tabs,
    active: () => undefined,
    holds: () => true,
    shown: () => [],
    open: (_page, tool, roots, reuse) => {
      tabsOpened.push([tool, [...roots], reuse]);
      return Promise.resolve();
    },
    openView: (_page, viewedFile) => {
      viewed.push(viewedFile);
      return Promise.resolve();
    },
    openEdit: (_page, editedFile) => {
      edited.push(editedFile);
      return Promise.resolve();
    },
    openCompare: (_page, files) => {
      compared.push(files);
      return Promise.resolve();
    },
    openFolders: (_page, toolOpened, folders) => {
      openedIn.push({ tool: toolOpened, folders: [...folders] });
      return Promise.resolve();
    },
    setRoot: (id, root) => {
      const at = tabs.findIndex((each) => each.id === id);
      const held = tabs[at];
      if (held !== undefined) {
        tabs[at] = { ...held, root };
      }
    },
    setVersion: (tab, root, version) => {
      versionsSet.push([tab, root, version]);
    },
    setCompare: (id, compare) => {
      const at = tabs.findIndex((each) => each.id === id);
      const held = tabs[at];
      if (held !== undefined) {
        tabs[at] = { ...held, compare };
      }
    },
    visited: () => {},
    recentFolders: () => 10,
    postTabs: (posted) => {
      tabsPosted.push(posted);
    },
    notice: (_page, notice) => notices.push(notice),
    track: (tracked) => {
      tracking.push(tracked);
      return tracked;
    },
    idle: () => Promise.resolve(),
  };
  const settled = async () => {
    while (tracking.length > 0) {
      await Promise.all(tracking.splice(0));
    }
  };
  return {
    shell,
    pages,
    focus: (to: P) => {
      focused = to;
    },
    notices,
    viewed,
    edited,
    tabsOpened,
    compared,
    versionsSet,
    tabs,
    tabsPosted,
    windows,
    openedIn,
    settled,
  };
}
