import * as assert from 'node:assert';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { createShellStore, ShellStore } from '../shell/page/store';
import type { ToHost } from '../shell/shared/protocol';
import { preloadDelay } from '../shell/page/tabBar';
import { createGitStore, GitStore } from '../tools/git/page/store';
import { defaultTextView } from '../ui/textView';
import { emptyTabView, type TabView } from '../tools/git/page/tabView';
import { FileRow } from '../tools/git/page/tree';
import type {
  Bookmark,
  DiffLayout,
  GitToHost,
  LastFetch,
  RefInfo,
  WorktreeInfo,
} from '../tools/git/shared/protocol';

export interface RowProps {
  className: string;
  onClick: () => void;
}

export function clickFile(row: React.ReactElement) {
  assert.strictEqual(row.type, FileRow);
  assert.ok(isValidElement<Parameters<typeof FileRow>[0]>(row));
  const drawn = FileRow(row.props);
  assert.ok(isValidElement<RowProps>(drawn));
  drawn.props.onClick();
}

export const rested = () => vi.advanceTimersByTime(preloadDelay);

export interface ShownGit {
  readonly head?: string;
  readonly headCommit?: string;
  readonly autoFetch?: boolean;
  readonly autoFetchMinutes?: number;
  readonly lastFetch?: LastFetch;
  readonly worktrees?: readonly WorktreeInfo[];
  readonly refs?: readonly RefInfo[];
  readonly tagRemote?: string;
  readonly bookmarks?: readonly Bookmark[];
  readonly hideDimmed?: boolean;
  readonly elsewhere?: readonly string[];
  readonly tab?: Partial<TabView>;
}

export function gitStore(
  {
    head,
    headCommit,
    autoFetch = false,
    autoFetchMinutes = 0,
    lastFetch = {},
    worktrees,
    refs = [],
    tagRemote,
    bookmarks = [],
    hideDimmed = false,
    elsewhere = [],
    tab = {},
  }: ShownGit = {},
  post: (message: GitToHost) => void = () => undefined,
) {
  return createGitStore(post, {
    tab: {
      ...emptyTabView,
      repository: {
        head,
        headCommit,
        refs,
        stashes: [],
        ...(tagRemote === undefined ? {} : { tagRemote }),
      },
      ...tab,
    },
    bookmarks,
    hideDimmed,
    autoFetch,
    autoFetchMinutes,
    lastFetch,
    worktrees:
      worktrees ??
      elsewhere.map((name) => ({
        root: `/${name}`,
        name,
        folder: `/${name}`,
        main: false,
        missing: false,
      })),
  });
}

export interface ShownOptions {
  readonly entire?: boolean;
  readonly showWhitespace?: boolean;
  readonly ignoreWhitespace?: boolean;
  readonly wordWrap?: boolean;
  readonly layout?: DiffLayout;
}

export function optionStores(
  shown: ShownOptions = {},
  post: (message: GitToHost | ToHost) => void = () => undefined,
) {
  return {
    git: createGitStore(post, {
      showEntireFile: shown.entire ?? false,
      ignoreWhitespace: shown.ignoreWhitespace ?? true,
      diffLayout: shown.layout ?? 'inline',
    }),
    shell: createShellStore(post, {
      textView: {
        ...defaultTextView,
        showWhitespace: shown.showWhitespace ?? false,
        wordWrap: shown.wordWrap ?? false,
      },
    }),
  };
}

export function inStores(
  { git, shell }: ReturnType<typeof optionStores>,
  node: React.ReactNode,
): React.ReactElement {
  return createElement(
    ShellStore,
    { value: shell },
    createElement(GitStore, { value: git }, node),
  );
}

export function renderedInGit<P>(
  store: ReturnType<typeof createGitStore>,
  component: (props: P) => React.ReactNode,
  props: P,
): React.ReactNode {
  let rendered: React.ReactNode;
  function Probe() {
    rendered = component(props);
    return null;
  }
  renderToStaticMarkup(
    createElement(GitStore, { value: store }, createElement(Probe)),
  );
  return rendered;
}
