import { bind, type Binding } from '../../lib/shared/keymap';
import { strings } from '../../lib/shared/strings';

export const everywhereGroups = ['Tabs', 'App', 'Lists'] as const;

export interface ShortcutGroup {
  readonly title: string;
  readonly bindings: readonly Binding<unknown>[];
}

export function shortcutGroupsOf<const Group extends string>(
  groups: readonly Group[],
  titles: Readonly<Record<Group, string>>,
  bindings: Readonly<Record<string, Binding<unknown>>>,
): ShortcutGroup[] {
  return groups.map((group) => ({
    title: titles[group],
    bindings: Object.values(bindings).filter(
      (binding) => binding.group === group,
    ),
  }));
}

export const shellKeymap = {
  newTab: bind('Tabs', strings.actions.newTab, {
    'Mod+T': true,
    'Mod+Shift+T': true,
  }),
  newWindow: bind('Tabs', strings.actions.newWindow, {
    'Mod+N': true,
    'Mod+Shift+N': true,
  }),
  openIn: bind('Tabs', strings.actions.openIn, { 'Mod+Shift+O': true }),
  tab: bind(
    'Tabs',
    strings.actions.tab,
    { 'Ctrl+Tab': 1, 'Ctrl+Shift+Tab': -1 },
    { repeats: true },
  ),
  closeTab: bind('Tabs', strings.actions.closeTab, {
    MiddleClick: true,
    'Mod+W': true,
    'Mod+Shift+W': true,
  }),
  moveTab: bind('Tabs', strings.actions.moveTab, {
    Drag: true,
  }),
  mainMenu: bind('App', strings.actions.mainMenu, { 'Alt+F': true }),
  dismissNotice: bind('App', strings.actions.dismissNotice, { Escape: true }),
  shortcuts: bind(
    'App',
    strings.actions.shortcuts,
    { F1: true, '?': true },
    { dialogs: true },
  ),
  about: bind(
    'App',
    strings.actions.about,
    { 'Shift+F1': true },
    { dialogs: true },
  ),
  devTools: bind(undefined, strings.actions.devTools, { 'Mod+Shift+I': true }),
  shortcutsTool: bind(
    undefined,
    strings.actions.shortcutsTool,
    { 'Ctrl+Tab': 1, 'Ctrl+Shift+Tab': -1 } as const,
    { repeats: true, fields: true },
  ),
  shortcutsGroup: bind(
    undefined,
    strings.actions.shortcutsGroup,
    { ArrowDown: 1, ArrowUp: -1 } as const,
    { repeats: true, fields: true },
  ),
  shortcutsPage: bind(
    undefined,
    strings.actions.shortcutsPage,
    { PageDown: 1, PageUp: -1 } as const,
    { repeats: true, fields: true },
  ),
};
