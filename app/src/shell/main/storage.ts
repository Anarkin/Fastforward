import { isObject } from '../../lib/main/json';
import type { FileColor } from '../../lib/shared/fileColors';
import type { Settings } from './settings';
import type { UserSettings } from './userSettings';
import type { ImageView, TextView } from '../shared/views';
import type { ToolId } from '../shared/tools';
import type { Layout } from './windows';
import type { Store } from './stateFile';
import { savedLayout, savedTabOf, sameTab, type SavedTab } from './savedTabs';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
export const windowsKey = 'windows';
const toolsKey = 'tools';
const commandOfferedKey = 'terminalCommandOffered';
export const maxRecentItems = 50;

const maxWheelRows = 50;

const textViewKeys = ['wordWrap', 'showWhitespace', 'highlightSyntax'] as const;

export class Storage {
  private read:
    | {
        readonly saved: unknown;
        readonly windows: unknown;
        readonly active: unknown;
        readonly layout: Layout;
        readonly tabs: readonly SavedTab[];
      }
    | undefined;

  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {}

  private get settings(): Settings {
    return this.userSettings.settings;
  }

  get layout(): Layout {
    return this.current().layout;
  }

  get savedTabs(): readonly SavedTab[] {
    return this.current().tabs;
  }

  private current(): NonNullable<Storage['read']> {
    const saved = this.state.get(tabsKey);
    const windows = this.state.get(windowsKey);
    const active = this.state.get(activeTabKey);
    const { read } = this;
    if (
      read !== undefined &&
      read.saved === saved &&
      read.windows === windows &&
      read.active === active
    ) {
      return read;
    }
    const ids = new Set<string>();
    const layout = savedLayout(
      (Array.isArray(saved)
        ? saved.flatMap((each) => savedTabOf(each) ?? [])
        : []
      ).filter((tab) => !ids.has(tab.id) && Boolean(ids.add(tab.id))),
      windows,
      active,
    );
    this.read = {
      saved,
      windows,
      active,
      layout,
      tabs: layout.flatMap((window) => window.tabs),
    };
    return this.read;
  }

  async setLayout(layout: Layout): Promise<void> {
    const tabs = layout.flatMap((window) => window.tabs);
    const saved = this.savedTabs;
    const tabsChanged =
      tabs.length !== saved.length ||
      tabs.some((tab, index) => !sameTab(tab, saved[index]));
    const windows = layout.map(({ id, tabs: own, active }) => ({
      id,
      tabs: own.map((tab) => tab.id),
      ...(active !== undefined && { active }),
    }));
    await Promise.all([
      tabsChanged
        ? this.state.update(
            tabsKey,
            tabs.map(({ id, tool, root, compare }) => ({
              id,
              tool,
              ...(root !== undefined && { root }),
              ...(compare !== undefined && {
                compare: { old: compare.old, new: compare.new },
              }),
            })),
          )
        : undefined,
      JSON.stringify(windows) === JSON.stringify(this.state.get(windowsKey))
        ? undefined
        : this.state.update(windowsKey, windows),
      this.state.get(activeTabKey) === undefined
        ? undefined
        : this.state.update(activeTabKey, undefined),
    ]);
  }

  get commandOffered(): boolean {
    return this.state.get(commandOfferedKey) === true;
  }

  async setCommandOffered(): Promise<void> {
    await this.state.update(commandOfferedKey, true);
  }

  get fileColors(): readonly FileColor[] {
    return this.settings.tools.commander.fileColors;
  }

  get dateFormat(): string {
    return this.settings.dateFormat;
  }

  get wheelRows(): number {
    const rows = this.settings.scrolling.wheelRows;
    return Number.isFinite(rows)
      ? Math.min(maxWheelRows, Math.max(1, Math.round(rows)))
      : 1;
  }

  get smoothScrolling(): boolean {
    return this.settings.scrolling.smooth;
  }

  get textView(): TextView {
    return this.settings.text;
  }

  async setTextView(view: TextView): Promise<void> {
    const { textView } = this;
    await Promise.all(
      textViewKeys
        .filter((key) => view[key] !== textView[key])
        .map((key) => this.userSettings.setText(key, view[key])),
    );
  }

  get imageView(): ImageView {
    return this.settings.tools.viewer;
  }

  async setImageView(view: ImageView): Promise<void> {
    if (view.realSize !== this.imageView.realSize) {
      await this.userSettings.setIn('viewer', 'realSize', view.realSize);
    }
  }

  get recentFolders(): number {
    const count = this.settings.tabs.recentFolders;
    return Number.isFinite(count)
      ? Math.min(maxRecentItems, Math.max(0, Math.round(count)))
      : 0;
  }
}

export function toolState(state: Store, tool: ToolId): Store {
  const tools = (): Record<string, unknown> => {
    const all = state.get(toolsKey);
    return isObject(all) ? all : {};
  };
  const own = (): Record<string, unknown> => {
    const saved = tools()[tool];
    return isObject(saved) ? { ...saved } : {};
  };
  return {
    get: (key) => own()[key],
    update: (key, value) => {
      const next = own();
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return state.update(toolsKey, { ...tools(), [tool]: next });
    },
  };
}
