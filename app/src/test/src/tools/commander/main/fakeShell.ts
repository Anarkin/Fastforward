import type {
  Notice,
  Page,
  ShellAccess,
  Tab,
} from '../../../../../shell/main/toolContract';
import type {
  Compared,
  FileVersion,
} from '../../../../../shell/main/savedTabs';

export function fakeShell<P extends Page>(page: P) {
  const notices: Notice[] = [];
  const tracking: Promise<unknown>[] = [];
  const openedIn: { readonly tool: string; readonly folders: string[] }[] = [];
  const pages: P[] = [page];
  let focused: P = page;
  const viewed: string[] = [];
  const edited: string[] = [];
  const turned: string[] = [];
  const turnedToView: string[] = [];
  const compared: Compared[] = [];
  const versionsSet: [string, string, FileVersion | undefined][] = [];
  const tabs: Tab[] = [];
  const windows = new Map<Page, Tab[]>();
  const shell: ShellAccess = {
    page: () => focused,
    pages: () => pages,
    current: (shownIn) => shownIn,
    tabs: () => tabs,
    tabsOf: (of) => windows.get(of) ?? tabs,
    active: () => undefined,
    holds: () => true,
    shown: () => [],
    open: () => Promise.resolve(),
    openView: (_page, viewedFile) => {
      viewed.push(viewedFile);
      return Promise.resolve();
    },
    openEdit: (_page, editedFile) => {
      edited.push(editedFile);
      return Promise.resolve();
    },
    editViewed: (_page, turnedTab) => {
      turned.push(turnedTab);
      return Promise.resolve();
    },
    viewEdited: (_page, turnedTab) => {
      turnedToView.push(turnedTab);
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
    setRoot: () => {},
    setVersion: (tab, root, version) => {
      versionsSet.push([tab, root, version]);
    },
    setCompare: () => {},
    visited: () => {},
    recentFolders: () => 10,
    postTabs: () => {},
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
    turned,
    turnedToView,
    compared,
    versionsSet,
    tabs,
    windows,
    openedIn,
    settled,
  };
}
