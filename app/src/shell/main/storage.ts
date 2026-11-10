import * as fs from 'node:fs';
import {
  isObject,
  readText,
  writeAtomically,
  type Settings,
  type UserSettings,
} from './settings';
import type { ImageView, TextView } from '../shared/protocol';
import * as path from 'node:path';
import { strings, type Sentence } from '../../shared/strings';
import { isTool, type ToolId } from '../shared/tools';
import type { Layout, TabWindow } from './windows';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
export const windowsKey = 'windows';
const toolsKey = 'tools';
const commandOfferedKey = 'terminalCommandOffered';
export const maxRecentItems = 50;

const maxWheelRows = 50;

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

const textViewKeys = ['wordWrap', 'showWhitespace', 'highlightSyntax'] as const;

export class JsonFileStore implements Store {
  readonly problems: readonly Sentence[];
  private values: Record<string, unknown>;
  private unreadable: boolean;
  private readonly changedUnread = new Map<string, Change>();
  private writing: Promise<void> = Promise.resolve();
  private waiting = false;

  constructor(
    private readonly file: string,
    migrate?: (
      values: Record<string, unknown>,
    ) => Record<string, unknown> | undefined,
  ) {
    const { values, problem } = readJson(file);
    const migrated = values === undefined ? undefined : migrate?.(values);
    this.values = migrated ?? values ?? {};
    this.unreadable = values === undefined;
    this.problems = problem === undefined ? [] : [problem];
    if (migrated !== undefined) {
      void this.save();
    }
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
    return this.save();
  }

  private save(): Promise<void> {
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
  problem?: Sentence;
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
      (Array.isArray(saved) ? saved.filter(isSavedTab) : []).filter(
        (tab) => !ids.has(tab.id) && Boolean(ids.add(tab.id)),
      ),
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
            tabs.map(({ id, tool, root, view, compare }) => ({
              id,
              tool,
              ...(root !== undefined && { root }),
              ...(view === true && { view }),
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
    return this.settings.images;
  }

  async setImageView(view: ImageView): Promise<void> {
    if (view.realSize !== this.imageView.realSize) {
      await this.userSettings.setImages('realSize', view.realSize);
    }
  }

  get recentFolders(): number {
    const count = this.settings.tabs.recentFolders;
    return Number.isFinite(count)
      ? Math.min(maxRecentItems, Math.max(0, Math.round(count)))
      : 0;
  }
}

export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

export interface Compared {
  readonly old: string;
  readonly new: string;
}

export interface SavedTab {
  readonly id: string;
  readonly tool: ToolId;
  readonly root?: string;
  readonly view?: true;
  readonly compare?: Compared;
}

function isCompared(value: unknown): value is Compared {
  return (
    isObject(value) &&
    typeof value.old === 'string' &&
    typeof value.new === 'string'
  );
}

function isSavedTab(value: unknown): value is SavedTab {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isTool(value.tool) &&
    (value.root === undefined || typeof value.root === 'string') &&
    (value.view === undefined || value.view === true) &&
    (value.compare === undefined || isCompared(value.compare))
  );
}

interface SavedWindow {
  readonly id: string;
  readonly tabs: readonly unknown[];
  readonly active?: unknown;
}

function isSavedWindow(value: unknown): value is SavedWindow {
  return (
    isObject(value) && typeof value.id === 'string' && Array.isArray(value.tabs)
  );
}

function windowWith(
  id: string,
  tabs: readonly SavedTab[],
  active: unknown,
): TabWindow {
  return {
    id,
    tabs,
    ...(typeof active === 'string' &&
      tabs.some((tab) => tab.id === active) && { active }),
  };
}

function savedLayout(
  tabs: readonly SavedTab[],
  windows: unknown,
  active: unknown,
): Layout {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const placed = new Set<string>();
  const ids = new Set<string>();
  const saved = (Array.isArray(windows) ? windows : [])
    .filter(isSavedWindow)
    .filter((window) => !ids.has(window.id) && Boolean(ids.add(window.id)));
  const layout = saved.map((window) => {
    const own = window.tabs.flatMap((id) => {
      const tab = typeof id === 'string' ? byId.get(id) : undefined;
      if (tab === undefined || placed.has(tab.id)) {
        return [];
      }
      placed.add(tab.id);
      return [tab];
    });
    return windowWith(window.id, own, window.active);
  });
  const left = tabs.filter((tab) => !placed.has(tab.id));
  const [first, ...rest] = layout;
  return first === undefined
    ? [windowWith('1', left, active)]
    : [{ ...first, tabs: [...first.tabs, ...left] }, ...rest];
}

function sameTab(a: SavedTab, b: SavedTab | undefined): boolean {
  return (
    b !== undefined &&
    a.id === b.id &&
    a.tool === b.tool &&
    a.root === b.root &&
    a.view === b.view &&
    a.compare?.old === b.compare?.old &&
    a.compare?.new === b.compare?.new
  );
}

const gitStateOfVersion22 = [
  'recentRepositories',
  'solo',
  'bookmarks',
  'activeWorktrees',
  'lastFetches',
  'remoteTags',
];

const droppedStateOfVersion22 = ['tabsGrouped'];

export function migratedState(
  values: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const moved = gitStateOfVersion22.filter((key) => values[key] !== undefined);
  const dropped = droppedStateOfVersion22.filter(
    (key) => values[key] !== undefined,
  );
  const saved: unknown = values[tabsKey];
  const tabs: readonly unknown[] = Array.isArray(saved) ? saved : [];
  const roots = tabs.filter((tab) => typeof tab === 'string');
  if (moved.length + dropped.length + roots.length === 0) {
    return undefined;
  }
  const result = { ...values };
  for (const key of [...moved, ...dropped]) {
    delete result[key];
  }
  if (moved.length > 0) {
    const tools = isObject(values[toolsKey]) ? values[toolsKey] : {};
    result[toolsKey] = {
      ...tools,
      git: {
        ...Object.fromEntries(moved.map((key) => [key, values[key]])),
        ...(isObject(tools.git) ? tools.git : {}),
      },
    };
  }
  if (roots.length > 0) {
    const ids = tabs.filter(isSavedTab).map((tab) => Number(tab.id));
    let next = Math.max(0, ...ids.filter(Number.isInteger)) + 1;
    const migratedTabs = tabs.map((tab) =>
      typeof tab === 'string'
        ? { id: String(next++), tool: 'git', root: tab }
        : tab,
    );
    result[tabsKey] = migratedTabs;
    const activeTab = migratedTabs[tabs.indexOf(values[activeTabKey])];
    if (typeof values[activeTabKey] === 'string' && isSavedTab(activeTab)) {
      result[activeTabKey] = activeTab.id;
    }
  }
  return result;
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
