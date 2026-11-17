import { isObject } from '../../lib/main/json';
import { isTool, type ToolId } from '../shared/tools';
import type { Layout, TabWindow } from './windows';

export interface Compared {
  readonly old: string;
  readonly new: string;
}

export interface FileVersion {
  readonly rev: string;
  readonly file: string;
}

export interface SavedTab {
  readonly id: string;
  readonly tool: ToolId;
  readonly root?: string;
  readonly compare?: Compared;
  readonly version?: FileVersion;
}

function isCompared(value: unknown): value is Compared {
  return (
    isObject(value) &&
    typeof value.old === 'string' &&
    typeof value.new === 'string'
  );
}

function isFileVersion(value: unknown): value is FileVersion {
  return (
    isObject(value) &&
    typeof value.rev === 'string' &&
    typeof value.file === 'string'
  );
}

function isSavedTab(value: unknown): value is SavedTab {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isTool(value.tool) &&
    (value.root === undefined || typeof value.root === 'string') &&
    (value.compare === undefined || isCompared(value.compare)) &&
    (value.version === undefined || isFileVersion(value.version))
  );
}

export function savedTabOf(value: unknown): SavedTab | undefined {
  if (isObject(value) && value.tool === 'git' && value.compare !== undefined) {
    return savedTabOf({ ...value, tool: 'diff' });
  }
  if (isObject(value) && value.tool === 'commander') {
    const { view, edit, ...rest } = value;
    if (view === true && edit === undefined) {
      return savedTabOf({ ...rest, tool: 'viewer' });
    }
    if (edit === true && view === undefined) {
      return savedTabOf({ ...rest, tool: 'editor' });
    }
  }
  return isSavedTab(value) &&
    !Object.hasOwn(value, 'view') &&
    !Object.hasOwn(value, 'edit')
    ? value
    : undefined;
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

export function savedLayout(
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

export function sameTab(a: SavedTab, b: SavedTab | undefined): boolean {
  return (
    b !== undefined &&
    a.id === b.id &&
    a.tool === b.tool &&
    a.root === b.root &&
    a.compare?.old === b.compare?.old &&
    a.compare?.new === b.compare?.new &&
    a.version?.rev === b.version?.rev &&
    a.version?.file === b.version?.file
  );
}
