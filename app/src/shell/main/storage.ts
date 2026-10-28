import * as fs from 'node:fs';
import {
  isObject,
  readText,
  writeAtomically,
  type Settings,
  type UserSettings,
} from './settings';
import * as path from 'node:path';
import { strings } from '../../shared/strings';
import { isTool, type ToolId } from '../shared/tools';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
const toolsKey = 'tools';
const commandOfferedKey = 'terminalCommandOffered';

export interface Store {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
}

export class JsonFileStore implements Store {
  readonly problems: readonly string[];
  private values: Record<string, unknown>;
  private unreadable: boolean;
  private readonly removedUnread = new Set<string>();
  private writing: Promise<void> = Promise.resolve();
  private waiting = false;

  constructor(private readonly file: string) {
    const { values, problem } = readJson(file);
    this.values = values ?? {};
    this.unreadable = values === undefined;
    this.problems = problem === undefined ? [] : [problem];
  }

  get(key: string): unknown {
    return this.values[key];
  }

  update(key: string, value: unknown): Promise<void> {
    if (this.unreadable) {
      const { values } = readJson(this.file);
      if (values !== undefined) {
        this.values = { ...values, ...this.values };
        for (const removed of this.removedUnread) {
          delete this.values[removed];
        }
        this.removedUnread.clear();
        this.unreadable = false;
      }
    }
    if (value === undefined) {
      delete this.values[key];
      if (this.unreadable) {
        this.removedUnread.add(key);
      }
    } else {
      this.values[key] = value;
      this.removedUnread.delete(key);
    }
    if (!this.waiting && !this.unreadable) {
      this.waiting = true;
      this.writing = this.writing
        .catch(() => undefined)
        .then(() => {
          this.waiting = false;
          return writeAtomically(
            this.file,
            JSON.stringify(this.values, undefined, 2),
          );
        });
    }
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }
}

function readJson(file: string): {
  values: Record<string, unknown> | undefined;
  problem?: string;
} {
  const text = readText(file);
  if (text === undefined) {
    return { values: {} };
  }
  if (text instanceof Error) {
    return {
      values: undefined,
      problem: strings.state.unreadable(text.message),
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) {
      return { values: { ...parsed } };
    }
  } catch {}
  const copy = `${file}.corrupt`;
  try {
    fs.copyFileSync(file, copy);
  } catch (error) {
    return {
      values: {},
      problem: strings.state.notPutAside(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
  return { values: {}, problem: strings.state.putAside(copy) };
}

export class Storage {
  private read:
    { readonly saved: unknown; readonly tabs: readonly SavedTab[] } | undefined;

  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {}

  private get settings(): Settings {
    return this.userSettings.settings;
  }

  get savedTabs(): readonly SavedTab[] {
    const saved = this.state.get(tabsKey);
    const { read } = this;
    if (read !== undefined && read.saved === saved) {
      return read.tabs;
    }
    const ids = new Set<string>();
    const tabs = (Array.isArray(saved) ? saved.filter(isSavedTab) : []).filter(
      (tab) => !ids.has(tab.id) && Boolean(ids.add(tab.id)),
    );
    this.read = { saved, tabs };
    return tabs;
  }

  get activeTabId(): string | undefined {
    const active = this.state.get(activeTabKey);
    return typeof active === 'string' ? active : undefined;
  }

  async setSavedTabs(
    tabs: readonly SavedTab[],
    active: string | undefined,
  ): Promise<void> {
    const saved = this.savedTabs;
    const tabsChanged =
      tabs.length !== saved.length ||
      tabs.some((tab, index) => !sameTab(tab, saved[index]));
    await Promise.all([
      tabsChanged
        ? this.state.update(
            tabsKey,
            tabs.map(({ id, tool, root }) => ({
              id,
              tool,
              ...(root !== undefined && { root }),
            })),
          )
        : undefined,
      active === this.activeTabId
        ? undefined
        : this.state.update(activeTabKey, active),
    ]);
  }

  get commandOffered(): boolean {
    return this.state.get(commandOfferedKey) === true;
  }

  async setCommandOffered(): Promise<void> {
    await this.state.update(commandOfferedKey, true);
  }

  get autoSortTabs(): boolean {
    return this.settings.autoSortTabs;
  }

  async setAutoSortTabs(on: boolean): Promise<void> {
    await this.userSettings.set('autoSortTabs', on);
  }
}

export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

export interface SavedTab {
  readonly id: string;
  readonly tool: ToolId;
  readonly root?: string;
}

function isSavedTab(value: unknown): value is SavedTab {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isTool(value.tool) &&
    (value.root === undefined || typeof value.root === 'string')
  );
}

function sameTab(a: SavedTab, b: SavedTab | undefined): boolean {
  return (
    b !== undefined && a.id === b.id && a.tool === b.tool && a.root === b.root
  );
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
