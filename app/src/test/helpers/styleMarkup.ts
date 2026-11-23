import type {
  RepositoryState,
  WorktreeInfo,
} from '../../tools/git/shared/protocol';
import { createElement } from 'react';
import { scrollbarCoverClass } from '../../lib/page/scrollbars';
import {
  allWithClass,
  rendered,
  renderedApart,
  withClass,
  type MarkupElement,
} from './markup';

export const worktree = (name: string): WorktreeInfo => ({
  root: `/${name}`,
  name,
  folder: name,
  main: false,
  missing: false,
});

export const repository: RepositoryState = {
  head: 'main',
  headCommit: 'a',
  refs: [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'tag', name: 'v1', commit: 'a' },
    { kind: 'remote-tag', name: 'origin/v1', commit: 'a', remote: 'origin' },
  ],
  stashes: [{ name: 'stash@{0}', commit: 'b', message: 'WIP on main' }],
};

export function columnTitle(column: React.ReactElement): MarkupElement {
  return withClass(rendered(column), 'column-title');
}

export function diffView(
  view: React.ReactElement,
  ...rows: React.ReactElement[]
): MarkupElement {
  const shown = rendered(view);
  const spacer = withClass(shown, 'virtual-spacer');
  for (const row of rows) {
    rendered(row, spacer);
  }
  return shown;
}

export function shownRows(view: MarkupElement): MarkupElement[] {
  return allWithClass(view, 'virtual-row', 'diff-row').filter(
    (row) => !row.classes.includes('diff-ruler'),
  );
}

export function shownRow(view: MarkupElement): MarkupElement {
  const [row] = shownRows(view);
  if (row === undefined) {
    throw new Error('The diff shows no row');
  }
  return row;
}

export function bubbles(sources: React.ReactElement): MarkupElement[] {
  return renderedApart(sources).flatMap((source) =>
    allWithClass(source, 'badge'),
  );
}

export function popupOf(popup: React.ReactElement): MarkupElement {
  return withClass(rendered(popup), 'shortcuts-popup');
}

export function scrollbarCover(classes = ''): MarkupElement {
  return rendered(
    createElement('div', {
      className: `${scrollbarCoverClass} vertical ${classes}`,
    }),
  );
}

export function keyOf(element: MarkupElement): MarkupElement | undefined {
  return element.tag === 'kbd'
    ? element
    : element.children.map(keyOf).find((key) => key !== undefined);
}
