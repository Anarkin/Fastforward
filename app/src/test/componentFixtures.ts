import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { vi } from 'vitest';
import { preloadDelay } from '../shell/page/tabBar';
import { createGitStore } from '../tools/git/page/store';
import { emptyTabView, type TabView } from '../tools/git/page/tabView';
import { FileRow } from '../tools/git/page/tree';
import type {
  Bookmark,
  GitToHost,
  RefInfo,
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
        headCommit: undefined,
        refs,
        stashes: [],
        ...(tagRemote === undefined ? {} : { tagRemote }),
      },
      ...tab,
    },
    bookmarks,
    hideDimmed,
    worktrees: elsewhere.map((name) => ({
      root: `/${name}`,
      name,
      folder: `/${name}`,
      main: false,
      missing: false,
    })),
  });
}
