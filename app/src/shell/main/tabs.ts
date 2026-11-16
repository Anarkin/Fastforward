import { sameRoot } from '../../lib/main/paths';
import type { ToolId } from '../shared/tools';
import type { Pages } from './pages';
import type { Storage } from './storage';
import type { TabHistory } from './tabHistory';
import type { TabViews } from './tabViews';
import type { Page, Tab, Tools } from './toolContract';
import {
  nextTabId,
  windowOf,
  withActive,
  withChanged,
  withClosed,
  withOpened,
} from './windows';

export interface TabsHost {
  showWindow(window: string): void;
  closeWindow(window: string): void;
  save(saving: Promise<void>): void;
}

export class Tabs {
  private readonly shownTools = new WeakMap<Page, ToolId>();
  private lastTabId = 0;

  constructor(
    private readonly storage: Storage,
    private readonly tools: Tools,
    private readonly pages: Pages,
    private readonly history: TabHistory,
    private readonly views: TabViews,
    private readonly host: TabsHost,
  ) {}

  forgetShown(page: Page): void {
    this.shownTools.delete(page);
  }

  async show(
    page: Page,
    id: string | undefined,
    released?: Promise<void>,
  ): Promise<void> {
    const { storage } = this;
    const window = this.pages.windowOf(page);
    const active =
      window.tabs.find((tab) => tab.id === id) ?? window.tabs.at(0);
    this.host.save(
      storage.setLayout(withActive(storage.layout, window.id, active?.id)),
    );
    if (active !== undefined) {
      this.history.visit(active.id);
    }
    if (page.disposed) {
      return;
    }
    this.pages.showing(window.id, page);
    this.pages.postTabs(page);
    this.pages.postUnsentNotices(window.id, page);
    const shown = this.shownTools.get(page);
    if (active === undefined) {
      this.shownTools.delete(page);
    } else {
      this.shownTools.set(page, active.tool);
    }
    if (shown !== undefined && shown !== active?.tool) {
      this.tools[shown].hide(page);
    }
    if (active === undefined) {
      return;
    }
    if (released !== undefined) {
      await released;
      if (page.disposed || this.pages.windowOf(page).active !== active.id) {
        return;
      }
    }
    this.views.handTo(page, active.id);
    await this.tools[active.tool].show(page, active);
  }

  async close(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const window = this.pages.windowOf(page);
    const closed = window.tabs.find((tab) => tab.id === id);
    if (closed === undefined) {
      this.pages.postTabs(page);
      return;
    }
    const activeId = window.active;
    const layout = withClosed(storage.layout, id, this.history);
    const active = layout.find((each) => each.id === window.id)?.active;
    this.history.forget(id);
    this.host.save(storage.setLayout(layout));
    this.tools[closed.tool].closed(page, closed);
    this.views.drop(id);
    if (!layout.some((each) => each.id === window.id)) {
      this.host.closeWindow(window.id);
      this.pages.postWindows();
      return;
    }
    if (active === activeId && active !== undefined) {
      this.pages.postTabs(page);
      return;
    }
    await this.show(page, active);
  }

  async open(
    page: Page,
    tool: ToolId,
    roots: readonly (string | undefined)[],
    reuse: boolean,
    kind: Pick<Tab, 'view' | 'edit' | 'compare'> = {},
  ): Promise<void> {
    const { storage } = this;
    const window = this.pages.windowOf(page);
    const tabs = storage.savedTabs;
    const added: Tab[] = [];
    const opened: string[] = [];
    let next = Math.max(Number(nextTabId(storage.layout)), this.lastTabId + 1);
    for (const root of roots) {
      const existing = reuse
        ? [...tabs, ...added].find(
            (tab) =>
              tab.tool === tool &&
              tab.view === kind.view &&
              tab.edit === kind.edit &&
              tab.root !== undefined &&
              root !== undefined &&
              sameRoot(tab.root, root),
          )
        : undefined;
      if (existing !== undefined) {
        opened.push(existing.id);
        continue;
      }
      const tab: Tab = {
        id: String(next++),
        tool,
        ...(root !== undefined && { root }),
        ...kind,
      };
      added.push(tab);
      opened.push(tab.id);
    }
    this.lastTabId = Math.max(this.lastTabId, next - 1);
    this.host.save(
      storage.setLayout(withOpened(storage.layout, window.id, added)),
    );
    const live = page.disposed ? (this.pages.of(window.id) ?? page) : page;
    const last = opened.at(-1);
    if (last === undefined) {
      this.pages.postTabs(live);
      return;
    }
    const holder = windowOf(storage.layout, last);
    if (holder === undefined || holder.id === window.id) {
      await this.show(live, last);
      return;
    }
    this.host.showWindow(holder.id);
    const there = this.pages.live(holder.id);
    if (there === undefined) {
      this.host.save(
        storage.setLayout(withActive(storage.layout, holder.id, last)),
      );
      this.pages.postTabs(live);
      return;
    }
    await this.show(there, last);
  }

  async editViewed(page: Page, id: string): Promise<void> {
    const { storage } = this;
    const viewed = this.pages
      .windowOf(page)
      .tabs.find((tab) => tab.id === id && tab.view === true);
    if (viewed?.root === undefined) {
      return;
    }
    this.tools[viewed.tool].closed(page, viewed);
    this.views.drop(id);
    this.host.save(
      storage.setLayout(
        withChanged(storage.layout, {
          id,
          tool: viewed.tool,
          root: viewed.root,
          edit: true,
        }),
      ),
    );
    await this.show(page, id);
  }

  setRoot(id: string, root: string): void {
    const { storage } = this;
    const tab = storage.savedTabs.find(
      (each) => each.id === id && each.root !== root,
    );
    if (tab === undefined) {
      return;
    }
    this.host.save(
      storage.setLayout(withChanged(storage.layout, { ...tab, root })),
    );
    const page = this.pages.live(windowOf(storage.layout, id)?.id);
    if (page !== undefined) {
      this.pages.postTabs(page);
    }
  }
}
