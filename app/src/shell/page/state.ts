import type { PathMenuAsk } from '../../lib/page/pathMenu';
import type { ContextMenuItem, OpenMenu } from '../../lib/page/contextMenuItem';
import { defaultDateFormat } from '../../lib/page/dates';
import { noFileColors, type FileColors } from '../../lib/page/fileColors';
import type { KnownLooks } from '../../lib/page/pathLooks';
import { defaultImageView } from './imageView';
import {
  defaultScrolling,
  type ScrollSettings,
} from '../../lib/page/scrollSettings';
import { defaultTextView } from './textView';
import type {
  AboutInfo,
  TabInfo,
  ToWebview,
  ToWebviewOf,
  StripPlace,
  TabVisit,
  UpdateStatus,
  WindowInfo,
} from '../shared/protocol';
import type { ImageView, TextView } from '../shared/views';
import type { ToolId } from '../shared/tools';
import type { Notice } from './noticeFading';
import type { Confirming } from './confirming';
import type { ToolChannels } from './toolChannels';
import type { Popup } from './popups';
import type { TabMenu } from './openedMenu';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ShellSource {
  readonly tabs: readonly TabInfo[] | undefined;
  readonly active: string | undefined;
  readonly windows: readonly WindowInfo[];
  readonly tearsOff: boolean;
  readonly visit: TabVisit | undefined;
  readonly notices: readonly Notice[];
  readonly update: UpdateStatus;
  readonly about: AboutInfo | undefined;
  readonly installsCommand: boolean;
  readonly dateFormat: string;
  readonly fileColors: FileColors;
  readonly partLooks: KnownLooks;
  readonly scrolling: ScrollSettings;
  readonly textView: TextView;
  readonly imageView: ImageView;
  readonly choosing: ToWebviewOf<'chooseTool'> | undefined;
  readonly popups: readonly Popup[];
  readonly confirming: Confirming | undefined;
  readonly menu: TabMenu | undefined;
  readonly pathMenu:
    { readonly id: number; readonly menu: OpenMenu } | undefined;
  readonly toolItems: Partial<Record<ToolId, readonly ContextMenuItem[]>>;
  readonly toolTitles: Partial<Record<ToolId, string>>;
}

export interface ShellActions {
  readonly receive: (message: ToWebview) => void;
  readonly channels: ToolChannels;
  readonly dismissNotice: (id: number) => void;
  readonly restartNotices: (ids?: readonly number[]) => void;
  readonly showPopup: (popup: Popup, open: boolean) => void;
  readonly togglePopup: (popup: Popup) => void;
  readonly showMenu: (menu: OpenMenu) => void;
  readonly closeMenu: () => void;
  readonly openPathMenu: (ask: PathMenuAsk) => void;
  readonly closePathMenu: () => void;
  readonly closeTab: (id: string) => void;
  readonly viewEdited: (id: string, at: number) => void;
  readonly confirm: () => void;
  readonly dontSave: () => void;
  readonly cancel: () => void;
  readonly openWith: (tool: ToolId | undefined) => void;
  readonly moveTab: (id: string, index: number) => void;
  readonly moveTabToWindow: (id: string, window?: string) => void;
  readonly tearTab: (id: string, grab: ScreenPoint, at: ScreenPoint) => void;
  readonly dragTabTo: (at: ScreenPoint) => void;
  readonly dropTab: () => void;
  readonly cancelTabDrag: () => void;
  readonly reportStrip: (strip: StripPlace) => void;
  readonly visitIndex: (index: number) => void;
  readonly setToolItems: (
    tool: ToolId,
    items: readonly ContextMenuItem[],
  ) => void;
  readonly setToolTitle: (tool: ToolId, title: string | undefined) => void;
  readonly changeTextView: (change: Partial<TextView>) => void;
  readonly toggleTextView: (key: 'wordWrap' | 'showWhitespace') => void;
  readonly changeImageView: (change: Partial<ImageView>) => void;
  readonly copyText: (text: string) => void;
  readonly askLooks: (path: string) => void;
  readonly ready: () => void;
  readonly log: (message: string) => void;
  readonly selectTab: (id: string) => void;
  readonly preloadTab: (id: string) => void;
  readonly newTab: (tool: ToolId) => void;
  readonly newWindow: () => void;
  readonly openSettings: () => void;
  readonly openDefaultSettings: () => void;
  readonly checkForUpdates: () => void;
  readonly installUpdate: () => void;
  readonly installTerminalCommand: () => void;
  readonly openIn: () => void;
}

export type ShellState = ShellSource & ShellActions;

export const shellDefaults: ShellSource = {
  tabs: undefined,
  active: undefined,
  windows: [],
  tearsOff: false,
  visit: undefined,
  notices: [],
  update: { kind: 'idle' },
  about: undefined,
  installsCommand: false,
  dateFormat: defaultDateFormat,
  fileColors: noFileColors,
  partLooks: new Map(),
  scrolling: defaultScrolling,
  textView: defaultTextView,
  imageView: defaultImageView,
  choosing: undefined,
  popups: [],
  confirming: undefined,
  menu: undefined,
  pathMenu: undefined,
  toolItems: {},
  toolTitles: {},
};
