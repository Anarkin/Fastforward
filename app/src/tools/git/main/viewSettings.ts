import type { GitToHost } from '../shared/protocol';
import type { AutoFetch } from './autoFetch';
import type { CompareTabs } from './compareTabs';
import type { Contexts } from './contexts';
import type { Diffs } from './diffs';
import type { Refreshes } from './refreshes';
import type { GitStorage } from './storage';
import type { Context, Session, TabWork } from './tabContext';
import { forgetHistory, type TabState } from './tabState';

export type ViewSetting = Extract<
  GitToHost,
  {
    readonly type:
      | 'setColumnWidths'
      | 'setShowAllFiles'
      | 'setCollapseMerges'
      | 'setShowEntireFile'
      | 'setAutoFetch'
      | 'setDiffLayout'
      | 'setIgnoreWhitespace';
  }
>;

export class ViewSettings {
  private collapseMerges: boolean;
  private soloDefault: boolean;

  constructor(
    private readonly storage: GitStorage,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly autoFetch: () => AutoFetch,
    private readonly compareTabs: CompareTabs,
    private readonly diffs: Diffs,
    private readonly refreshes: Refreshes,
    private readonly contexts: Contexts,
    private readonly save: (saving: Promise<void>) => void,
  ) {
    this.collapseMerges = storage.collapseMerges;
    this.soloDefault = storage.soloDefault;
  }

  reloaded(): void {
    const collapseChanged = this.storage.collapseMerges !== this.collapseMerges;
    const soloChanged = this.storage.soloDefault !== this.soloDefault;
    this.collapseMerges = this.storage.collapseMerges;
    this.soloDefault = this.storage.soloDefault;
    for (const tab of this.tabStates.values()) {
      if (soloChanged) {
        forgetHistory(tab);
      } else {
        tab.shownStale = true;
      }
      tab.opened = false;
      if (collapseChanged) {
        tab.toggledMerges.clear();
      }
    }
  }

  async receive(session: Session, message: ViewSetting): Promise<void> {
    const { storage } = this;
    switch (message.type) {
      case 'setColumnWidths':
        this.save(storage.setColumnWidths(message.widths));
        return;
      case 'setShowAllFiles':
        this.save(storage.setShowAllFiles(message.show));
        return;
      case 'setCollapseMerges': {
        this.save(storage.setCollapseMerges(message.collapse));
        this.collapseMerges = message.collapse;
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          tab.shownStale = true;
        }
        const context = await this.contexts.context(session);
        if (context) {
          await this.refreshes.sendShownHistory(context);
        }
        return;
      }
      case 'setShowEntireFile': {
        this.save(storage.setShowEntireFile(message.show));
        await this.compareTabs.sendCompare(session);
        const context = await this.contexts.context(session);
        this.staleDiffs(context, (tab) => tab.path !== undefined);
        if (context?.tab.hash !== undefined && context.tab.path !== undefined) {
          await this.diffs.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setAutoFetch':
        this.save(storage.setAutoFetch(message.on));
        this.autoFetch().update(message.on);
        return;
      case 'setDiffLayout':
        this.save(storage.setDiffLayout(message.layout));
        return;
      case 'setIgnoreWhitespace': {
        this.save(storage.setIgnoreWhitespace(message.ignore));
        await this.compareTabs.sendCompare(session);
        const context = await this.contexts.context(session);
        this.staleDiffs(context, () => true);
        if (context?.tab.hash !== undefined) {
          await this.diffs.sendDiff(context, context.tab.hash);
        }
        return;
      }
      default:
        return message satisfies never;
    }
  }

  private staleDiffs(
    active: Context | undefined,
    affected: (tab: TabState) => boolean,
  ): void {
    for (const tab of this.tabStates.values()) {
      if (tab !== active?.tab && tab.hash !== undefined && affected(tab)) {
        tab.diffStale = true;
      }
    }
  }
}
