import { strings } from '../../lib/shared/strings';
import { addNotice } from '../shared/notices';
import type { TabInfo, ToWebview, ToWebviewOf } from '../shared/protocol';
import { tools as toolIds } from '../shared/tools';
import type { Notice, Page, Tab, Tools } from './shell';
import type { Storage } from './storage';
import { activeTabOf, type TabWindow } from './windows';

export class Pages {
  private readonly pages = new Map<string, Page>();
  private readonly windowsOfPages = new WeakMap<Page, string>();
  private readonly windowsSent = new WeakMap<Page, string>();
  private focusedWindow: string | undefined;
  private unsentNotices: readonly ToWebviewOf<'notice'>[] = [];

  constructor(
    private readonly storage: Storage,
    private readonly tools: Tools,
  ) {}

  connected(page: Page, window: string): void {
    this.windowsOfPages.set(page, window);
  }

  disconnected(page: Page, window: string): void {
    if (this.pages.get(window) === page && !this.laidOut(window)) {
      this.pages.delete(window);
    }
  }

  laidOut(window: string): boolean {
    return this.storage.layout.some((each) => each.id === window);
  }

  of(window: string): Page | undefined {
    return this.pages.get(window);
  }

  all(): Page[] {
    return [...this.pages.values()].filter((page) => !page.disposed);
  }

  current(page: Page): Page | undefined {
    return page.disposed ? this.live(this.windowsOfPages.get(page)) : page;
  }

  live(window: string | undefined): Page | undefined {
    const page = window === undefined ? undefined : this.pages.get(window);
    return page === undefined || page.disposed ? undefined : page;
  }

  focused(): Page | undefined {
    return this.focusedWindow === undefined
      ? undefined
      : this.pages.get(this.focusedWindow);
  }

  shown(): Page | undefined {
    return (
      this.live(this.focusedWindow) ??
      this.storage.layout
        .map((window) => this.live(window.id))
        .find((page) => page !== undefined)
    );
  }

  focus(window: string): void {
    this.focusedWindow = window;
  }

  showing(window: string, page: Page): void {
    this.pages.set(window, page);
    if (this.laidOut(window)) {
      this.focusedWindow = window;
    }
  }

  postUnsentNotices(window: string, page: Page): void {
    if (!this.laidOut(window)) {
      return;
    }
    const unsent = this.unsentNotices;
    this.unsentNotices = [];
    for (const notice of unsent) {
      page.post(notice);
    }
  }

  windowOf(page: Page): TabWindow {
    const { layout } = this.storage;
    const id = this.windowsOfPages.get(page) ?? layout[0]?.id ?? '1';
    return layout.find((window) => window.id === id) ?? { id, tabs: [] };
  }

  activeTab(page: Page): Tab | undefined {
    return activeTabOf(this.windowOf(page));
  }

  postToAll(message: ToWebview): void {
    for (const page of this.pages.values()) {
      page.post(message);
    }
  }

  postTabs(page: Page): void {
    page.post({
      type: 'tabs',
      tabs: this.infos(this.windowOf(page).tabs),
      active: this.activeTab(page)?.id,
    });
    this.postWindows();
  }

  postWindows(): void {
    const { layout } = this.storage;
    const names = new Map(
      this.infos(this.storage.savedTabs).map((info) => [
        info.id,
        strings.tabs.label(info.name, info.folder),
      ]),
    );
    for (const [id, page] of this.pages) {
      const windows = layout
        .filter((window) => window.id !== id)
        .map((window) => {
          const shown = activeTabOf(window) ?? window.tabs.at(0);
          return {
            id: window.id,
            name:
              (shown === undefined ? undefined : names.get(shown.id)) ??
              strings.tabs.noTabWindow,
          };
        });
      const sent = JSON.stringify(windows);
      if (!page.disposed && this.windowsSent.get(page) !== sent) {
        this.windowsSent.set(page, sent);
        page.post({ type: 'windows', windows });
      }
    }
  }

  infos(tabs: readonly Tab[]): TabInfo[] {
    const names = new Map(
      toolIds.flatMap((tool) => [
        ...this.tools[tool].names(tabs.filter((tab) => tab.tool === tool)),
      ]),
    );
    return tabs.map(({ id, tool, root, view, edit, compare }) => {
      const name = names.get(id);
      return {
        id,
        tool,
        name: name?.name ?? strings.tools[tool],
        ...(name?.folder !== undefined && { folder: name.folder }),
        ...(name?.icon !== undefined && { icon: name.icon }),
        ...(root !== undefined && { root }),
        ...(view === true && { view }),
        ...(edit === true && { edit }),
        ...(compare !== undefined && { compare: true as const }),
        ...(name?.unsaved === true && { unsaved: true as const }),
      };
    });
  }

  notice(page: Page | undefined, notice: Notice): void {
    const live =
      page !== undefined && !page.disposed
        ? page
        : (this.live(
            page === undefined ? undefined : this.windowsOfPages.get(page),
          ) ?? this.live(this.focusedWindow));
    const message = { type: 'notice', ...notice } as const;
    if (live === undefined) {
      this.unsentNotices = addNotice(this.unsentNotices, message);
      return;
    }
    live.post(message);
  }
}
