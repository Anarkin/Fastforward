import type { Sentence } from '../../lib/shared/sentences';
import {
  diffLayouts,
  type GitToHost,
  type GitToWebview,
} from '../../tools/git/shared/protocol';
import type { GitSettings } from '../../tools/git/shared/settings';
import type { DiffSettings } from '../../components/diff/shared/settings';
import {
  editorCharsets,
  editorEndings,
  indentStyles,
  type EditorSettings,
} from '../../tools/editor/shared/settings';
import type { ImageView } from './views';
import type {
  CommanderToHost,
  CommanderToWebview,
} from '../../tools/commander/shared/protocol';
import { type CommanderSettings } from '../../tools/commander/shared/settings';
import { fileColorProblems } from '../../tools/commander/shared/fileColors';
import { groupStandIns } from '../../lib/shared/fileColors';
import { sortColumns } from '../../tools/commander/shared/sorts';
import type {
  EditorToHost,
  EditorToWebview,
} from '../../tools/editor/shared/protocol';
import type {
  DiffToHost,
  DiffToWebview,
} from '../../tools/diff/shared/protocol';
import type {
  ViewerToHost,
  ViewerToWebview,
} from '../../tools/viewer/shared/protocol';
import type {
  TerminalToHost,
  TerminalToWebview,
} from '../../tools/terminal/shared/protocol';
import {
  renderers,
  type TerminalSettings,
} from '../../tools/terminal/shared/settings';

export const tools = [
  'terminal',
  'commander',
  'git',
  'viewer',
  'editor',
  'diff',
] as const;

export type ToolId = (typeof tools)[number];

export const folderTools = [
  'terminal',
  'commander',
  'git',
] as const satisfies readonly ToolId[];

export const toolSections = [
  'commander',
  'viewer',
  'diff',
  'editor',
  'git',
  'terminal',
] as const;

export type ToolSection = (typeof toolSections)[number];

export const confirmsClose: Readonly<Record<ToolId, boolean>> = {
  terminal: true,
  commander: false,
  git: false,
  viewer: false,
  editor: false,
  diff: false,
};

export function isTool(value: unknown): value is ToolId {
  return tools.some((tool) => tool === value);
}

interface ToolMessages {
  readonly terminal: {
    readonly toHost: TerminalToHost;
    readonly toWebview: TerminalToWebview;
  };
  readonly commander: {
    readonly toHost: CommanderToHost;
    readonly toWebview: CommanderToWebview;
  };
  readonly git: {
    readonly toHost: GitToHost;
    readonly toWebview: GitToWebview;
  };
  readonly viewer: {
    readonly toHost: ViewerToHost;
    readonly toWebview: ViewerToWebview;
  };
  readonly editor: {
    readonly toHost: EditorToHost;
    readonly toWebview: EditorToWebview;
  };
  readonly diff: {
    readonly toHost: DiffToHost;
    readonly toWebview: DiffToWebview;
  };
}

export type ToolToHost = {
  readonly [K in ToolId]: {
    readonly type: 'tool';
    readonly tool: K;
    readonly message: ToolMessages[K]['toHost'];
  };
}[ToolId];

export type ToolToWebview = {
  readonly [K in ToolId]: {
    readonly type: 'tool';
    readonly tool: K;
    readonly message: ToolMessages[K]['toWebview'];
  };
}[ToolId];

export type ToHostOf<K extends ToolId> = ToolMessages[K]['toHost'];

export type ToWebviewOfTool<K extends ToolId> = ToolMessages[K]['toWebview'];

export interface ThemeColors {
  readonly light: Readonly<Record<string, string>>;
  readonly dark: Readonly<Record<string, string>>;
}

interface Themed {
  readonly colors: ThemeColors;
}

export interface ToolSettings {
  readonly commander: CommanderSettings & Themed;
  readonly viewer: ImageView;
  readonly diff: DiffSettings;
  readonly editor: EditorSettings;
  readonly git: GitSettings & Themed;
  readonly terminal: TerminalSettings & Themed;
}

export const toolSettingChoices: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ['tools.diff.diffLayout', diffLayouts],
    ['tools.editor.endOfLine', editorEndings],
    ['tools.editor.charset', editorCharsets],
    ['tools.editor.indentStyle', indentStyles],
    ['tools.terminal.renderer', renderers],
    ['tools.commander.sort.left.column', sortColumns],
    ['tools.commander.sort.right.column', sortColumns],
  ]);

export const toolSettingListKinds: ReadonlyMap<string, 'string'> = new Map([
  ['tools.terminal.shellArgs', 'string'],
  ['tools.commander.bookmarks', 'string'],
]);

export const toolSettingStandIns: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ['tools.commander.fileColors[].extensions', groupStandIns],
  ]);

export function toolSettingProblems(settings: ToolSettings): Sentence[] {
  return fileColorProblems(settings.commander.fileColors);
}
