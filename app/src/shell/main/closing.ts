import { confirmsClose, tools as toolIds, type ToolId } from '../shared/tools';
import type { Pages } from './pages';
import type { Page, Tab, Tool, Tools } from './shell';
import type { Storage } from './storage';
import { windowOf } from './windows';

export function quitNoteOf(
  tools: Readonly<Record<ToolId, Pick<Tool<ToolId>, 'quitNote'>>>,
): string | undefined {
  const notes = toolIds.flatMap((tool) => tools[tool].quitNote?.() ?? []);
  return notes.length === 0 ? undefined : notes.join(' ');
}

export class Closing {
  constructor(
    private readonly storage: Storage,
    private readonly tools: Tools,
    private readonly pages: Pages,
  ) {}

  asksBeforeQuit(): boolean {
    return (
      this.pages.all().length > 0 &&
      (this.storage.savedTabs.some((tab) => confirmsClose[tab.tool]) ||
        this.unsavedOf(this.storage.savedTabs).length > 0 ||
        quitNoteOf(this.tools) !== undefined)
    );
  }

  askToQuit(): void {
    const note = quitNoteOf(this.tools);
    const unsaved = this.namesOf(this.unsavedOf(this.storage.savedTabs));
    this.pages.shown()?.post({
      type: 'confirmQuit',
      ...(note !== undefined && { note }),
      ...(unsaved.length > 0 && { unsaved }),
    });
  }

  asksBeforeClosing(window: string): boolean {
    const tabs = this.tabsOfWindow(window);
    return (
      tabs.some((tab) => confirmsClose[tab.tool]) ||
      this.unsavedOf(tabs).length > 0
    );
  }

  askToCloseWindow(window: string): boolean {
    const page = this.pages.live(window);
    const unsaved = this.namesOf(this.unsavedOf(this.tabsOfWindow(window)));
    page?.post({
      type: 'confirmCloseWindow',
      ...(unsaved.length > 0 && { unsaved }),
    });
    return page !== undefined;
  }

  async savedAll(page: Page, tabs: readonly Tab[]): Promise<boolean> {
    for (const tab of this.unsavedOf(tabs)) {
      const holder = windowOf(this.storage.layout, tab.id);
      const shownIn =
        (holder === undefined ? undefined : this.pages.live(holder.id)) ?? page;
      if ((await this.tools[tab.tool].saveUnsaved?.(shownIn, tab)) !== true) {
        return false;
      }
    }
    return true;
  }

  private unsavedOf(tabs: readonly Tab[]): Tab[] {
    return tabs.filter((tab) => this.tools[tab.tool].unsaved?.(tab) === true);
  }

  private namesOf(tabs: readonly Tab[]): string[] {
    return this.pages.infos(tabs).map((info) => info.name);
  }

  private tabsOfWindow(window: string): readonly Tab[] {
    return this.storage.layout.find((each) => each.id === window)?.tabs ?? [];
  }
}
