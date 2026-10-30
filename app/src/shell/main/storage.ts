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
export const maxRecentItems = 50;

export interface Store {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
}

interface Change {
  readonly keys: readonly string[];
  readonly value: unknown;
}

function changesOf(
  keys: readonly string[],
  before: unknown,
  after: unknown,
): Change[] {
  if (!isObject(after) || (before !== undefined && !isObject(before))) {
    return [{ keys, value: after }];
  }
  const was = isObject(before) ? before : {};
  return [...new Set([...Object.keys(was), ...Object.keys(after)])]
    .filter((key) => was[key] !== after[key])
    .flatMap((key) => changesOf([...keys, key], was[key], after[key]));
}

function withChange(
  values: Record<string, unknown>,
  { keys, value }: Change,
): Record<string, unknown> {
  const [key, ...rest] = keys;
  const result = { ...values };
  const inner =
    rest.length === 0
      ? value
      : withChange(isObject(values[key]) ? values[key] : {}, {
          keys: rest,
          value,
        });
  if (inner === undefined) {
    delete result[key];
  } else {
    result[key] = inner;
  }
  return result;
}

export class JsonFileStore implements Store {
  readonly problems: readonly string[];
  private values: Record<string, unknown>;
  private unreadable: boolean;
  private readonly changedUnread = new Map<string, Change>();
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
      this.changeUnread(key, value);
    } else if (value === undefined) {
      delete this.values[key];
    } else {
      this.values[key] = value;
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

  private changeUnread(key: string, value: unknown): void {
    for (const change of changesOf([key], this.values[key], value)) {
      const id = JSON.stringify(change.keys);
      this.changedUnread.delete(id);
      this.changedUnread.set(id, change);
    }
    const { values } = readJson(this.file);
    this.unreadable = values === undefined;
    this.values = [...this.changedUnread.values()].reduce(
      withChange,
      values ?? {},
    );
    if (!this.unreadable) {
      this.changedUnread.clear();
    }
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

  get recentItems(): number {
    const count = this.settings.recentItems;
    return Number.isFinite(count)
      ? Math.min(maxRecentItems, Math.max(0, Math.round(count)))
      : 0;
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
