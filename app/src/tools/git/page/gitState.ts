import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import type { Search, SearchOptions } from '../../../lib/shared/searchOptions';
import type { CloneAsk, CloneView } from '../shared/clone';
import type {
  Bookmark,
  ChangeArea,
  CheckoutTarget,
  Direction,
  CompareView,
  DiffLayout,
  GitToWebview,
  GitToWebviewOf,
  LastFetch,
  RefInfo,
  RepositoryInfo,
  TextRequest,
  WorktreeInfo,
} from '../shared/protocol';
import type { ColumnName } from './activeColumn';
import type { ChosenFolder, CloneTarget } from './cloneForm';
import type { LoadedText } from './sideTexts';
import type { ViewedSource } from './viewedSource';
import type { MenuTarget } from './menus';
import type { RefGroup } from './refIndex';
import type { FilterFolds, Folders, ViewFolders } from './viewFolders';
import type { MovedCursor } from './filesCursor';
import { emptyTabView, type TabAction, type TabView } from './tabView';
import type { WrapColumns } from './rowMeasures';
import type { TextMeasures } from './textLayout';
import type { CodeSnap } from './codeSnap';
import type { DiffPlace } from './diffPlace';
import type { Highlighted } from './locationHighlight';
import type { KeptFocus } from '../../../lib/page/keptFocus';

export interface ComparedTexts {
  readonly tab: string | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
}

export interface KeptFind {
  readonly finding: boolean;
  readonly search: Search;
}

type FoundCommits = Pick<TabView, 'commitSearch' | 'hashLookup'>;

export interface KeptLocations {
  readonly highlight: Highlighted | undefined;
  readonly toggled: ReadonlySet<string>;
}

export interface KeptPin {
  readonly hash: string;
  readonly byKey: boolean;
}

export interface Cloning {
  readonly view: CloneView | undefined;
  readonly form: number;
  readonly folder: ChosenFolder | undefined;
  readonly target: CloneTarget | undefined;
}

export interface GitSource {
  readonly tab: TabView;
  readonly worktrees: readonly WorktreeInfo[] | undefined;
  readonly bookmarks: readonly Bookmark[];
  readonly hideDimmed: boolean;
  readonly columnWidths: readonly number[];
  readonly defaultColumnWidths: readonly number[];
  readonly collapseMerges: boolean;
  readonly showEntireFile: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly showAllFiles: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly solo: boolean;
  readonly compare: CompareView | undefined;
  readonly compareTexts: ComparedTexts;
  readonly recent: readonly RepositoryInfo[];
  readonly initAsked: GitToWebviewOf<'confirmInit'> | undefined;
  readonly clone: Cloning;
  readonly lastFetch: LastFetch;
  readonly commitsHidden: ReadonlySet<string>;
  readonly searching: ReadonlySet<string>;
  readonly pickedLanguages: ReadonlyMap<
    string,
    { readonly key: string; readonly language: string }
  >;
  readonly activeColumns: ReadonlyMap<string, ColumnName>;
  readonly fileFilters: ReadonlyMap<string, Search>;
  readonly searches: ReadonlyMap<string, Search>;
  readonly diffFinds: ReadonlyMap<string, KeptFind>;
  readonly foundCommits: ReadonlyMap<string, FoundCommits>;
  readonly folders: ReadonlyMap<string, ViewFolders>;
  readonly fileFolds: ReadonlyMap<string, FilterFolds>;
  readonly fileCursors: ReadonlyMap<string, MovedCursor>;
  readonly pinnedMessages: ReadonlyMap<string, KeptPin>;
  readonly locations: ReadonlyMap<string, KeptLocations>;
  readonly diffText: TextMeasures | undefined;
  readonly diffSnap: CodeSnap;
  readonly wrapColumns: WrapColumns | undefined;
}

export interface GitCollections {
  readonly bookmarked: ReadonlySet<string>;
  readonly tagsOnRemote: ReadonlySet<string>;
  readonly elsewhere: ReadonlySet<string>;
  readonly refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  readonly stashCommits: ReadonlySet<string>;
  readonly refIndex: readonly RefGroup[];
}

export interface GitActions {
  readonly receive: (message: GitToWebview) => void;
  readonly dispatch: (action: TabAction) => void;
  readonly changeBookmarks: (bookmarks: readonly Bookmark[]) => void;
  readonly pull: () => void;
  readonly push: () => void;
  readonly pullBranch: (name: string) => void;
  readonly pushBranch: (name: string) => void;
  readonly pushTag: (name: string) => void;
  readonly changeShowEntireFile: (show: boolean) => void;
  readonly changeIgnoreWhitespace: (ignore: boolean) => void;
  readonly changeDiffLayout: (layout: DiffLayout) => void;
  readonly changeShowAllFiles: (show: boolean) => void;
  readonly changeCollapseMerges: (collapse: boolean) => void;
  readonly changeAutoFetch: (on: boolean) => void;
  readonly changeSolo: (solo: boolean) => void;
  readonly resizeColumns: (widths: readonly number[]) => void;
  readonly resetColumn: (index: number) => void;
  readonly loadCompareTexts: (requests: readonly TextRequest[]) => void;
  readonly forgetRecent: (root: string) => void;
  readonly answerInit: (confirmed: boolean) => void;
  readonly closeClone: () => void;
  readonly selectCommit: (
    next: string | undefined,
    replace?: boolean,
    repeat?: boolean,
  ) => void;
  readonly compareCommit: (added: string) => void;
  readonly selectFile: (path: string | undefined, area?: ChangeArea) => void;
  readonly navigate: (direction: Direction, steps: number) => void;
  readonly jump: (hash: string | undefined) => void;
  readonly showUpstream: () => void;
  readonly showParent: () => void;
  readonly lookupHash: (query: string) => () => void;
  readonly searchCommits: (query: string, options: SearchOptions) => () => void;
  readonly fetch: () => void;
  readonly toggleMerge: (hash: string) => void;
  readonly scrolled: (
    root: string | undefined,
    hash: string,
    offset: number,
    report: number,
  ) => void;
  readonly loadCommits: (
    start: number,
    count: number,
    generation: number,
  ) => void;
  readonly loadFileDiff: (path: string) => void;
  readonly loadTexts: (requests: readonly TextRequest[]) => void;
  readonly viewFile: (source: ViewedSource) => void;
  readonly requestTree: (hash: string) => void;
  readonly openRepository: (root: string) => void;
  readonly browseRepositories: () => void;
  readonly openClone: () => void;
  readonly initRepository: () => void;
  readonly checkCloneTarget: (folder: string, name: string) => () => void;
  readonly chooseCloneFolder: (folder: string) => void;
  readonly startClone: (ask: CloneAsk) => void;
  readonly stopClone: () => void;
  readonly selectWorktree: (root: string) => void;
  readonly preloadWorktree: (root: string) => void;
  readonly activateColumn: (column: ColumnName) => void;
  readonly filterFiles: (
    filter: string | undefined,
    options?: SearchOptions,
  ) => void;
  readonly searchFor: (query: string, options?: SearchOptions) => void;
  readonly toggleFolder: (kind: keyof Folders, folder: string) => void;
  readonly replaceFolders: (folders: Folders) => void;
  readonly foldFilesWhileFiltering: (folds: FilterFolds) => void;
  readonly moveFilesCursor: (cursor: MovedCursor | undefined) => void;
  readonly pinMessage: (pin: KeptPin | undefined) => void;
  readonly keepLocations: (kept: KeptLocations) => void;
  readonly locationsScrollOf: () => number | undefined;
  readonly keepLocationsScroll: (offset: number) => void;
  readonly filesScrollOf: (view: string) => number | undefined;
  readonly keepFilesScroll: (view: string, offset: number) => void;
  readonly toggleCommits: () => void;
  readonly search: (open: boolean) => void;
  readonly checkout: (target: CheckoutTarget) => void;
  readonly toggleBookmark: (bookmark: Bookmark) => void;
  readonly menuItems: (target: MenuTarget) => ContextMenuItem[];
  readonly pickLanguage: (
    key: string | undefined,
    language: string | undefined,
  ) => void;
  readonly seeLanguageKey: (key: string | undefined) => void;
  readonly keepDiffFind: (scope: string, find: KeptFind) => void;
  readonly keptFocusOf: (scope: string) => KeptFocus | undefined;
  readonly keepFocus: (scope: string, focus: KeptFocus | undefined) => void;
  readonly closeDiffFind: (scope: string) => void;
  readonly diffPlaceOf: (
    scope: string,
    selection: string,
  ) => DiffPlace | undefined;
  readonly keepDiffPlace: (
    scope: string,
    selection: string,
    change: Partial<DiffPlace>,
  ) => void;
  readonly measureDiffText: (measures: TextMeasures) => void;
  readonly snapDiffCode: (snap: (last: CodeSnap) => CodeSnap) => void;
  readonly keepWrapColumns: (columns: WrapColumns) => void;
}

export const noComparedTexts: ComparedTexts = {
  tab: undefined,
  texts: new Map(),
};

export const gitDefaults: GitSource = {
  tab: emptyTabView,
  worktrees: undefined,
  bookmarks: [],
  hideDimmed: false,
  columnWidths: [],
  defaultColumnWidths: [],
  collapseMerges: false,
  showEntireFile: false,
  ignoreWhitespace: false,
  diffLayout: 'sideBySide',
  showAllFiles: false,
  autoFetch: false,
  autoFetchMinutes: 0,
  solo: false,
  compare: undefined,
  compareTexts: noComparedTexts,
  recent: [],
  initAsked: undefined,
  clone: { view: undefined, form: 0, folder: undefined, target: undefined },
  lastFetch: {},
  commitsHidden: new Set(),
  searching: new Set(),
  pickedLanguages: new Map(),
  activeColumns: new Map(),
  fileFilters: new Map(),
  searches: new Map(),
  diffFinds: new Map(),
  foundCommits: new Map(),
  folders: new Map(),
  fileFolds: new Map(),
  fileCursors: new Map(),
  pinnedMessages: new Map(),
  locations: new Map(),
  diffText: undefined,
  diffSnap: { inline: 0, left: 0, right: 0 },
  wrapColumns: undefined,
};

export type GitData = GitSource & GitCollections;

export type GitState = GitData & GitActions;
