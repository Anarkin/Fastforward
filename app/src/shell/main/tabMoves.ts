import type { ToHost } from '../shared/protocol';
import type { Point, Strip, Visit } from './hostTypes';
import type { Pages } from './pages';
import type { Page, ShellHost } from './shell';
import type { Storage } from './storage';
import type { TabHistory } from './tabHistory';
import { nextWindowId, windowOf, withMoved, type Emptied } from './windows';

export type TabMove = Extract<
  ToHost,
  {
    readonly type:
      | 'newWindow'
      | 'moveTabToWindow'
      | 'tearTab'
      | 'dragTabTo'
      | 'dropTab'
      | 'cancelTabDrag'
      | 'tabStrip'
      | 'visitIndex'
      | 'moveTab';
  }
>;

export interface TabMovesHost {
  show(page: Page, tab: string | undefined): Promise<void>;
  save(saving: Promise<void>): void;
}

function stripOf(message: Record<string, unknown>): Strip | undefined {
  const { left, right, top, bottom, firstTabLeft, tabTop } = message;
  return typeof left === 'number' &&
    typeof right === 'number' &&
    typeof top === 'number' &&
    typeof bottom === 'number' &&
    typeof firstTabLeft === 'number' &&
    typeof tabTop === 'number' &&
    [left, right, top, bottom, firstTabLeft, tabTop].every(Number.isFinite)
    ? { left, right, top, bottom, firstTabLeft, tabTop }
    : undefined;
}

function pointOf(x: unknown, y: unknown): Point | undefined {
  return typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y)
    ? { x, y }
    : undefined;
}

export class TabMoves {
  constructor(
    private readonly storage: Storage,
    private readonly shellHost: ShellHost,
    private readonly pages: Pages,
    private readonly history: TabHistory,
    private readonly host: TabMovesHost,
  ) {}

  async receive(page: Page, message: TabMove): Promise<void> {
    const { storage, shellHost } = this;
    switch (message.type) {
      case 'newWindow': {
        const window = nextWindowId(storage.layout);
        this.host.save(
          storage.setLayout([...storage.layout, { id: window, tabs: [] }]),
        );
        shellHost.openWindow(window, this.pages.windowOf(page).id);
        this.pages.postWindows();
        return;
      }
      case 'moveTabToWindow':
        await this.moveToWindow(page, message.tab, message.window);
        return;
      case 'tearTab': {
        const window = this.pages.windowOf(page);
        const index = window.tabs.findIndex((tab) => tab.id === message.tab);
        const grab = pointOf(message.grabX, message.grabY);
        const at = pointOf(message.screenX, message.screenY);
        if (index !== -1 && grab !== undefined && at !== undefined) {
          shellHost.drag(window.id, {
            kind: 'start',
            tab: message.tab,
            index,
            grab,
            at,
            alone: window.tabs.length === 1,
          });
        }
        return;
      }
      case 'dragTabTo': {
        const at = pointOf(message.screenX, message.screenY);
        if (at !== undefined) {
          shellHost.drag(this.pages.windowOf(page).id, { kind: 'move', at });
        }
        return;
      }
      case 'dropTab':
        shellHost.drag(this.pages.windowOf(page).id, { kind: 'drop' });
        return;
      case 'cancelTabDrag':
        shellHost.drag(this.pages.windowOf(page).id, { kind: 'cancel' });
        return;
      case 'tabStrip': {
        const strip = stripOf({ ...message });
        if (strip !== undefined) {
          shellHost.drag(this.pages.windowOf(page).id, {
            kind: 'strip',
            strip,
          });
        }
        return;
      }
      case 'visitIndex':
        if (Number.isSafeInteger(message.index) && message.index >= 0) {
          shellHost.drag(this.pages.windowOf(page).id, {
            kind: 'index',
            index: message.index,
          });
        }
        return;
      case 'moveTab': {
        const window = this.pages.windowOf(page);
        if (
          window.tabs.some((tab) => tab.id === message.tab) &&
          Number.isInteger(message.index) &&
          message.index >= 0 &&
          message.index < window.tabs.length
        ) {
          this.host.save(
            storage.setLayout(
              withMoved(
                storage.layout,
                message.tab,
                window.id,
                message.index,
                this.history,
              ),
            ),
          );
        }
        this.pages.postTabs(page);
        return;
      }
      default:
        return message satisfies never;
    }
  }

  async tearOff(tab: string, into: string): Promise<boolean> {
    const { layout } = this.storage;
    const from = windowOf(layout, tab);
    if (
      from === undefined ||
      from.tabs.length < 2 ||
      layout.some((window) => window.id === into)
    ) {
      return false;
    }
    await this.relocate(tab, from.id, into, 0, true);
    return true;
  }

  async moveTab(tab: string, into: string, index: number): Promise<void> {
    const { storage } = this;
    const from = windowOf(storage.layout, tab);
    if (
      from === undefined ||
      !storage.layout.some((window) => window.id === into)
    ) {
      return;
    }
    if (from.id !== into) {
      await this.relocate(tab, from.id, into, index, false, 'kept');
      return;
    }
    this.host.save(
      storage.setLayout(
        withMoved(storage.layout, tab, into, index, this.history),
      ),
    );
    const page = this.pages.live(into);
    if (page !== undefined) {
      this.pages.postTabs(page);
    }
  }

  visit(window: string, visit: Visit | undefined): void {
    const page = this.pages.live(window);
    const tab =
      visit === undefined
        ? undefined
        : this.storage.savedTabs.find((each) => each.id === visit.tab);
    const [info] = tab === undefined ? [] : this.pages.infos([tab]);
    page?.post(
      visit === undefined || info === undefined
        ? { type: 'tabVisit' }
        : {
            type: 'tabVisit',
            visit: { tab: info, x: visit.x, grabX: visit.grabX },
          },
    );
  }

  private async moveToWindow(
    page: Page,
    tab: unknown,
    target: unknown,
  ): Promise<void> {
    const { storage } = this;
    const from = this.pages.windowOf(page);
    if (
      typeof tab !== 'string' ||
      !from.tabs.some((each) => each.id === tab) ||
      (target === undefined
        ? from.tabs.length < 2
        : typeof target !== 'string' ||
          target === from.id ||
          !storage.layout.some((window) => window.id === target))
    ) {
      this.pages.postTabs(page);
      return;
    }
    if (typeof target === 'string') {
      this.shellHost.showWindow(target);
      await this.relocate(
        tab,
        from.id,
        target,
        storage.layout.find((window) => window.id === target)?.tabs.length ?? 0,
        false,
      );
      return;
    }
    const into = nextWindowId(storage.layout);
    const moving = this.relocate(tab, from.id, into, 0, true);
    this.shellHost.openWindow(into, from.id);
    await moving;
  }

  private async relocate(
    tab: string,
    from: string,
    into: string,
    index: number,
    added: boolean,
    emptied: Emptied = 'closed',
  ): Promise<void> {
    const { storage } = this;
    const before = added
      ? [...storage.layout, { id: into, tabs: [] }]
      : storage.layout;
    const layout = withMoved(before, tab, into, index, this.history, emptied);
    this.host.save(storage.setLayout(layout));
    const there = this.pages.live(into);
    const shown = there === undefined ? undefined : this.host.show(there, tab);
    const left = layout.find((window) => window.id === from);
    if (left === undefined) {
      this.shellHost.closeWindow(from);
      this.pages.postWindows();
      await shown;
      return;
    }
    const page = this.pages.live(from);
    await Promise.all([
      shown,
      page === undefined ? undefined : this.host.show(page, left.active),
    ]);
  }
}
